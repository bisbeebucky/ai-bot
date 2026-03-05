// handlers/withdraw.js
module.exports = function registerWithdrawHandler(bot, deps) {
  const { ledgerService } = deps;

  // /withdraw 50 groceries
  bot.onText(/^\/withdraw\s+(\d+(\.\d+)?)(?:\s+(.+))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const amount = Number(match[1]);
    const desc = (match[3] || "withdraw").trim();
    const date = new Date().toISOString().slice(0, 10);

    try {
      ledgerService.addTransaction({
        date,
        description: desc,
        postings: [
          { account: "expenses:misc", amount: amount },
          { account: "assets:bank", amount: -amount }
        ]
      });

      return bot.sendMessage(chatId, `✅ Withdrew $${amount.toFixed(2)} (${desc})`);
    } catch (err) {
      console.error("Withdraw error:", err);
      return bot.sendMessage(chatId, "Withdraw failed.");
    }
  });
};
