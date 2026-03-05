module.exports = function registerBalanceHandler(bot, deps) {
  const { db } = deps;

  bot.onText(/^\/balance(@\w+)?$/, (msg) => {
    try {
      const checking = db
        .prepare(`SELECT id FROM accounts WHERE name = 'assets:bank'`)
        .get();

      if (!checking) {
        return bot.sendMessage(msg.chat.id, "assets:bank account not found.");
      }

      const row = db
        .prepare(`SELECT IFNULL(SUM(amount), 0) AS balance FROM postings WHERE account_id = ?`)
        .get(checking.id);

      const balance = Number(row?.balance) || 0;

      return bot.sendMessage(
        msg.chat.id,
        `💰 Current Balance (assets:bank): $${balance.toFixed(2)}`
      );
    } catch (err) {
      console.error("Balance error:", err);
      return bot.sendMessage(msg.chat.id, "Balance error.");
    }
  });
};
