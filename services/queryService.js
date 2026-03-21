// services/queryService.js
function getBankAccount(db) {
  return db.prepare(`
    SELECT id, name
    FROM accounts
    WHERE name = 'assets:bank'
  `).get() || null;
}

function getCurrentBankBalance(db) {
  const account = getBankAccount(db);
  if (!account) {
    return {
      ok: false,
      error: "assets:bank account not found."
    };
  }

  const row = db.prepare(`
    SELECT IFNULL(SUM(amount), 0) AS balance
    FROM postings
    WHERE account_id = ?
  `).get(account.id);

  return {
    ok: true,
    account,
    balance: Number(row?.balance) || 0
  };
}

function getDebtSummary(db) {
  const rows = db.prepare(`
    SELECT id, name, balance, apr, minimum
    FROM debts
    ORDER BY id ASC
  `).all();

  const debts = rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name || ""),
    balance: Number(row.balance) || 0,
    apr: Number(row.apr) || 0,
    minimum: Number(row.minimum) || 0
  }));

  return {
    ok: true,
    debts,
    totalDebt: debts.reduce((sum, d) => sum + d.balance, 0),
    totalMinimum: debts.reduce((sum, d) => sum + d.minimum, 0)
  };
}

function getRecurringItems(db, limit = 25) {
  const rows = db.prepare(`
    SELECT id, hash, description, postings_json, frequency, next_due_date
    FROM recurring_transactions
    ORDER BY date(next_due_date) ASC, id ASC
    LIMIT ?
  `).all(limit);

  const items = rows.map((row) => {
    let amount = 0;
    let type = "unknown";

    try {
      const postings = JSON.parse(row.postings_json);
      const bankLine = Array.isArray(postings)
        ? postings.find((p) => p.account === "assets:bank")
        : null;

      if (bankLine) {
        const bankAmt = Number(bankLine.amount) || 0;
        amount = Math.abs(bankAmt);
        type = bankAmt >= 0 ? "income" : "bill";
      }
    } catch (_) {
      // ignore malformed postings_json
    }

    return {
      id: Number(row.id),
      ref: String(row.hash || "").slice(0, 6),
      description: String(row.description || ""),
      amount,
      frequency: String(row.frequency || ""),
      nextDue: String(row.next_due_date || ""),
      type
    };
  });

  return {
    ok: true,
    items
  };
}

function getSpendingSummary(db, days = 30) {
  const rows = db.prepare(`
    SELECT a.name AS account,
           SUM(p.amount) AS total
    FROM postings p
    JOIN accounts a ON p.account_id = a.id
    JOIN transactions t ON p.transaction_id = t.id
    WHERE a.name LIKE 'expenses:%'
      AND date(t.date) >= date('now', ?)
    GROUP BY a.name
    ORDER BY total DESC
  `).all(`-${Number(days) || 30} day`);

  const categories = rows.map((r) => {
    const amount = Math.abs(Number(r.total) || 0);
    return {
      category: String(r.account || "").replace("expenses:", ""),
      amount
    };
  });

  return {
    ok: true,
    categories,
    total: categories.reduce((sum, c) => sum + c.amount, 0)
  };
}

module.exports = {
  getBankAccount,
  getCurrentBankBalance,
  getDebtSummary,
  getRecurringItems,
  getSpendingSummary
};
