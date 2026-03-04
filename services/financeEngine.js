// services/financeEngine.js

module.exports = function createFinanceEngine(ledgerService) {

  function getFinancialSnapshot() {

    const totals = ledgerService.getLast30DayTotals();

    let income = 0;
    let expenses = 0;

    for (const row of totals) {
      if (row.type === "INCOME") income = row.total;
      if (row.type === "EXPENSES") expenses = row.total;
    }

    return {
      income,
      expenses,
      net: income - expenses
    };
  }

    function calculateNetWorth() {

    const balances = ledgerService.getBalances();

    let assets = 0;
    let liabilities = 0;

    for (const row of balances) {
      if (row.account.startsWith("assets:")) {
        assets += row.balance;
      }
      if (row.account.startsWith("liabilities:")) {
        liabilities += row.balance;
      }
    }

    return {
      assets,
      liabilities,
      netWorth: assets - liabilities
    };
  }

  function calculateRunway() {

    const snapshot = getFinancialSnapshot();
    const balances = ledgerService.getBalances();

    let liquidAssets = 0;

    for (const row of balances) {
      if (row.account.startsWith("assets:")) {
        liquidAssets += row.balance;
      }
    }

    const operatingIncome = snapshot.income;
    const operatingExpenses = snapshot.expenses;
    const burnPerMonth = operatingExpenses - operatingIncome;

    if (burnPerMonth <= 0) {
      return {
        profitable: true,
        operatingIncome,
        operatingExpenses,
        liquidAssets,
        burnPerMonth: 0,
        burnPerDay: 0,
        runwayMonths: Infinity,
        runwayDays: Infinity,
        warning: null
      };
    }

    const runwayMonths = liquidAssets / burnPerMonth;
    const runwayDays = runwayMonths * 30;
    const burnPerDay = burnPerMonth / 30;

    let warning = null;

    if (runwayMonths < 3) {
      warning = "CRITICAL";
    } else if (runwayMonths < 6) {
      warning = "WARNING";
    }

    return {
      profitable: false,
      operatingIncome,
      operatingExpenses,
      liquidAssets,
      burnPerMonth,
      burnPerDay,
      runwayMonths,
      runwayDays,
      warning
    };
  }

  return {
    getFinancialSnapshot,
    calculateNetWorth,	  
    calculateRunway
  };
};
