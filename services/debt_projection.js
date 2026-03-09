// services/debt_projection.js
const { cloneDebts, sortDebts, activeDebts } = require("./debt_utils");

function simulateDebtSeries(rows, mode = "avalanche", extra = 0, monthsToShow = 12) {
  const debts = cloneDebts(rows);

  const totalMinimums = debts.reduce((sum, d) => sum + d.minimum, 0);
  const monthlyBudget = totalMinimums + (Number(extra) || 0);

  const series = [debts.reduce((sum, d) => sum + d.balance, 0)];

  if (debts.length === 0 || monthlyBudget <= 0) {
    while (series.length < monthsToShow + 1) series.push(0);
    return {
      series,
      payoffMonths: debts.length === 0 ? 0 : null,
      totalMinimums,
      monthlyBudget
    };
  }

  let months = 0;
  let payoffMonths = null;

  while (months < monthsToShow) {
    months += 1;

    if (activeDebts(debts).length > 0) {
      for (const d of debts) {
        if (d.balance <= 0.005) continue;
        const monthlyRate = d.apr / 100 / 12;
        d.balance += d.balance * monthlyRate;
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

      if (activeDebts(debts).length === 0 && payoffMonths === null) {
        payoffMonths = months;
      }
    }

    series.push(debts.reduce((sum, d) => sum + d.balance, 0));
  }

  return {
    series,
    payoffMonths,
    totalMinimums,
    monthlyBudget
  };
}

module.exports = {
  simulateDebtSeries
};
