// handlers/cashflow.js
module.exports = function registerCashflowHandler(bot, deps) {
  const { db, format, finance } = deps;
  const { formatMoney, codeBlock } = format;
  const { getRecurringMonthlyNet, monthlyMultiplier } = finance;

  function extractBankAmount(postings_json) {
    try {
      const postings = JSON.parse(postings_json);
      if (!Array.isArray(postings)) return null;

      const bank = postings.find((p) => p.account === "assets:bank");
      if (!bank) return null;

      const amt = Number(bank.amount);
      return Number.isFinite(amt) ? amt : null;
    } catch {
      return null;
    }
  }

  function renderHelp() {
    return [
      "*\\/cashflow*",
      "Show recurring monthly income versus recurring monthly bills.",
      "",
      "*Usage*",
      "- `/cashflow`",
      "- `/cashflow detail`",
      "",
      "*Examples*",
      "- `/cashflow`",
      "- `/cashflow detail`",
      "",
      "*Notes*",
      "- Default mode shows a compact recurring monthly summary.",
      "- `detail` shows recurring bill and income line items."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/cashflow(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();
    const arg = raw.toLowerCase();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      if (arg !== "detail") {
        return bot.sendMessage(
          chatId,
          [
            "Usage:",
            "`/cashflow`",
            "`/cashflow detail`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }
    }

    try {
      const rows = db.prepare(`
        SELECT id, hash, description, postings_json, frequency, next_due_date
        FROM recurring_transactions
        ORDER BY id ASC
      `).all();

      if (!rows.length) {
        return bot.sendMessage(chatId, "No recurring items saved yet.");
      }

      const recurring = getRecurringMonthlyNet(db);
      const net = recurring.net;

      if (arg !== "detail") {
        const out = [
          "📊 *Monthly Cashflow (Recurring)*",
          "",
          codeBlock([
            `Recurring Income  ${formatMoney(recurring.income)}`,
            `Recurring Bills   ${formatMoney(recurring.bills)}`,
            `Net Monthly       ${net >= 0 ? "+" : "-"}${formatMoney(Math.abs(net))}`
          ].join("\n"))
        ].join("\n");

        return bot.sendMessage(chatId, out, {
          parse_mode: "Markdown"
        });
      }

      let income = 0;
      let bills = 0;
      const lines = [];

      for (const r of rows) {
        const mult = monthlyMultiplier(r.frequency);
        if (!mult) continue;

        const bankAmt = extractBankAmount(r.postings_json);
        if (bankAmt == null) continue;

        const monthly = bankAmt * mult;
        const kind = monthly >= 0 ? "income" : "bill";
        const absMonthly = Math.abs(monthly);

        if (kind === "income") income += absMonthly;
        else bills += absMonthly;

        lines.push({
          id: r.id,
          ref: String(r.hash || "").slice(0, 6),
          description: r.description,
          frequency: r.frequency,
          next: r.next_due_date,
          kind,
          monthly: absMonthly
        });
      }

      const billsLines = lines.filter((l) => l.kind === "bill");
      const incomeLines = lines.filter((l) => l.kind === "income");

      let out = [
        "🧾 *Monthly Cashflow Detail (Recurring)*",
        "",
        codeBlock([
          `Income  ${formatMoney(income)}`,
          `Bills   ${formatMoney(bills)}`,
          `Net     ${income - bills >= 0 ? "+" : "-"}${formatMoney(Math.abs(income - bills))}`
        ].join("\n"))
      ].join("\n");

      if (billsLines.length) {
        out += "\n\nBills:\n";
        out += codeBlock(
          billsLines.map((l) =>
            `- ${formatMoney(l.monthly)}  ${l.description}  (${l.frequency}) next:${l.next}  #${l.id} ${l.ref}`
          ).join("\n")
        );
      }

      if (incomeLines.length) {
        out += "\n\nIncome:\n";
        out += codeBlock(
          incomeLines.map((l) =>
            `+ ${formatMoney(l.monthly)}  ${l.description}  (${l.frequency}) next:${l.next}  #${l.id} ${l.ref}`
          ).join("\n")
        );
      }

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("Cashflow error:", err);
      return bot.sendMessage(chatId, "Error calculating cashflow.");
    }
  });
};

module.exports.help = {
  command: "cashflow",
  category: "Spending",
  summary: "Show recurring monthly income vs bills.",
  usage: [
    "/cashflow",
    "/cashflow detail"
  ],
  examples: [
    "/cashflow",
    "/cashflow detail"
  ],
  notes: [
    "Default mode shows a compact recurring monthly summary.",
    "`detail` shows recurring bill and income line items."
  ]
};
