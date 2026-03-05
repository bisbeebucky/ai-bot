// handlers/runrecurring.js
module.exports = function registerRunRecurringHandler(bot, deps) {
  const { recurringProcessor } = deps;

  bot.onText(/^\/runrecurring(@\w+)?$/, (msg) => {
    const chatId = msg.chat.id;

    try {
      if (!recurringProcessor || typeof recurringProcessor.processDueRecurring !== "function") {
        return bot.sendMessage(
          chatId,
          "Recurring processor not configured. (deps.recurringProcessor missing)"
        );
      }

      const count = recurringProcessor.processDueRecurring(new Date());

      return bot.sendMessage(
        chatId,
        `✅ Posted ${Number(count) || 0} recurring transaction(s).`
      );
    } catch (err) {
      console.error("runrecurring error:", err);
      return bot.sendMessage(chatId, "Error processing recurring transactions.");
    }
  });
};
