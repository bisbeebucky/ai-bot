const db = require("../models/db");

function getBalances() {
  const stmt = db.prepare(`
    SELECT 
      a.name as account,
      a.type as type,
      IFNULL(SUM(p.amount), 0) as balance
    FROM accounts a
    LEFT JOIN postings p ON a.id = p.account_id
    GROUP BY a.id
    ORDER BY a.name
  `);

  return stmt.all();
}

function getIncomeStatement() {
  const stmt = db.prepare(`
    SELECT
      a.type,
      a.name as account,
      IFNULL(SUM(p.amount), 0) as balance
    FROM accounts a
    LEFT JOIN postings p ON a.id = p.account_id
    WHERE a.type IN ('income', 'expenses')
    GROUP BY a.id
    ORDER BY a.type, a.name
  `);

  return stmt.all();
}

function getNetWorthData() {
  const stmt = db.prepare(`
    SELECT
      a.type,
      a.name as account,
      IFNULL(SUM(p.amount), 0) as balance
    FROM accounts a
    LEFT JOIN postings p ON a.id = p.account_id
    WHERE a.type IN ('assets', 'liabilities')
    GROUP BY a.id
    ORDER BY a.type, a.name
  `);

  return stmt.all();
}

function getLast30DayIncomeAndExpenses() {
  const stmt = db.prepare(`
    SELECT
      a.type,
      IFNULL(SUM(p.amount), 0) as total
    FROM postings p
    JOIN accounts a ON a.id = p.account_id
    JOIN transactions t ON t.id = p.transaction_id
    WHERE a.type IN ('income', 'expenses')
      AND date(t.date) >= date('now', '-30 days')
    GROUP BY a.type
  `);

  return stmt.all();
}

function getRecurringTransactions() {
  const stmt = db.prepare(`
    SELECT
      rt.*,
      da.name as debit_account,
      ca.name as credit_account
    FROM recurring_transactions rt
    JOIN accounts da ON da.id = rt.debit_account_id
    JOIN accounts ca ON ca.id = rt.credit_account_id
  `);

  return stmt.all();
}

module.exports = {
  getBalances,
  getIncomeStatement,
  getNetWorthData,
  getLast30DayIncomeAndExpenses,
  getRecurringTransactions
};
