const financeEngine = require("../services/financeEngine");

module.exports = function registerReportHandler(bot, deps) {

  bot.onText(/^\/report(@\w+)?$/, (msg) => {
    try {

      const snapshot = deps.financeEngine.getFinancialSnapshot();

      const liquidAssets = snapshot.liquidAssets || 0;
      const income = snapshot.income || 0;
      const expenses = snapshot.expenses || 0;

      const netCashflow = income - expenses;

      let output = "📊 Financial Report\n\n";
      output += `Liquid Assets: ${liquidAssets.toFixed(2)}\n`;
      output += `30d Income: ${income.toFixed(2)}\n`;
      output += `30d Expenses: ${expenses.toFixed(2)}\n`;
      output += `Net 30d Cashflow: ${netCashflow.toFixed(2)}\n`;

      bot.sendMessage(msg.chat.id, output);

    } catch (err) {
      console.error("Report error:", err);
      bot.sendMessage(msg.chat.id, "Error generating report.");
    }
  });

};
