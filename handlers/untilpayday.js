// handlers/untilpayday.js
module.exports = function registerUntilPaydayHandler(bot, deps) {
  const { db, simulateCashflow, format } = deps;
  const { formatMoney, codeBlock } = format;

  function renderHelp() {
    return [
      "*\\/untilpayday*",
      "Estimate how your bank balance looks until the next recurring income event.",
      "",
      "*Usage*",
      "- `/untilpayday`",
      "",
      "*Examples*",
      "- `/untilpayday`",
      "",
      "*Notes*",
      "- Finds the next recurring item that increases `assets:bank`.",
      "- Uses `simulateCashflow` to project the balance until that date."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  function parseLocalDate(dateStr) {
    const s = String(dateStr || "").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;

    const year = Number(m[1]);
    const monthIndex = Number(m[2]) - 1;
    const day = Number(m[3]);

    const d = new Date(year, monthIndex, day);
    d.setHours(12, 0, 0, 0);
    return d;
  }

  bot.onText(/^\/untilpayday(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/untilpayday` command does not take arguments.",
          "",
          "Usage:",
          "`/untilpayday`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    try {
      const checking = db.prepare(`
        SELECT id
        FROM accounts
        WHERE name = 'assets:bank'
      `).get();

      if (!checking) {
        return bot.sendMessage(chatId, "Checking account not found.");
      }

      const balanceRow = db.prepare(`
        SELECT IFNULL(SUM(amount), 0) as balance
        FROM postings
        WHERE account_id = ?
      `).get(checking.id);

      const currentBalance = Number(balanceRow?.balance) || 0;

      const recurring = db.prepare(`
        SELECT description, postings_json, next_due_date
        FROM recurring_transactions
      `).all();

      let nextIncome = null;

      for (const row of recurring) {
        try {
          const postings = JSON.parse(row.postings_json);
          const bank = Array.isArray(postings)
            ? postings.find((p) => p.account === "assets:bank")
            : null;

          if (bank && Number(bank.amount) > 0) {
            const date = parseLocalDate(row.next_due_date);
            if (!date) continue;

            if (!nextIncome || date < nextIncome.date) {
              nextIncome = {
                date,
                description: String(row.description || ""),
                amount: Number(bank.amount) || 0,
                next_due_date: String(row.next_due_date || "")
              };
            }
          }
        } catch (_) {
          // ignore malformed recurring rows
        }
      }

      if (!nextIncome) {
        return bot.sendMessage(chatId, "No upcoming income found.");
      }

      const today = new Date();
      today.setHours(12, 0, 0, 0);

      const days = Math.max(
        1,
        Math.ceil((nextIncome.date - today) / (1000 * 60 * 60 * 24)) + 1
      );

      const result = simulateCashflow(db, currentBalance, checking.id, days);
      const timeline = Array.isArray(result?.timeline) ? result.timeline : [];

      let balanceBeforePayday = currentBalance;

      for (const event of timeline) {
        const eventDate = parseLocalDate(event.date);
        if (eventDate && eventDate < nextIncome.date) {
          balanceBeforePayday = Number(event.balance) || 0;
        }
      }

      const lowestBeforePay = Number(result?.lowestBalance) || currentBalance;

      let statusLine;
      let summaryLine;

      if (lowestBeforePay < 0) {
        statusLine = "🔴 *Status: Danger*";
        summaryLine = "You are likely to go negative before payday unless something changes.";
      } else if (lowestBeforePay < 100) {
        statusLine = "🟡 *Status: Tight*";
        summaryLine = "You stay positive, but your safety margin is thin.";
      } else {
        statusLine = "🟢 *Status: Safe*";
        summaryLine = "Your forecast looks stable through payday.";
      }

      const out = [
        "💵 *Until Payday*",
        "",
        statusLine,
        summaryLine,
        "",
        codeBlock([
          `Current Balance    ${formatMoney(currentBalance)}`,
          `Lowest Before Pay  ${formatMoney(lowestBeforePay)}`,
          `Balance Pre-Pay    ${formatMoney(balanceBeforePayday)}`,
          `Next Income        ${formatMoney(nextIncome.amount)}`,
          `Income Source      ${nextIncome.description || "income"}`,
          `Payday             ${nextIncome.next_due_date}`,
          `Days Remaining     ${days}`
        ].join("\n"))
      ].join("\n");

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("untilpayday error:", err);
      return bot.sendMessage(chatId, "Error calculating payday projection.");
    }
  });
};

module.exports.help = {
  command: "untilpayday",
  category: "Forecasting",
  summary: "Estimate how your bank balance looks until the next recurring income event.",
  usage: [
    "/untilpayday"
  ],
  examples: [
    "/untilpayday"
  ],
  notes: [
    "Finds the next recurring item that increases `assets:bank`.",
    "Uses `simulateCashflow` to project the balance until that date."
  ]
};
