// handlers/life_projection.js
module.exports = function registerLifeProjectionHandler(bot, deps) {
  const { db, ledgerService } = deps;

  function money(n) {
    return `$${(Number(n) || 0).toFixed(2)}`;
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

  function yearsMonths(totalMonths) {
    return {
      years: Math.floor(totalMonths / 12),
      months: totalMonths % 12
    };
  }

  function futureDate(monthsAhead) {
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

    return {
      income: recurringIncome,
      bills: recurringBills,
      net: recurringIncome - recurringBills
    };
  }

  function getMonthlyActuals() {
    const rows = db.prepare(`
      SELECT
        a.type as type,
        SUM(p.amount) as total
      FROM transactions t
      JOIN postings p ON p.transaction_id = t.id
      JOIN accounts a ON a.id = p.account_id
      WHERE strftime('%Y-%m', t.date) = strftime('%Y-%m', 'now')
        AND (a.type = 'INCOME' OR a.type = 'EXPENSES')
      GROUP BY a.type
    `).all();

    let income = 0;
    let expenses = 0;

    for (const r of rows) {
      const v = Math.abs(Number(r.total) || 0);
      if (r.type === "INCOME") income = v;
      if (r.type === "EXPENSES") expenses = v;
    }

    return {
      income,
      expenses,
      net: income - expenses
    };
  }

  function getDebtRows() {
    return db.prepare(`
      SELECT name, balance, apr, minimum
      FROM debts
    `).all().map((r) => ({
      name: r.name,
      balance: Number(r.balance) || 0,
      apr: Number(r.apr) || 0,
      minimum: Number(r.minimum) || 0
    }));
  }

  function simulateDebtPayoff(rows, mode, extra) {
    const debts = rows.map((r) => ({ ...r }));

    function sortDebts(arr) {
      if (mode === "snowball") {
        arr.sort((a, b) => {
          const balDiff = a.balance - b.balance;
          if (balDiff !== 0) return balDiff;
          return b.apr - a.apr;
        });
      } else {
        arr.sort((a, b) => {
          const aprDiff = b.apr - a.apr;
          if (aprDiff !== 0) return aprDiff;
          return a.balance - b.balance;
        });
      }
    }

    function activeDebts() {
      return debts.filter((d) => d.balance > 0.005);
    }

    const totalMinimums = debts.reduce((sum, d) => sum + d.minimum, 0);
    const monthlyBudget = totalMinimums + extra;

    if (monthlyBudget <= 0 || debts.length === 0) {
      return { months: 0, interest: 0 };
    }

    let months = 0;
    let totalInterest = 0;

    while (activeDebts().length > 0 && months < 1200) {
      months += 1;

      for (const d of debts) {
        if (d.balance <= 0.005) continue;
        const monthlyRate = d.apr / 100 / 12;
        const interest = d.balance * monthlyRate;
        d.balance += interest;
        totalInterest += interest;
      }

      const remaining = activeDebts();
      sortDebts(remaining);

      let paymentPool = monthlyBudget;

      for (const d of remaining) {
        if (paymentPool <= 0) break;
        const minPay = Math.min(d.minimum, d.balance, paymentPool);
        d.balance -= minPay;
        paymentPool -= minPay;
      }

      let targets = activeDebts();
      sortDebts(targets);

      while (paymentPool > 0 && targets.length > 0) {
        const target = targets[0];
        const pay = Math.min(target.balance, paymentPool);
        target.balance -= pay;
        paymentPool -= pay;

        targets = activeDebts();
        sortDebts(targets);
      }

      for (const d of debts) {
        if (d.balance < 0.005) d.balance = 0;
      }
    }

    if (months >= 1200) {
      return { months: null, interest: totalInterest };
    }

    return { months, interest: totalInterest };
  }

  function simulateRetirement(startBalance, monthlySave, annualReturn, target) {
    if (monthlySave <= 0) return null;

    const monthlyRate = annualReturn / 100 / 12;
    let balance = startBalance;
    let months = 0;

    while (balance < target && months < 1200) {
      balance = balance * (1 + monthlyRate) + monthlySave;
      months += 1;
    }

    if (months >= 1200) return null;
    return months;
  }

  bot.onText(/^\/life_projection(@\w+)?$/i, (msg) => {
    const chatId = msg.chat.id;

    try {
      const bankBalance = getBankBalance();
      const recurring = getRecurringMonthlyNet();
      const monthly = getMonthlyActuals();
      const debtRows = getDebtRows();

      const totalDebt = debtRows.reduce((sum, d) => sum + d.balance, 0);
      const totalMinimums = debtRows.reduce((sum, d) => sum + d.minimum, 0);

      // Use avalanche by default for forward debt projection
      const debtExtra = Math.max(0, recurring.net);
      const debtPlan = simulateDebtPayoff(debtRows, "avalanche", debtExtra);

      const annualExpenses = monthly.expenses * 12;
      const fiTarget = annualExpenses > 0 ? annualExpenses * 25 : 0;
      const fiMonths = fiTarget > 0
        ? simulateRetirement(bankBalance, Math.max(0, recurring.net), 7, fiTarget)
        : null;

      const projected12mo = bankBalance + recurring.net * 12;

      let outlook = "";
      if (recurring.net > 0 && totalDebt > 0) {
        outlook = "Strong surplus with debt payoff opportunity.";
      } else if (recurring.net > 0 && totalDebt === 0) {
        outlook = "Strong surplus and no debt drag.";
      } else if (recurring.net <= 0 && totalDebt > 0) {
        outlook = "Debt and weak surplus need attention.";
      } else {
        outlook = "Stable, but growth depends on improving surplus.";
      }

      let out = "🧭 Life Projection\n\n";
      out += "```\n";
      out += `Cash on Hand:      ${money(bankBalance)}\n`;
      out += `Monthly Net:       ${monthly.net >= 0 ? "+" : "-"}${money(Math.abs(monthly.net))}\n`;
      out += `Recurring Net:     ${recurring.net >= 0 ? "+" : "-"}${money(Math.abs(recurring.net))}\n`;
      out += `Debt Total:        ${money(totalDebt)}\n`;
      out += `Debt Min/Month:    ${money(totalMinimums)}\n`;
      out += `12mo Projection:   ${money(projected12mo)}\n`;

      if (debtPlan.months === null) {
        out += `Debt-Free Date:    >100 years\n`;
      } else if (totalDebt <= 0) {
        out += `Debt-Free Date:    Already debt-free\n`;
      } else {
        const debtDate = futureDate(debtPlan.months);
        const ymDebt = yearsMonths(debtPlan.months);
        out += `Debt-Free Date:    ${debtDate} (${ymDebt.years}y ${ymDebt.months}m)\n`;
      }

      if (fiTarget <= 0) {
        out += `FI Date:           unavailable\n`;
      } else if (fiMonths === null) {
        out += `FI Date:           >100 years\n`;
      } else {
        const fiDate = futureDate(fiMonths);
        const ymFi = yearsMonths(fiMonths);
        out += `FI Target:         ${money(fiTarget)}\n`;
        out += `FI Date:           ${fiDate} (${ymFi.years}y ${ymFi.months}m)\n`;
      }

      out += "```";
      out += `\n${outlook}`;

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("life_projection error:", err);
      return bot.sendMessage(chatId, "Error generating life projection.");
    }
  });
};
