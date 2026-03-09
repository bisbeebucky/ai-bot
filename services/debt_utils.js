// services/debt_utils.js
function cloneDebts(rows) {
  return (rows || []).map((r) => ({
    name: String(r.name || ""),
    balance: Number(r.balance) || 0,
    apr: Number(r.apr) || 0,
    minimum: Number(r.minimum) || 0
  }));
}

function sortDebts(debts, mode = "avalanche") {
  if (!Array.isArray(debts)) return debts;

  if (mode === "snowball") {
    debts.sort((a, b) => {
      const balDiff = a.balance - b.balance;
      if (balDiff !== 0) return balDiff;
      return b.apr - a.apr;
    });
    return debts;
  }

  debts.sort((a, b) => {
    const aprDiff = b.apr - a.apr;
    if (aprDiff !== 0) return aprDiff;
    return a.balance - b.balance;
  });

  return debts;
}

function activeDebts(debts) {
  return (debts || []).filter((d) => (Number(d.balance) || 0) > 0.005);
}

function getDebtRows(db) {
  return db.prepare(`
    SELECT name, balance, apr, minimum
    FROM debts
  `).all().map((r) => ({
    name: String(r.name || ""),
    balance: Number(r.balance) || 0,
    apr: Number(r.apr) || 0,
    minimum: Number(r.minimum) || 0
  }));
}

function runDebtSimulation(rows, mode = "avalanche", extra = 0, options = {}) {
  const debts = cloneDebts(rows);

  const safeLimit = Number.isInteger(options.safeLimitMonths)
    ? options.safeLimitMonths
    : 1200;

  const totalMinimums = debts.reduce((sum, d) => sum + d.minimum, 0);
  const monthlyBudget = totalMinimums + (Number(extra) || 0);

  if (monthlyBudget <= 0) {
    return {
      startingDebt: debts.reduce((sum, d) => sum + d.balance, 0),
      totalMinimums,
      monthlyBudget,
      months: null,
      interest: null,
      totals: null
    };
  }

  let months = 0;
  let totalInterest = 0;
  const totals = [debts.reduce((sum, d) => sum + d.balance, 0)];

  while (activeDebts(debts).length > 0 && months < safeLimit) {
    months += 1;

    for (const d of debts) {
      if (d.balance <= 0.005) continue;

      const monthlyRate = d.apr / 100 / 12;
      const interest = d.balance * monthlyRate;
      d.balance += interest;
      totalInterest += interest;
    }

    const remaining = activeDebts(debts);
    sortDebts(remaining, mode);

    let paymentPool = monthlyBudget;

    for (const d of remaining) {
      if (paymentPool <= 0) break;

      const minPay = Math.min(d.minimum, d.balance, paymentPool);
      d.balance -= minPay;
      paymentPool -= minPay;
    }

    let targets = activeDebts(debts);
    sortDebts(targets, mode);

    while (paymentPool > 0 && targets.length > 0) {
      const target = targets[0];
      const pay = Math.min(target.balance, paymentPool);
      target.balance -= pay;
      paymentPool -= pay;

      targets = activeDebts(debts);
      sortDebts(targets, mode);
    }

    for (const d of debts) {
      if (d.balance < 0.005) d.balance = 0;
    }

    totals.push(debts.reduce((sum, d) => sum + d.balance, 0));
  }

  if (months >= safeLimit && activeDebts(debts).length > 0) {
    return {
      startingDebt: totals[0],
      totalMinimums,
      monthlyBudget,
      months: null,
      interest: null,
      totals
    };
  }

  return {
    startingDebt: totals[0],
    totalMinimums,
    monthlyBudget,
    months,
    interest: totalInterest,
    totals
  };
}

module.exports = {
  cloneDebts,
  sortDebts,
  activeDebts,
  getDebtRows,
  runDebtSimulation
};
