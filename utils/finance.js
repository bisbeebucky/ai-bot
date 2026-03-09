// utils/finance.js
module.exports = {
  monthlyMultiplier,
  futureMonthLabel,
  getBalancesMap,
  getStartingAssets,
  getTotalLiabilities,
  getNetWorth,
  getRecurringMonthlyNet,
  getMonthlyExpenses,
  getDebtRows,
  simulateDebtPayoffMonths,
  simulateFIMonths,
  simulateNetWorthMilestoneMonths,
  findNextIncome
};

function monthlyMultiplier(freq) {
  switch (String(freq || "").toLowerCase()) {
    case "daily":
      return 30;
    case "weekly":
      return 4.33;
    case "monthly":
      return 1;
    case "yearly":
      return 1 / 12;
    default:
      return 0;
  }
}

function futureMonthLabel(monthsAhead) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + Number(monthsAhead || 0));
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function getBalancesMap(ledgerService) {
  const balances = ledgerService.getBalances();
  const map = new Map();

  for (const row of balances) {
    map.set(String(row.account || ""), Number(row.balance) || 0);
  }

  return map;
}

function getStartingAssets(ledgerService) {
  const balances = ledgerService.getBalances();

  let bank = 0;
  let savings = 0;

  for (const row of balances) {
    if (row.account === "assets:bank") bank = Number(row.balance) || 0;
    if (row.account === "assets:savings") savings = Number(row.balance) || 0;
  }

  return {
    bank,
    savings,
    total: bank + savings
  };
}

function getTotalLiabilities(ledgerService) {
  const balances = ledgerService.getBalances();
  let total = 0;

  for (const row of balances) {
    if (String(row.account || "").startsWith("liabilities:")) {
      total += Math.abs(Number(row.balance) || 0);
    }
  }

  return total;
}

function getNetWorth(ledgerService) {
  const balances = ledgerService.getBalances();
  let assets = 0;
  let liabilities = 0;

  for (const row of balances) {
    const amount = Number(row.balance) || 0;
    const account = String(row.account || "");

    if (account.startsWith("assets:")) assets += amount;
    if (account.startsWith("liabilities:")) liabilities += Math.abs(amount);
  }

  return assets - liabilities;
}

function getRecurringMonthlyNet(db) {
  const rows = db.prepare(`
    SELECT postings_json, frequency
    FROM recurring_transactions
  `).all();

  let income = 0;
  let bills = 0;

  for (const row of rows) {
    try {
      const postings = JSON.parse(row.postings_json);
      const bankLine = Array.isArray(postings)
        ? postings.find((p) => p.account === "assets:bank")
        : null;

      if (!bankLine) continue;

      const amount = Number(bankLine.amount) || 0;
      const monthly = Math.abs(amount) * monthlyMultiplier(row.frequency);

      if (amount > 0) income += monthly;
      if (amount < 0) bills += monthly;
    } catch {
      // ignore malformed recurring rows
    }
  }

  return {
    income,
    bills,
    net: income - bills
  };
}

