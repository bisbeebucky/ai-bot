// handlers/cashflow_detail.js
module.exports = function registerCashflowDetailHandler(bot, deps) {
  const { db } = deps;

  function extractBankAmount(postings_json) {
    try {
      const postings = JSON.parse(postings_json);
      if (!Array.isArray(postings)) return null;

      const bank = postings.find(p => p.account === "assets:bank");
      if (!bank) return null;

      const amt = Number(bank.amount);
      return Number.isFinite(amt) ? amt : null;
    } catch {
      return null;
    }
  }

  function monthlyMultiplier(freq) {
    switch ((freq || "").toLowerCase()) {
      case "daily":
        return 30;
      case "weekly":
        return 4.33;
      case "monthly":
        return 1;
      case "yearly":
        return 1 / 12;
      default:
        return 0;
    }
  }

  bot.onText(/^\/cashflow_detail(@\w+)?$/i, (msg) => {
    const chatId = msg.chat.id;

    try {
      const rows = db.prepare(`
        SELECT id, hash, description, postings_json, frequency, next_due_date
        FROM recurring_transactions
        ORDER BY id ASC
      `).all();

      if (!rows.length) return bot.sendMessage(chatId, "No recurring items saved.");

      let income = 0;
      let bills = 0;

      const lines = [];

      for (const r of rows) {
        const mult = monthlyMultiplier(r.frequency);
        if (!mult) continue;

        const bankAmt = extractBankAmount(r.postings_json);
        if (bankAmt == null) continue;

        // bankAmt positive => income into bank
        // bankAmt negative => bill out of bank
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

      const net = income - bills;

      let out = "🧾 Monthly Cashflow Detail (Recurring)\n\n";
      out += `Income: $${income.toFixed(2)}\n`;
      out += `Bills:  $${bills.toFixed(2)}\n`;
      out += `Net:    ${net >= 0 ? "+" : "-"}$${Math.abs(net).toFixed(2)}\n\n`;

      // Bills first, then income (usually easiest to read)
      const billsLines = lines.filter(l => l.kind === "bill");
      const incomeLines = lines.filter(l => l.kind === "income");

      if (billsLines.length) {
        out += "Bills:\n";
        for (const l of billsLines) {
          out += `- $${l.monthly.toFixed(2)}  ${l.description}  (${l.frequency}) next:${l.next}  #${l.id} ${l.ref}\n`;
        }
        out += "\n";
      }

      if (incomeLines.length) {
        out += "Income:\n";
        for (const l of incomeLines) {
          out += `+ $${l.monthly.toFixed(2)}  ${l.description}  (${l.frequency}) next:${l.next}  #${l.id} ${l.ref}\n`;
        }
      }

      return bot.sendMessage(chatId, out);
    } catch (err) {
      console.error("Cashflow detail error:", err);
      return bot.sendMessage(chatId, "Error generating cashflow detail.");
    }
  });
};
