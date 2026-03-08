// handlers/endmonth.js
module.exports = function registerEndMonthHandler(bot, deps) {
  const { db, simulateCashflow } = deps;

  function money(n) {
    return `$${(Number(n) || 0).toFixed(2)}`;
  }

  bot.onText(/^\/endmonth(@\w+)?$/i, (msg) => {
    const chatId = msg.chat.id;

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
      const result = simulateCashflow(db, currentBalance, checking.id, 30);

      let recurringIncome = 0;
      let recurringBills = 0;

      for (const event of result.timeline) {
        const amt = Number(event.amount) || 0;
        if (amt > 0) recurringIncome += amt;
        if (amt < 0) recurringBills += Math.abs(amt);
      }

      const endingBalance =
        result.timeline.length > 0
          ? Number(result.timeline[result.timeline.length - 1].balance) || currentBalance
          : currentBalance;

      let out = "📅 End of Month\n\n";
      out += "```\n";
      out += `Current Balance:   ${money(currentBalance)}\n`;
      out += `Recurring Income:  ${money(recurringIncome)}\n`;
      out += `Recurring Bills:   ${money(recurringBills)}\n`;
      out += `Ending Balance:    ${money(endingBalance)}\n`;
      out += `Lowest Balance:    ${money(result.lowestBalance)}\n`;
      out += "```";

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("endmonth error:", err);
      return bot.sendMessage(chatId, "Error generating end-of-month summary.");
    }
  });
};
