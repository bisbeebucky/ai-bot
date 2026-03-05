// handlers/accounts.js
module.exports = function registerAccountsHandler(bot, deps) {
  const { ledgerService } = deps;

  bot.onText(/^\/accounts(@\w+)?$/, (msg) => {
    const chatId = msg.chat.id;

    try {
      const balances = ledgerService.getBalances();

      if (!balances || balances.length === 0) {
        return bot.sendMessage(chatId, "No accounts found.");
      }

      let output = "📒 Account Balances\n\n";

      for (const b of balances) {
        const amount = Number(b.balance) || 0;

        output += `${b.account.padEnd(20)} ${amount.toFixed(2)}\n`;
      }

      return bot.sendMessage(chatId, output);
    } catch (err) {
      console.error("Accounts error:", err);
      return bot.sendMessage(chatId, "Error retrieving accounts.");
    }
  });
};
