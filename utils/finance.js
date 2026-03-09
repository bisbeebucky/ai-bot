// utils/finance.js
function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

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
  d.setMonth(d.getMonth() + toNumber(monthsAhead));
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function yearsMonths(totalMonths) {
  const months = Math.max(0, Math.floor(toNumber(totalMonths)));
  return {
    years: Math.floor(months / 12),
    months: months % 12
  };
}

function targetDate(monthsAhead) {
  const d = new Date();
  d.setMonth(d.getMonth() + Math.max(0, Math.floor(toNumber(monthsAhead))));
  const month = d.toLocaleString("en-US", { month: "long" });
  const year = d.getFullYear();
  return `${month} ${year}`;
}

function getBalancesMap(ledgerService) {
  const balances = Array.isArray(ledgerService?.getBalances?.())
    ? ledgerService.getBalances()
    : [];

  const map = new Map();

  for (const row of balances) {
    map.set(String(row.account || ""), toNumber(row.balance));
  }

  return map;
}

function getStartingAssets(ledgerService) {
  const balances = getBalancesMap(ledgerService);

  const bank = toNumber(balances.get("assets:bank"));
  const savings = toNumber(balances.get("assets:savings"));

  return {
    bank,
    savings,
    total: bank + savings
  };
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

      const amount = toNumber(bankLine.amount);
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

function getDebtRows(db) {
  return db.prepare(`
    SELECT name, balance, apr, minimum
    FROM debts
  `).all().map((row) => ({
    name: String(row.name || ""),
    balance: toNumber(row.balance),
    apr: toNumber(row.apr),
    minimum: toNumber(row.minimum)
  }));
}

module.exports = {
  monthlyMultiplier,
  futureMonthLabel,
  yearsMonths,
  targetDate,
  getStartingAssets,
  getRecurringMonthlyNet,
  getDebtRows
};
