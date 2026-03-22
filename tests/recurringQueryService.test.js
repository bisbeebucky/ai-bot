// tests/recurringQueryService.test.js
const test = require("node:test");
const assert = require("node:assert/strict");

const recurringQueryService = require("../services/recurringQueryService");
const {
  createTestDb,
  seedBasicAccounts,
  addRecurring
} = require("./helpers/testDb");

test("getRecurringItems parses recurring rows into items", () => {
  const db = createTestDb();
  seedBasicAccounts(db);

  addRecurring(db, {
    hash: "abc123",
    description: "Rent",
    nextDueDate: "2026-04-03",
    postings: [
      { account: "expenses:misc", amount: 500 },
      { account: "assets:bank", amount: -500 }
    ]
  });

  const result = recurringQueryService.getRecurringItems(db, 25);

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].description, "Rent");
  assert.equal(result.items[0].amount, 500);
  assert.equal(result.items[0].type, "bill");
});

test("getUpcomingIncome returns only income items", () => {
  const db = createTestDb();
  seedBasicAccounts(db);

  addRecurring(db, {
    description: "salary",
    nextDueDate: "2026-04-03",
    postings: [
      { account: "assets:bank", amount: 1700 },
      { account: "income:salary", amount: -1700 }
    ]
  });

  addRecurring(db, {
    description: "Rent",
    nextDueDate: "2026-04-04",
    postings: [
      { account: "expenses:misc", amount: 500 },
      { account: "assets:bank", amount: -500 }
    ]
  });

  const result = recurringQueryService.getUpcomingIncome(db, 5);

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].description, "salary");
  assert.equal(result.items[0].amount, 1700);
});

test("getUpcomingBills returns only bill items", () => {
  const db = createTestDb();
  seedBasicAccounts(db);

  addRecurring(db, {
    description: "salary",
    nextDueDate: "2026-04-03",
    postings: [
      { account: "assets:bank", amount: 1700 },
      { account: "income:salary", amount: -1700 }
    ]
  });

  addRecurring(db, {
    description: "Rent",
    nextDueDate: "2026-04-04",
    postings: [
      { account: "expenses:misc", amount: 500 },
      { account: "assets:bank", amount: -500 }
    ]
  });

  const result = recurringQueryService.getUpcomingBills(db, 5);

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].description, "Rent");
  assert.equal(result.items[0].amount, 500);
});

test("getNextPayday returns earliest income item", () => {
  const db = createTestDb();
  seedBasicAccounts(db);

  addRecurring(db, {
    description: "bonus",
    nextDueDate: "2026-04-10",
    postings: [
      { account: "assets:bank", amount: 300 },
      { account: "income:salary", amount: -300 }
    ]
  });

  addRecurring(db, {
    description: "salary",
    nextDueDate: "2026-04-03",
    postings: [
      { account: "assets:bank", amount: 1700 },
      { account: "income:salary", amount: -1700 }
    ]
  });

  const result = recurringQueryService.getNextPayday(db);

  assert.equal(result.ok, true);
  assert.equal(result.item.description, "salary");
  assert.equal(result.item.nextDue, "2026-04-03");
});
