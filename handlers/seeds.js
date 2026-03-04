// handlers/seed.js
module.exports = function registerSeedHandler(bot, deps) {
  const { ledgerService } = deps;

  // /seed 1000
  bot.onText(/^\/seed(@\w+)?\s+(\d+(\.\d+)?)$/, (msg, match) => {
    const chatId = msg.chat.id;

    try {
      const amount = Number(match[2]);
      if (!Number.isFinite(amount) || amount <= 0) {
        return bot.sendMessage(chatId, "Usage: /seed 1000");
      }

      const today = new Date().toISOString().slice(0, 10);

      ledgerService.addTransaction({
        date: today,
        description: "Opening Balance",
        postings: [
          { account: "assets:bank", amount: amount },
          { account: "income:opening_balance", amount: -amount }
        ]
      });

      return bot.sendMessage(chatId, `✅ Seeded assets:bank with $${amount.toFixed(2)}`);
    } catch (err) {
      console.error("Seed error:", err);
      return bot.sendMessage(chatId, "Error seeding balance.");
    }
  });
};
