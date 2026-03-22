// tests/queryService.test.js
const test = require("node:test");
const assert = require("node:assert/strict");

const queryService = require("../services/queryService");
const {
  createTestDb,
  seedBasicAccounts,
  addTransaction
} = require("./helpers/testDb");

test("getCurrentBankBalance returns current assets:bank balance", () => {
  const db = createTestDb();
  seedBasicAccounts(db);

  addTransaction(db, {
    date: "2026-03-01",
    description: "paycheck",
    postings: [
      { account: "assets:bank", amount: 1000 },
      { account: "income:salary", amount: -1000 }
    ]
  });

  addTransaction(db, {
    date: "2026-03-02",
    description: "groceries",
    postings: [
      { account: "expenses:food", amount: 75 },
      { account: "assets:bank", amount: -75 }
    ]
  });

  const result = queryService.getCurrentBankBalance(db);

  assert.equal(result.ok, true);
  assert.equal(result.account.name, "assets:bank");
  assert.equal(result.balance, 925);
});

test("getDebtSummary returns debts and totals", () => {
  const db = createTestDb();
  seedBasicAccounts(db);

  db.prepare(`
    INSERT INTO debts (name, balance, apr, minimum)
    VALUES (?, ?, ?, ?)
  `).run("Capital One", 1200, 24.99, 35);

  db.prepare(`
    INSERT INTO debts (name, balance, apr, minimum)
    VALUES (?, ?, ?, ?)
  `).run("Wells Fargo", 800, 19.5, 25);

  const result = queryService.getDebtSummary(db);

  assert.equal(result.ok, true);
  assert.equal(result.debts.length, 2);
  assert.equal(result.totalDebt, 2000);
  assert.equal(result.totalMinimum, 60);
});

test("getSpendingSummary returns grouped expense totals", () => {
  const db = createTestDb();
  seedBasicAccounts(db);

  addTransaction(db, {
    date: "2026-03-01",
    description: "groceries",
    postings: [
      { account: "expenses:food", amount: 40 },
      { account: "assets:bank", amount: -40 }
    ]
  });

  addTransaction(db, {
    date: "2026-03-03",
    description: "misc item",
    postings: [
      { account: "expenses:misc", amount: 10 },
      { account: "assets:bank", amount: -10 }
    ]
  });

  addTransaction(db, {
    date: "2026-03-04",
    description: "more groceries",
    postings: [
      { account: "expenses:food", amount: 15 },
      { account: "assets:bank", amount: -15 }
    ]
  });

  const result = queryService.getSpendingSummary(db, 30);

  assert.equal(result.ok, true);
  assert.equal(result.total, 65);

  const food = result.categories.find((c) => c.category === "food");
  const misc = result.categories.find((c) => c.category === "misc");

  assert.equal(food.amount, 55);
  assert.equal(misc.amount, 10);
});
