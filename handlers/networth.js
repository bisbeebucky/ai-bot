module.exports = function registerNetWorthHandler(bot, deps) {
  const { ledgerService } = deps;

  bot.onText(/^\/networth(@\w+)?$/, (msg) => {
    const chatId = msg.chat.id;

    try {
      const balances = ledgerService.getBalances();

      let assets = 0;
      let liabilities = 0;

      for (const b of balances) {
        const amt = Number(b.balance) || 0;
        if (String(b.account).startsWith("assets:")) assets += amt;
        if (String(b.account).startsWith("liabilities:")) liabilities += amt;
      }

      const netWorth = assets - liabilities;

      const out =
        `🏛️ Net Worth\n\n` +
        `Assets: $${assets.toFixed(2)}\n` +
        `Liabilities: $${liabilities.toFixed(2)}\n\n` +
        `Net Worth: $${netWorth.toFixed(2)}`;

      return bot.sendMessage(chatId, out);
    } catch (err) {
      console.error("Networth error:", err);
      return bot.sendMessage(chatId, "Net worth error.");
    }
  });
};
