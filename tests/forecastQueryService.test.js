// tests/forecastQueryService.test.js
const test = require("node:test");
const assert = require("node:assert/strict");

const forecastQueryService = require("../services/forecastQueryService");
const {
  createTestDb,
  seedBasicAccounts,
  addTransaction,
  addRecurring
} = require("./helpers/testDb");

test("getBalanceOnDate returns current balance when no future events happen before target", () => {
  const db = createTestDb();
  seedBasicAccounts(db);

  addTransaction(db, {
    date: "2026-03-01",
    description: "starting cash",
    postings: [
      { account: "assets:bank", amount: 500 },
      { account: "income:salary", amount: -500 }
    ]
  });

  const simulateCashflow = () => ({
    timeline: [],
    lowestBalance: 500
  });

  const result = forecastQueryService.getBalanceOnDate(
    db,
    simulateCashflow,
    "2026-04-03"
  );

  assert.equal(result.ok, true);
  assert.equal(result.currentBalance, 500);
  assert.equal(result.estimatedBalance, 500);
});

test("getForecastWindow returns lowest balance and first negative date", () => {
  const db = createTestDb();
  seedBasicAccounts(db);

  addTransaction(db, {
    date: "2026-03-01",
    description: "starting cash",
    postings: [
      { account: "assets:bank", amount: 100 },
      { account: "income:salary", amount: -100 }
    ]
  });

  const simulateCashflow = () => ({
    timeline: [
      { date: "2026-03-10", balance: 20, amount: -80, description: "Bill A" },
      { date: "2026-03-15", balance: -15, amount: -35, description: "Bill B" }
    ],
    lowestBalance: -15
  });

  const result = forecastQueryService.getForecastWindow(db, simulateCashflow, 30);

  assert.equal(result.ok, true);
  assert.equal(result.currentBalance, 100);
  assert.equal(result.lowestBalance, -15);
  assert.equal(result.lowestDate, "2026-03-15");
  assert.equal(result.firstNegativeDate, "2026-03-15");
});

test("getWhyData handles no future events", () => {
  const db = createTestDb();
  seedBasicAccounts(db);

  addTransaction(db, {
    date: "2026-03-01",
    description: "starting cash",
    postings: [
      { account: "assets:bank", amount: 250 },
      { account: "income:salary", amount: -250 }
    ]
  });

  const simulateCashflow = () => ({
    timeline: [],
    lowestBalance: 250
  });

  const result = forecastQueryService.getWhyData(db, simulateCashflow, 30);

  assert.equal(result.ok, true);
  assert.equal(result.noEvents, true);
  assert.equal(result.lowestBalance, 250);
  assert.deepEqual(result.causes, []);
});

test("getWhyData sorts expense causes before the low point", () => {
  const db = createTestDb();
  seedBasicAccounts(db);

  addTransaction(db, {
    date: "2026-03-01",
    description: "starting cash",
    postings: [
      { account: "assets:bank", amount: 1000 },
      { account: "income:salary", amount: -1000 }
    ]
  });

  const simulateCashflow = () => ({
    timeline: [
      { date: "2026-03-10", balance: 800, amount: -200, description: "Rent" },
      { date: "2026-03-12", balance: 750, amount: -50, description: "Phone" },
      { date: "2026-03-20", balance: 900, amount: 150, description: "Refund" }
    ],
    lowestBalance: 750
  });

  const result = forecastQueryService.getWhyData(db, simulateCashflow, 30);

  assert.equal(result.ok, true);
  assert.equal(result.noEvents, false);
  assert.equal(result.noLowerEvent, false);
  assert.equal(result.lowestDate, "2026-03-12");
  assert.equal(result.causes.length, 2);
  assert.equal(result.causes[0].description, "Rent");
  assert.equal(result.causes[0].amount, 200);
  assert.equal(result.causes[1].description, "Phone");
  assert.equal(result.causes[1].amount, 50);
});

test("getUntilPaydayData returns next payday and safe flag", () => {
  const db = createTestDb();
  seedBasicAccounts(db);

  addTransaction(db, {
    date: "2026-03-01",
    description: "starting cash",
    postings: [
      { account: "assets:bank", amount: 400 },
      { account: "income:salary", amount: -400 }
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

  const simulateCashflow = () => ({
    timeline: [
      { date: "2026-03-28", balance: 150, amount: -250, description: "Rent" }
    ],
    lowestBalance: 150
  });

  const result = forecastQueryService.getUntilPaydayData(db, simulateCashflow);

  assert.equal(result.ok, true);
  assert.equal(result.currentBalance, 400);
  assert.equal(result.lowestBeforePayday, 150);
  assert.equal(result.nextPayday, "2026-04-03");
  assert.equal(result.safe, true);
});
