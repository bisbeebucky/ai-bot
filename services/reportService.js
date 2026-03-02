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

module.exports = {
  getBalances,
  getIncomeStatement,
  getNetWorthData
};
