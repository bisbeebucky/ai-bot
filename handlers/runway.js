// handlers/runway.js
module.exports = function registerRunwayHandler(bot, deps) {
  const { db } = deps;

  bot.onText(/^\/runway(@\w+)?$/, (msg) => {
    const chatId = msg.chat.id;

    try {
      // 1) Current bank balance
      const account = db.prepare(`
        SELECT id FROM accounts WHERE name = 'assets:bank'
      `).get();

      if (!account) {
        return bot.sendMessage(chatId, "Bank account not found (assets:bank).");
      }

      const balanceRow = db.prepare(`
        SELECT IFNULL(SUM(amount), 0) AS balance
        FROM postings
        WHERE account_id = ?
      `).get(account.id);

      const balance = Number(balanceRow?.balance) || 0;

      // 2) Recurring monthly income/expenses (from recurring_transactions)
      const recRows = db.prepare(`
        SELECT postings_json, frequency
        FROM recurring_transactions
      `).all();

      let monthlyIncome = 0;
      let monthlyExpenses = 0;

      for (const r of recRows) {
        let postings;
        try {
          postings = JSON.parse(r.postings_json);
        } catch {
          continue;
        }

        if (!Array.isArray(postings)) continue;

        const bankLine = postings.find(p => p.account === "assets:bank");
        if (!bankLine) continue;

        const bankImpact = Number(bankLine.amount) || 0;

        // Normalize frequency to monthly
        let multiplier = 1;
        switch ((r.frequency || "").toLowerCase()) {
          case "daily":
            multiplier = 30;
            break;
          case "weekly":
            multiplier = 4.33;
            break;
          case "monthly":
            multiplier = 1;
            break;
          case "yearly":
            multiplier = 1 / 12;
            break;
          default:
            multiplier = 1;
        }

        const monthlyValue = bankImpact * multiplier;

        if (monthlyValue >= 0) monthlyIncome += monthlyValue;
        else monthlyExpenses += Math.abs(monthlyValue);
      }

      const netMonthly = monthlyIncome - monthlyExpenses;

      // 3) Runway months
      const runwayMonths = netMonthly >= 0 ? Infinity : balance / Math.abs(netMonthly);

      let message = "📊 Financial Runway\n\n";
      message += `Balance: $${balance.toFixed(2)}\n\n`;
      message += `Monthly Income: $${monthlyIncome.toFixed(2)}\n`;
      message += `Monthly Expenses: $${monthlyExpenses.toFixed(2)}\n`;
      message += `Net Monthly: $${netMonthly.toFixed(2)}\n\n`;

      if (runwayMonths === Infinity) {
        message += "✅ You are cashflow positive.\nRunway: ∞";
      } else {
        message += `⚠️ Estimated Runway: ${runwayMonths.toFixed(1)} months`;
      }

      return bot.sendMessage(chatId, message);

    } catch (err) {
      console.error("Runway error:", err);
      return bot.sendMessage(chatId, "Error calculating runway.");
    }
  });
};
