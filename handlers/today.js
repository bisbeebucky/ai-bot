// handlers/today.js
module.exports = function registerTodayHandler(bot, deps) {
  const { db, simulateCashflow } = deps;

  function money(n) {
    return `$${(Number(n) || 0).toFixed(2)}`;
  }

  bot.onText(/^\/today(@\w+)?$/i, (msg) => {
    const chatId = msg.chat.id;

    try {
      const checking = db.prepare(`
        SELECT id FROM accounts
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
      const result = simulateCashflow(db, currentBalance, checking.id, 30);

      let lowestEvent = null;
      for (const e of result.timeline) {
        if (!lowestEvent || Number(e.balance) < Number(lowestEvent.balance)) {
          lowestEvent = e;
        }
      }

      const recurring = db.prepare(`
        SELECT description, postings_json, next_due_date
        FROM recurring_transactions
      `).all();

      let nextIncome = null;

      for (const r of recurring) {
        try {
          const postings = JSON.parse(r.postings_json);
          const bankLine = Array.isArray(postings)
            ? postings.find(p => p.account === "assets:bank")
            : null;

          if (bankLine && Number(bankLine.amount) > 0) {
            const d = new Date(r.next_due_date);
            if (!nextIncome || d < nextIncome.date) {
              nextIncome = {
                date: d,
                amount: Number(bankLine.amount)
              };
            }
          }
        } catch { }
      }

      const lowBal = lowestEvent ? Number(lowestEvent.balance) || 0 : currentBalance;

      const status =
        lowBal < 0 ? "❌ Overdraft risk"
          : lowBal < 100 ? "⚠️ Tight but safe"
            : "✅ Safe";

      let out = "☀️ Today\n\n";
      out += "```\n";
      out += `Bank:         ${money(currentBalance)}\n`;
      out += `Lowest Ahead: ${money(lowBal)}\n`;

      if (nextIncome) {
        out += `Next Income:  ${money(nextIncome.amount)} on ${nextIncome.date.toISOString().slice(0, 10)}\n`;
      }

      out += `Status:       ${status}\n`;
      out += "```";

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("today error:", err);
      return bot.sendMessage(chatId, "Error generating today summary.");
    }
  });
};
