// jobs/cron.js
module.exports = function startCronJobs({ cron, recurringProcessor }) {
  // Runs every day at 09:05 local time
  cron.schedule("5 9 * * *", () => {
    try {
      const count = recurringProcessor.processDueRecurring();
      console.log(`[cron] recurring processor posted ${count} transaction(s)`);
    } catch (err) {
      console.error("[cron] recurring processor failed:", err);
    }
  });
};
