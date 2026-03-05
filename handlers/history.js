module.exports = function registerHistoryHandler(bot, deps) {

  const { ledgerService } = deps;

  bot.onText(/^\/history(@\w+)?$/, (msg) => {

    const chatId = msg.chat.id;

    try {

      const rows = ledgerService.getRecentTransactions(5);

      if (!rows.length) {
        return bot.sendMessage(chatId, "No transactions recorded yet.");
      }

      let out = "🧾 Last Transactions\n\n";

      for (const r of rows) {
        out += `${r.date}  ${r.hash.slice(0,8)}  ${r.description}\n`;
      }

      out += "\nUndo examples:\n";
      out += "/undo\n";
      out += `/undo ${rows[0].hash.slice(0,8)}`;

      return bot.sendMessage(chatId, out);

    } catch (err) {

      console.error("History error:", err);
      return bot.sendMessage(chatId, "Error retrieving history.");

    }

  });

};
