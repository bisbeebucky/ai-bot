// handlers/retirement_fi.js
module.exports = function registerRetirementFIHandler(bot, deps) {
  const { db, ledgerService } = deps;

  function money(n) {
    return `$${Number(n || 0).toFixed(2)}`;
  }

  function monthlyMultiplier(freq) {
    switch ((freq || "").toLowerCase()) {
      case "daily": return 30;
      case "weekly": return 4.33;
      case "monthly": return 1;
      case "yearly": return 1 / 12;
      default: return 0;
    }
  }

  function yearsMonths(months) {
    return {
      years: Math.floor(months / 12),
      months: months % 12
    };
  }

  function targetDate(monthsAhead) {
    const d = new Date();
    d.setMonth(d.getMonth() + monthsAhead);
    const month = d.toLocaleString("en-US", { month: "long" });
    const year = d.getFullYear();
    return `${month} ${year}`;
  }

  function getBankBalance() {
    const balances = ledgerService.getBalances();
    const bank = balances.find((b) => b.account === "assets:bank");
    return Number(bank?.balance) || 0;
  }

  function getRecurringMonthlyNet() {
    const rows = db.prepare(`
      SELECT postings_json, frequency
      FROM recurring_transactions
    `).all();

    let recurringIncome = 0;
    let recurringBills = 0;

    for (const r of rows) {
      try {
        const postings = JSON.parse(r.postings_json);
        const bankLine = Array.isArray(postings)
          ? postings.find((p) => p.account === "assets:bank")
          : null;

        if (!bankLine) continue;

        const amt = Number(bankLine.amount) || 0;
        const monthly = Math.abs(amt) * monthlyMultiplier(r.frequency);

        if (amt > 0) recurringIncome += monthly;
        if (amt < 0) recurringBills += monthly;
      } catch { }
    }

    return recurringIncome - recurringBills;
  }

  function getActualMonthlyExpenses() {
    const rows = db.prepare(`
      SELECT
        SUM(p.amount) as total
      FROM transactions t
      JOIN postings p ON p.transaction_id = t.id
      JOIN accounts a ON a.id = p.account_id
      WHERE strftime('%Y-%m', t.date) = strftime('%Y-%m', 'now')
        AND a.type = 'EXPENSES'
    `).get();

    return Math.abs(Number(rows?.total) || 0);
  }

  bot.onText(/^\/retirement_fi(@\w+)?\s+(\d+(\.\d+)?)$/i, (msg, match) => {
    const chatId = msg.chat.id;

    try {
      const annualReturn = Number(match[2]);

      if (!Number.isFinite(annualReturn) || annualReturn < 0) {
        return bot.sendMessage(chatId, "Usage: /retirement_fi <annual_return_percent>");
      }

      const startingBalance = getBankBalance();
      const monthlySave = getRecurringMonthlyNet();
      const monthlyExpenses = getActualMonthlyExpenses();

      if (monthlyExpenses <= 0) {
        return bot.sendMessage(
          chatId,
          "This month's expenses are zero or unavailable, so FI target cannot be calculated yet."
        );
      }

      if (monthlySave <= 0) {
        return bot.sendMessage(
          chatId,
          "Recurring surplus is not positive, so FI projection cannot be calculated."
        );
      }

      const annualExpenses = monthlyExpenses * 12;
      const fiTarget = annualExpenses * 25; // 4% rule
      const monthlyRate = annualReturn / 100 / 12;

      if (startingBalance >= fiTarget) {
        let out = "🔥 Financial Independence\n\n";
        out += "```\n";
        out += `Current Balance:    ${money(startingBalance)}\n`;
        out += `Annual Spending:    ${money(annualExpenses)}\n`;
        out += `FI Target:          ${money(fiTarget)}\n`;
        out += "-----------------------------------\n";
        out += `Status:             Already FI\n`;
        out += "```";

        return bot.sendMessage(chatId, out, {
          parse_mode: "Markdown"
        });
      }

      let balance = startingBalance;
      let months = 0;

      while (balance < fiTarget && months < 1200) {
        balance = balance * (1 + monthlyRate) + monthlySave;
        months += 1;
      }

      if (months >= 1200) {
        return bot.sendMessage(
          chatId,
          "Projection exceeded 100 years. Increase recurring surplus, return assumption, or reduce expenses."
        );
      }

      const ym = yearsMonths(months);
      const fiDate = targetDate(months);

      let out = "🔥 Financial Independence\n\n";
      out += "```\n";
      out += `Current Balance:    ${money(startingBalance)}\n`;
      out += `Monthly Surplus:    ${money(monthlySave)}\n`;
      out += `Monthly Expenses:   ${money(monthlyExpenses)}\n`;
      out += `Annual Spending:    ${money(annualExpenses)}\n`;
      out += `FI Target:          ${money(fiTarget)}\n`;
      out += `Annual Return:      ${annualReturn.toFixed(2)}%\n`;
      out += "-----------------------------------\n";
      out += `Time to FI:         ${ym.years}y ${ym.months}m\n`;
      out += `FI Date:            ${fiDate}\n`;
      out += "```";

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("retirement_fi error:", err);
      return bot.sendMessage(chatId, "Error calculating retirement_fi.");
    }
  });
};
