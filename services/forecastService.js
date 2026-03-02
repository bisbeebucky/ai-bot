const db = require("../models/db");

/* ============================================
   Get Current Cash Balance
============================================ */

function getCashBalance() {
  const rows = db.prepare(`
    SELECT a.name, SUM(p.amount) as balance
    FROM postings p
    JOIN accounts a ON p.account_id = a.id
    WHERE a.name LIKE 'assets:%'
    GROUP BY a.name
  `).all();

  let total = 0;
  rows.forEach(r => total += r.balance || 0);
  return total;
}

/* ============================================
   Calculate Next Date
============================================ */

function calculateNextDate(currentDate, frequency) {
  const date = new Date(currentDate);

  switch (frequency) {
    case "daily": date.setDate(date.getDate() + 1); break;
    case "weekly": date.setDate(date.getDate() + 7); break;
    case "monthly": date.setMonth(date.getMonth() + 1); break;
    case "yearly": date.setFullYear(date.getFullYear() + 1); break;
  }

  return date.toISOString().split("T")[0];
}

/* ============================================
   Forecast Engine
============================================ */

function forecast(months = 6) {

  const today = new Date();
  const recurring = db.prepare(`
    SELECT * FROM recurring_transactions
  `).all();

  let projectedCash = getCashBalance();
  let monthlyBreakdown = [];
  let insolvencyMonth = null;

  for (let m = 1; m <= months; m++) {

    const monthEnd = new Date(today);
    monthEnd.setMonth(today.getMonth() + m);

    recurring.forEach(item => {

      let nextDate = new Date(item.next_due_date);

      while (nextDate <= monthEnd) {

        const postings = JSON.parse(item.postings_json);

        postings.forEach(p => {
          if (p.account.startsWith("assets:")) {
            projectedCash += p.amount;
          }
        });

        nextDate = new Date(
          calculateNextDate(
            nextDate.toISOString().split("T")[0],
            item.frequency
          )
        );
      }
    });

    if (projectedCash < 0 && insolvencyMonth === null) {
      insolvencyMonth = m;
    }

    monthlyBreakdown.push({
      month: m,
      cash: projectedCash
    });
  }

  return {
    currentCash: getCashBalance(),
    monthlyBreakdown,
    insolvencyMonth
  };
}

module.exports = { forecast };