function getMonthlyExpenses(db) {
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

function getDebtRows(db) {
  return db.prepare(`
    SELECT name, balance, apr, minimum
    FROM debts
  `).all().map((row) => ({
    name: String(row.name || ""),
    balance: Number(row.balance) || 0,
    apr: Number(row.apr) || 0,
    minimum: Number(row.minimum) || 0
  }));
}

function simulateDebtPayoffMonths(rows, mode, extra) {
  const debts = rows.map((row) => ({ ...row }));

  function sortDebts(arr) {
    if (mode === "snowball") {
      arr.sort((a, b) => {
        const balanceDiff = a.balance - b.balance;
        if (balanceDiff !== 0) return balanceDiff;
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

    for (const debt of debts) {
      if (debt.balance <= 0.005) continue;
      const monthlyRate = debt.apr / 100 / 12;
      debt.balance += debt.balance * monthlyRate;
    }

    const remaining = activeDebts();
    sortDebts(remaining);

    let paymentPool = monthlyBudget;

    for (const debt of remaining) {
      if (paymentPool <= 0) break;
      const minPay = Math.min(debt.minimum, debt.balance, paymentPool);
      debt.balance -= minPay;
      paymentPool -= minPay;
    }

    let targets = activeDebts();
    sortDebts(targets);

    while (paymentPool > 0 && targets.length > 0) {
      const target = targets[0];
      const payment = Math.min(target.balance, paymentPool);
      target.balance -= payment;
      paymentPool -= payment;

      targets = activeDebts();
      sortDebts(targets);
    }

    for (const debt of debts) {
      if (debt.balance < 0.005) debt.balance = 0;
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

function simulateNetWorthMilestoneMonths(startCash, monthlyNet, debtRows, targets, options = {}) {
  const {
    maxMonths = 1200,
    spendOnlyAvailableCash = false
  } = options;

  const debts = debtRows.map((row) => ({ ...row }));
  const results = {};
  const sortedTargets = [...targets].sort((a, b) => a - b);

  function sortDebts(arr) {
    arr.sort((a, b) => {
      const aprDiff = b.apr - a.apr;
      if (aprDiff !== 0) return aprDiff;
      return a.balance - b.balance;
    });
  }

  function activeDebts() {
    return debts.filter((d) => d.balance > 0.005);
  }

  const totalMinimums = debts.reduce((sum, d) => sum + d.minimum, 0);
  const debtExtra = Math.max(0, monthlyNet);
  const monthlyDebtBudget = totalMinimums + debtExtra;

  let cash = startCash;
  let months = 0;

  while (months < maxMonths) {
    const totalDebt = debts.reduce((sum, d) => sum + d.balance, 0);
    const netWorth = cash - totalDebt;

    for (const target of sortedTargets) {
      if (results[target] == null && netWorth >= target) {
        results[target] = months;
      }
    }

    if (sortedTargets.every((target) => results[target] != null)) break;

    months += 1;
    cash += monthlyNet;

    if (activeDebts().length > 0 && monthlyDebtBudget > 0) {
      for (const debt of debts) {
        if (debt.balance <= 0.005) continue;
        const monthlyRate = debt.apr / 100 / 12;
        debt.balance += debt.balance * monthlyRate;
      }

      let paymentPool = monthlyDebtBudget;

      if (spendOnlyAvailableCash) {
        paymentPool = Math.max(0, Math.min(cash, monthlyDebtBudget));
      }

      const remaining = activeDebts();
      sortDebts(remaining);

      for (const debt of remaining) {
        if (paymentPool <= 0) break;
        const minPay = Math.min(debt.minimum, debt.balance, paymentPool);
        debt.balance -= minPay;
        paymentPool -= minPay;
        if (spendOnlyAvailableCash) cash -= minPay;
      }

      let targetsNow = activeDebts();
      sortDebts(targetsNow);

      while (paymentPool > 0 && targetsNow.length > 0) {
        const target = targetsNow[0];
        const pay = Math.min(target.balance, paymentPool);
        target.balance -= pay;
        paymentPool -= pay;
        if (spendOnlyAvailableCash) cash -= pay;

        targetsNow = activeDebts();
        sortDebts(targetsNow);
      }

      for (const debt of debts) {
        if (debt.balance < 0.005) debt.balance = 0;
      }
    }
  }

  return results;
}

function parseLocalDate(dateStr) {
  const s = String(dateStr || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(12, 0, 0, 0);
  return d;
}

function findNextIncome(db) {
  const recurring = db.prepare(`
    SELECT description, postings_json, next_due_date
    FROM recurring_transactions
  `).all();

  let nextIncome = null;

  for (const row of recurring) {
    try {
      const postings = JSON.parse(row.postings_json);
      const bankLine = Array.isArray(postings)
        ? postings.find((p) => p.account === "assets:bank")
        : null;

      if (bankLine && Number(bankLine.amount) > 0) {
        const d = parseLocalDate(row.next_due_date);
        if (!d) continue;

        if (!nextIncome || d < nextIncome.date) {
          nextIncome = {
            date: d,
            dateText: String(row.next_due_date || ""),
            amount: Number(bankLine.amount) || 0,
            description: String(row.description || "")
          };
        }
      }
    } catch {
      // ignore malformed recurring rows
    }
  }

  return nextIncome;
}
