// handlers/whatif.js
module.exports = function registerWhatIfHandler(bot, deps) {
  const { db, simulateCashflow } = deps;

  bot.onText(/^\/whatif(@\w+)?\s+(\d+(\.\d+)?)$/, (msg, match) => {
    const chatId = msg.chat.id;

    try {
      const spend = Number(match[2]);
      if (!Number.isFinite(spend) || spend < 0) {
        return bot.sendMessage(chatId, "Usage: /whatif 50");
      }

      const checking = db
        .prepare(`SELECT id FROM accounts WHERE name = 'assets:bank'`)
        .get();

      if (!checking) {
        return bot.sendMessage(chatId, "assets:bank account not found.");
      }

      const row = db
        .prepare(
          `SELECT IFNULL(SUM(amount), 0) as balance
           FROM postings
           WHERE account_id = ?`
        )
        .get(checking.id);

      const currentBalance = Number(row?.balance) || 0;

      const result = simulateCashflow(
        db,
        currentBalance - spend,
        checking.id,
        30
      );

      // Find first negative day (if any)
      let firstNegativeDate = null;
      if (Array.isArray(result.timeline)) {
        const neg = result.timeline.find((e) => Number(e.balance) < 0);
        if (neg) firstNegativeDate = neg.date;
      }

      let reply =
        `💸 What-if spend: $${spend.toFixed(2)}\n` +
        `Starting balance: $${currentBalance.toFixed(2)}\n` +
        `Lowest 30-day balance: $${Number(result.lowestBalance).toFixed(2)}\n`;

      if (firstNegativeDate) {
        reply += `First negative date: ${firstNegativeDate}\n\n⚠️ Overdraft risk detected in the next 30 days.`;
      } else {
        reply += `\n✅ No overdraft risk in the next 30 days.`;
      }

      return bot.sendMessage(chatId, reply);
    } catch (err) {
      console.error("What-if error:", err);
      return bot.sendMessage(chatId, "Simulation failed.");
    }
  });
};
