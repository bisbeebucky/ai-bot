// handlers/forecast.js
module.exports = function registerForecastHandler(bot, deps) {
  const { db, simulateCashflow } = deps;

  bot.onText(/^\/forecast(@\w+)?$/, (msg) => {
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
        SELECT SUM(amount) as balance
        FROM postings
        WHERE account_id = ?
      `).get(checking.id);

      const currentBalance = Number(balanceRow?.balance) || 0;

      const result = simulateCashflow(db, currentBalance, checking.id, 30);

      let output = "📊 30-Day Forecast\n\n";
      output += `Starting Balance: ${currentBalance.toFixed(2)}\n\n`;

      for (const event of result.timeline) {
        output += `${event.date} | ${event.description} → ${event.balance.toFixed(2)}\n`;
      }

      return bot.sendMessage(chatId, output);

    } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, "Forecast error.");
    }
  });
};
