// handlers/deposit.js
module.exports = function registerDepositHandler(bot, deps) {
  const { ledgerService } = deps;

  // /deposit 5000 windfall
  bot.onText(/^\/deposit\s+(\d+(\.\d+)?)(?:\s+(.+))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const amount = Number(match[1]);
    const desc = (match[3] || "deposit").trim();
    const date = new Date().toISOString().slice(0, 10);

    try {
      ledgerService.addTransaction({
        date,
        description: desc,
        postings: [
          { account: "assets:bank", amount: amount },
          { account: "income:windfall", amount: -amount }
        ]
      });

      return bot.sendMessage(chatId, `✅ Deposited $${amount.toFixed(2)} (${desc})`);
    } catch (err) {
      console.error("Deposit error:", err);
      return bot.sendMessage(chatId, "Deposit failed.");
    }
  });
};
