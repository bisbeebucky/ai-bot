// tests/helpers/testDb.js
const Database = require("better-sqlite3");

function createTestDb() {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE postings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      amount REAL NOT NULL
    );

    CREATE TABLE debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      apr REAL NOT NULL DEFAULT 0,
      minimum REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE recurring_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT,
      description TEXT,
      postings_json TEXT NOT NULL,
      frequency TEXT NOT NULL,
      next_due_date TEXT NOT NULL
    );
  `);

  return db;
}

function seedBasicAccounts(db) {
  const insert = db.prepare(`
    INSERT INTO accounts (name) VALUES (?)
  `);

  [
    "assets:bank",
    "assets:savings",
    "expenses:food",
    "expenses:misc",
    "income:salary"
  ].forEach((name) => insert.run(name));
}

function getAccountId(db, name) {
  const row = db.prepare(`
    SELECT id FROM accounts WHERE name = ?
  `).get(name);

  if (!row) {
    throw new Error(`Account not found in test DB: ${name}`);
  }

  return row.id;
}

function addTransaction(db, { date, description, postings }) {
  const tx = db.prepare(`
    INSERT INTO transactions (date, description)
    VALUES (?, ?)
  `).run(date, description || "");

  const insertPosting = db.prepare(`
    INSERT INTO postings (transaction_id, account_id, amount)
    VALUES (?, ?, ?)
  `);

  for (const p of postings) {
    insertPosting.run(tx.lastInsertRowid, getAccountId(db, p.account), p.amount);
  }

  return tx.lastInsertRowid;
}

function addRecurring(db, {
  hash = "abcdef",
  description,
  frequency = "monthly",
  nextDueDate,
  postings
}) {
  db.prepare(`
    INSERT INTO recurring_transactions (hash, description, postings_json, frequency, next_due_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    hash,
    description || "",
    JSON.stringify(postings),
    frequency,
    nextDueDate
  );
}

module.exports = {
  createTestDb,
  seedBasicAccounts,
  getAccountId,
  addTransaction,
  addRecurring
};
