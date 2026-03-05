// jobs/recurring.js
const cron = require("node-cron");

module.exports = function startRecurringJob(deps) {
  const { recurringProcessor } = deps;

  // Runs every day at 9:05 AM (local machine time)
  cron.schedule("5 9 * * *", () => {
    try {
      const count = recurringProcessor.processDueRecurring(new Date());
      console.log(`Recurring processor posted ${count} transaction(s).`);
    } catch (err) {
      console.error("Recurring processor failed:", err);
    }
  });
};
