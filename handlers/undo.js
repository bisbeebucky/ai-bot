module.exports = function registerUndoHandler(bot, deps) {

  const { ledgerService } = deps;

  bot.onText(/^\/undo(@\w+)?(?:\s+([a-f0-9]{3,64}))?$/i, (msg, match) => {

    const chatId = msg.chat.id;
    const hashPrefix = match[2];

    try {

      let deleted;

      if (hashPrefix) {

        deleted = ledgerService.deleteTransactionByHashPrefix(hashPrefix);

        if (!deleted) {
          return bot.sendMessage(chatId, `No transaction found for ${hashPrefix}`);
        }

      } else {

        deleted = ledgerService.deleteLastTransaction();

        if (!deleted) {
          return bot.sendMessage(chatId, "Nothing to undo.");
        }

      }

      return bot.sendMessage(
        chatId,
        `↩️ Undid: ${deleted.description} (${deleted.date})`
      );

    } catch (err) {

      console.error("Undo error:", err);
      return bot.sendMessage(chatId, "Undo failed.");

    }

  });

};
