module.exports = function registerIncomeHandler(bot, deps) {

  const { reportService } = deps;

  bot.onText(/^\/income(@\w+)?$/, (msg) => {

    const chatId = msg.chat.id;

    try {

      const { income, expenses } =
        reportService.getLast30DayIncomeAndExpenses();

      const net = income - expenses;

      const message =
        `📊 Last 30 Days\n\n` +
        `Income: ${income}\n` +
        `Expenses: ${expenses}\n` +
        `Net: ${net}`;

      bot.sendMessage(chatId, message);

    } catch (err) {
      console.error("Income error:", err);
      bot.sendMessage(chatId, "Error retrieving income statement.");
    }

  });

};
