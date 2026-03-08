// handlers/untilpayday.js
module.exports = function registerUntilPaydayHandler(bot, deps) {
  const { db, simulateCashflow } = deps;

  function money(n) {
    return `$${(Number(n) || 0).toFixed(2)}`;
  }

  bot.onText(/^\/untilpayday(@\w+)?$/i, (msg) => {
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
        SELECT IFNULL(SUM(amount),0) as balance
        FROM postings
        WHERE account_id = ?
      `).get(checking.id);

      const currentBalance = Number(balanceRow?.balance) || 0;

      // find next income event
      const recurring = db.prepare(`
        SELECT description, postings_json, next_due_date
        FROM recurring_transactions
      `).all();

      let nextIncome = null;

      for (const r of recurring) {
        try {
          const postings = JSON.parse(r.postings_json);
          const bank = postings.find(p => p.account === "assets:bank");

          if (bank && Number(bank.amount) > 0) {
            const date = new Date(r.next_due_date);

            if (!nextIncome || date < nextIncome.date) {
              nextIncome = {
                date,
                description: r.description,
                amount: Number(bank.amount)
              };
            }
          }
        } catch { }
      }

      if (!nextIncome) {
        return bot.sendMessage(chatId, "No upcoming income found.");
      }

      const today = new Date();
      const days =
        Math.ceil((nextIncome.date - today) / (1000 * 60 * 60 * 24)) + 1;

      const result = simulateCashflow(db, currentBalance, checking.id, days);

      let balanceBeforePayday = currentBalance;

      for (const event of result.timeline) {
        if (new Date(event.date) < nextIncome.date) {
          balanceBeforePayday = event.balance;
        }
      }

      let out = "💵 Until Payday\n\n";
      out += "```\n";
      out += `Current Balance:   ${money(currentBalance)}\n`;
      out += `Lowest Before Pay: ${money(result.lowestBalance)}\n`;
      out += `Balance Pre-Pay:   ${money(balanceBeforePayday)}\n`;
      out += `Next Income:       ${money(nextIncome.amount)}\n`;
      out += `Payday:            ${nextIncome.date.toISOString().slice(0, 10)}\n`;
      out += "```";

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });

    } catch (err) {
      console.error("untilpayday error:", err);
      return bot.sendMessage(chatId, "Error calculating payday projection.");
    }
  });
};
