module.exports = function registerNetWorthHandler(bot, deps) {

  bot.onText(/^\/networth(@\w+)?$/, (msg) => {
    try {

      const result = deps.financeEngine.calculateNetWorth();

      const assets = result.assets || 0;
      const liabilities = result.liabilities || 0;
      const netWorth = result.netWorth || 0;

      let output = "💰 Net Worth\n\n";
      output += `Assets: ${assets.toFixed(2)}\n`;
      output += `Liabilities: ${liabilities.toFixed(2)}\n`;
      output += `Net Worth: ${netWorth.toFixed(2)}\n`;

      bot.sendMessage(msg.chat.id, output);

    } catch (err) {
      console.error("Net worth error:", err);
      bot.sendMessage(msg.chat.id, "Error calculating net worth.");
    }
  });

};
