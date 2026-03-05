// jobs/startup.js
module.exports = function runStartupJobs({ recurringProcessor }) {
  try {
    const count = recurringProcessor.processDueRecurring();
    console.log(`[startup] processed ${count} recurring transaction(s)`);
  } catch (err) {
    console.error("[startup] recurring processor failed:", err);
  }
};
