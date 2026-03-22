// tests/simulation.test.js
const test = require("node:test");
const assert = require("node:assert/strict");

const simulateCashflow = require("../core/simulation");
const {
  createTestDb,
  seedBasicAccounts,
  addRecurring
} = require("./helpers/testDb");

function futureYMD(daysAhead) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysAhead);

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

test("simulateCashflow returns unchanged balance with no recurring events", () => {
  const db = createTestDb();
  seedBasicAccounts(db);

  const currentBalance = 500;
  const bankAccountId = db.prepare(
    `SELECT id FROM accounts WHERE name = 'assets:bank'`
  ).get().id;

  const result = simulateCashflow(db, currentBalance, bankAccountId, 30);

  assert.ok(result);
  assert.ok(Array.isArray(result.timeline));
  assert.equal(result.timeline.length, 0);
  assert.equal(result.lowestBalance, 500);
});

test("simulateCashflow applies one future bill and lowers balance", () => {
  const db = createTestDb();
  seedBasicAccounts(db);

  addRecurring(db, {
    description: "Rent",
    nextDueDate: futureYMD(3),
    frequency: "monthly",
    postings: [
      { account: "expenses:misc", amount: 200 },
      { account: "assets:bank", amount: -200 }
    ]
  });

  const currentBalance = 500;
  const bankAccountId = db.prepare(
    `SELECT id FROM accounts WHERE name = 'assets:bank'`
  ).get().id;

  const result = simulateCashflow(db, currentBalance, bankAccountId, 5);

  assert.ok(result);
  assert.ok(Array.isArray(result.timeline));
  assert.ok(result.timeline.length >= 1);

  const rentEvent = result.timeline.find((e) => e.description === "Rent");
  assert.ok(rentEvent);
  assert.equal(Number(rentEvent.amount), -200);
  assert.equal(Number(rentEvent.balance), 300);
  assert.equal(result.lowestBalance, 300);
});

test("simulateCashflow applies one future income and does not lower lowest balance", () => {
  const db = createTestDb();
  seedBasicAccounts(db);

  addRecurring(db, {
    description: "Paycheck",
    nextDueDate: futureYMD(3),
    frequency: "monthly",
    postings: [
      { account: "assets:bank", amount: 1000 },
      { account: "income:salary", amount: -1000 }
    ]
  });

  const currentBalance = 500;
  const bankAccountId = db.prepare(
    `SELECT id FROM accounts WHERE name = 'assets:bank'`
  ).get().id;

  const result = simulateCashflow(db, currentBalance, bankAccountId, 5);

  assert.ok(result);
  assert.ok(Array.isArray(result.timeline));
  assert.ok(result.timeline.length >= 1);

  const payEvent = result.timeline.find((e) => e.description === "Paycheck");
  assert.ok(payEvent);
  assert.equal(Number(payEvent.amount), 1000);
  assert.equal(Number(payEvent.balance), 1500);
  assert.equal(result.lowestBalance, 500);
});

test("simulateCashflow tracks lowest balance across multiple events", () => {
  const db = createTestDb();
  seedBasicAccounts(db);

  addRecurring(db, {
    description: "Paycheck",
    nextDueDate: futureYMD(1),
    frequency: "monthly",
    postings: [
      { account: "assets:bank", amount: 300 },
      { account: "income:salary", amount: -300 }
    ]
  });

  addRecurring(db, {
    description: "Rent",
    nextDueDate: futureYMD(3),
    frequency: "monthly",
    postings: [
      { account: "expenses:misc", amount: 700 },
      { account: "assets:bank", amount: -700 }
    ]
  });

  addRecurring(db, {
    description: "Phone",
    nextDueDate: futureYMD(5),
    frequency: "monthly",
    postings: [
      { account: "expenses:misc", amount: 50 },
      { account: "assets:bank", amount: -50 }
    ]
  });

  const currentBalance = 500;
  const bankAccountId = db.prepare(
    `SELECT id FROM accounts WHERE name = 'assets:bank'`
  ).get().id;

  const result = simulateCashflow(db, currentBalance, bankAccountId, 7);

  assert.ok(result);
  assert.ok(Array.isArray(result.timeline));
  assert.ok(result.timeline.length >= 3);

  // Expected running balance:
  // 500 + 300 = 800
  // 800 - 700 = 100
  // 100 - 50 = 50
  assert.equal(result.lowestBalance, 50);
});

test("simulateCashflow includes same-day events in the timeline", () => {
  const db = createTestDb();
  seedBasicAccounts(db);

  const sameDay = futureYMD(3);

  addRecurring(db, {
    hash: "income1",
    description: "Side Gig",
    nextDueDate: sameDay,
    frequency: "monthly",
    postings: [
      { account: "assets:bank", amount: 100 },
      { account: "income:salary", amount: -100 }
    ]
  });

  addRecurring(db, {
    hash: "bill1",
    description: "Utility Bill",
    nextDueDate: sameDay,
    frequency: "monthly",
    postings: [
      { account: "expenses:misc", amount: 40 },
      { account: "assets:bank", amount: -40 }
    ]
  });

  const currentBalance = 200;
  const bankAccountId = db.prepare(
    `SELECT id FROM accounts WHERE name = 'assets:bank'`
  ).get().id;

  const result = simulateCashflow(db, currentBalance, bankAccountId, 5);

  assert.ok(result);
  assert.ok(Array.isArray(result.timeline));

  const sameDayEvents = result.timeline.filter((e) => e.date === sameDay);
  assert.ok(sameDayEvents.length >= 2);
});
