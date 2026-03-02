const db = require("../models/db");

/**
 * Set or update a monthly budget for an expense account
 */
function setBudget(accountName, month, amount) {
  const account = db.prepare(`
    SELECT id FROM accounts 
    WHERE name = ? AND type = 'expenses'
  `).get(accountName);

  if (!account) {
    throw new Error("Expense account not found.");
  }

  db.prepare(`
    INSERT INTO budgets (account_id, month, amount)
    VALUES (?, ?, ?)
    ON CONFLICT(account_id, month)
    DO UPDATE SET amount = excluded.amount
  `).run(account.id, month, amount);

  return "Budget saved.";
}

/**
 * Get budget vs actual spending for a month
 */
function getBudgetReport(month) {
  return db.prepare(`
    SELECT 
      a.name AS category,
      b.amount AS budget,
      ROUND(ABS(SUM(p.amount)), 2) AS spent,
      ROUND(b.amount - ABS(SUM(p.amount)), 2) AS remaining
    FROM budgets b
    JOIN accounts a ON b.account_id = a.id
    LEFT JOIN postings p ON p.account_id = a.id
    LEFT JOIN transactions t ON p.transaction_id = t.id
      AND substr(t.date, 1, 7) = b.month
    WHERE b.month = ?
    GROUP BY a.id
    ORDER BY a.name
  `).all(month);
}

/**
 * Get categories that exceeded budget
 */
function getOverBudget(month) {
  return db.prepare(`
    SELECT 
      a.name AS category,
      b.amount AS budget,
      ROUND(ABS(SUM(p.amount)), 2) AS spent,
      ROUND(ABS(SUM(p.amount)) - b.amount, 2) AS over_by
    FROM budgets b
    JOIN accounts a ON b.account_id = a.id
    JOIN postings p ON p.account_id = a.id
    JOIN transactions t ON p.transaction_id = t.id
    WHERE b.month = ?
      AND substr(t.date, 1, 7) = b.month
    GROUP BY a.id
    HAVING ABS(SUM(p.amount)) > b.amount
    ORDER BY over_by DESC
  `).all(month);
}

module.exports = {
  setBudget,
  getBudgetReport,
  getOverBudget
};
