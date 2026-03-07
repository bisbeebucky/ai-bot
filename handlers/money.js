// handlers/money.js
module.exports = function registerMoneyHandler(bot, deps) {
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

  function futureMonthLabel(monthsAhead) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthsAhead);
    return d.toLocaleString("en-US", { month: "long", year: "numeric" });
  }

  function getBankBalance() {
    const balances = ledgerService.getBalances();
    const bank = balances.find((b) => b.account === "assets:bank");
    return Number(bank?.balance) || 0;
  }

  function getTotalLiabilities() {
    const balances = ledgerService.getBalances();
    let total = 0;

    for (const b of balances) {
      if (String(b.account).startsWith("liabilities:")) {
        total += Math.abs(Number(b.balance) || 0);
      }
    }

    return total;
  }

  function getNetWorth() {
    const balances = ledgerService.getBalances();
    let assets = 0;
    let liabilities = 0;

    for (const b of balances) {
      const amt = Number(b.balance) || 0;
      const account = String(b.account || "");

      if (account.startsWith("assets:")) assets += amt;
      if (account.startsWith("liabilities:")) liabilities += Math.abs(amt);
    }

    return assets - liabilities;
  }

  function getRecurringMonthlyNet() {
    const rows = db.prepare(`
      SELECT postings_json, frequency
      FROM recurring_transactions
    `).all();

    let income = 0;
    let bills = 0;

    for (const r of rows) {
      try {
        const postings = JSON.parse(r.postings_json);
        const bankLine = Array.isArray(postings)
          ? postings.find((p) => p.account === "assets:bank")
          : null;

        if (!bankLine) continue;

        const amt = Number(bankLine.amount) || 0;
        const monthly = Math.abs(amt) * monthlyMultiplier(r.frequency);

        if (amt > 0) income += monthly;
        if (amt < 0) bills += monthly;
      } catch { }
    }

    return income - bills;
  }

  function getMonthlyExpenses() {
    const row = db.prepare(`
      SELECT IFNULL(SUM(p.amount), 0) as total
      FROM transactions t
      JOIN postings p ON p.transaction_id = t.id
      JOIN accounts a ON a.id = p.account_id
      WHERE strftime('%Y-%m', t.date) = strftime('%Y-%m', 'now')
        AND a.type = 'EXPENSES'
    `).get();

    return Math.abs(Number(row?.total) || 0);
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

  function simulateDebtPayoffMonths(rows, mode, extra) {
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

    if (debts.length === 0) return 0;
    if (monthlyBudget <= 0) return null;

    let months = 0;

    while (activeDebts().length > 0 && months < 1200) {
      months += 1;

      for (const d of debts) {
        if (d.balance <= 0.005) continue;
        const monthlyRate = d.apr / 100 / 12;
        d.balance += d.balance * monthlyRate;
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

    return months >= 1200 ? null : months;
  }

  function simulateFIMonths(startBalance, monthlySave, annualReturn, fiTarget) {
    if (monthlySave <= 0 || fiTarget <= 0) return null;
    if (startBalance >= fiTarget) return 0;

    const monthlyRate = annualReturn / 100 / 12;
    let balance = startBalance;
    let months = 0;

    while (balance < fiTarget && months < 1200) {
      balance = balance * (1 + monthlyRate) + monthlySave;
      months += 1;
    }

    return months >= 1200 ? null : months;
  }

  bot.onText(/^\/money(@\w+)?$/i, (msg) => {
    const chatId = msg.chat.id;

    try {
      const bank = getBankBalance();
      const debt = getTotalLiabilities();
      const netWorth = getNetWorth();
      const recurringNet = getRecurringMonthlyNet();

      const debtRows = getDebtRows();
      const debtMonths = simulateDebtPayoffMonths(
        debtRows,
        "avalanche",
        Math.max(0, recurringNet)
      );

      const monthlyExpenses = getMonthlyExpenses();
      const annualExpenses = monthlyExpenses * 12;
      const fiTarget = annualExpenses > 0 ? annualExpenses * 25 : 0;
      const fiMonths = simulateFIMonths(
        bank,
        Math.max(0, recurringNet),
        7,
        fiTarget
      );

      let debtText;
      if (debtRows.length === 0) {
        debtText = "Already debt-free";
      } else if (debtMonths == null) {
        debtText = ">100 years";
      } else {
        debtText = futureMonthLabel(debtMonths);
      }

      let fiText;
      if (fiTarget <= 0 || fiMonths == null) {
        fiText = "unavailable";
      } else {
        fiText = futureMonthLabel(fiMonths);
      }

      let out = "💰 Money\n\n";
      out += "```\n";
      out += `Bank:          ${money(bank)}\n`;
      out += `Debt:          ${money(debt)}\n`;
      out += `Net Worth:     ${netWorth >= 0 ? "+" : "-"}${money(Math.abs(netWorth))}\n`;
      out += `Recurring Net: ${recurringNet >= 0 ? "+" : "-"}${money(Math.abs(recurringNet))}/mo\n`;
      out += `Debt Free:     ${debtText}\n`;
      out += `FI:            ${fiText}\n`;
      out += "```";

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("money error:", err);
      return bot.sendMessage(chatId, "Error generating money snapshot.");
    }
  });
};
