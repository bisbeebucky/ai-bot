module.exports = function registerWhatIfHandler(bot, deps) {

  const { db, simulateCashflow } = deps;

  bot.onText(/^\/whatif (\d+(\.\d+)?)$/, (msg, match) => {

    const chatId = msg.chat.id;   // ✅ keep this
    const spend = Number(match[1]);

    try {

      const checking = db.prepare(`
        SELECT id FROM accounts
        WHERE name = 'assets:bank'
      `).get();

      if (!checking) {
        return bot.sendMessage(chatId, "assets:bank account not found.");
      }

      const balanceRow = db.prepare(`
        SELECT SUM(amount) as balance
        FROM postings
        WHERE account_id = ?
      `).get(checking.id);

      const currentBalance = Number(balanceRow?.balance) || 0;

      const result = simulateCashflow(
        db,
        currentBalance - spend,
        checking.id,
        30
      );

      let reply = `After spending ${spend.toFixed(2)}:\n`;
      reply += `Lowest 30-day balance: ${result.lowestBalance.toFixed(2)}\n\n`;

      if (result.lowestBalance < 0) {
        reply += "⚠️ Overdraft risk detected.";
      } else {
        reply += "✅ No overdraft risk.";
      }

      bot.sendMessage(chatId, reply);

    } catch (err) {
      console.error("What-if error:", err);
      bot.sendMessage(chatId, "Simulation failed.");
    }

  });

};
