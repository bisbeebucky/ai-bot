module.exports = function registerAddHandler(bot, deps) {
  const { ledgerService } = deps;

  bot.onText(/^\/add (.+) (\d+(\.\d+)?)$/, (msg, match) => {
    try {
      const description = match[1];
      const amount = parseFloat(match[2]);
      const date = new Date().toISOString().slice(0, 10);

      const result = ledgerService.addTransaction({	    
        date,
        description,
        postings: [
          { account: "expenses:food", amount },
          { account: "assets:bank", amount: -amount }
        ]
      });

      return bot.sendMessage(msg.chat.id, "✅ Transaction added.");
    } catch (err) {
      console.error("ADD error:", err);
      return bot.sendMessage(msg.chat.id, "Failed to add transaction.");
    }
  });
};
