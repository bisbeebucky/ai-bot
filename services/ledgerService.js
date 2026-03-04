// services/ledgerService.js

module.exports = function createLedgerService(db) {

  /* ===============================
     ACCOUNT TYPE INFERENCE
  =============================== */

  function inferAccountType(accountName) {
    if (accountName.startsWith("assets:")) return "ASSETS";
    if (accountName.startsWith("expenses:")) return "EXPENSES";
    if (accountName.startsWith("income:")) return "INCOME";
    if (accountName.startsWith("liabilities:")) return "LIABILITIES";
    return "OTHER";
  }

  function getOrCreateAccount(accountName) {

    const find = db.prepare(`
      SELECT id FROM accounts WHERE name = ?
    `);

    let account = find.get(accountName);
    if (account) return account.id;

    const insert = db.prepare(`
      INSERT INTO accounts (name, type)
      VALUES (?, ?)
    `);

    const type = inferAccountType(accountName);
    const result = insert.run(accountName, type);

    return result.lastInsertRowid;
  }

  /* ===============================
     TRANSACTIONS
  =============================== */

  function addTransaction(transaction) {

    if (!transaction.postings || transaction.postings.length < 2) {
      throw new Error("Transaction must contain at least two postings.");
    }

    for (const p of transaction.postings) {
      if (typeof p.amount !== "number" || isNaN(p.amount)) {
        throw new Error("Invalid posting amount.");
      }
    }

    const total = transaction.postings.reduce((sum, p) => sum + p.amount, 0);

    if (Math.abs(total) > 0.00001) {
      throw new Error("Transaction postings must balance to zero.");
    }

    const insertTransaction = db.prepare(`
      INSERT INTO transactions (date, description)
      VALUES (?, ?)
    `);

    const insertPosting = db.prepare(`
      INSERT INTO postings (transaction_id, account_id, amount)
      VALUES (?, ?, ?)
    `);

    const tx = db.transaction(() => {

      const result = insertTransaction.run(
        transaction.date,
        transaction.description
      );

      const transactionId = result.lastInsertRowid;

      for (const p of transaction.postings) {
        const accountId = getOrCreateAccount(p.account);
        insertPosting.run(transactionId, accountId, p.amount);
      }
    });

    tx();
  }

  function deleteLastTransaction() {

    const last = db.prepare(`
      SELECT id, date, description
      FROM transactions
      ORDER BY id DESC
      LIMIT 1
    `).get();

    if (!last) return null;

    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM postings WHERE transaction_id = ?`)
        .run(last.id);

      db.prepare(`DELETE FROM transactions WHERE id = ?`)
        .run(last.id);
    });

    tx();
    return last;
  }

  /* ===============================
     QUERIES
  =============================== */

  function getLedger(limit = 20, offset = 0) {

    const rows = db.prepare(`
      SELECT
        t.id as transaction_id,
        t.date,
        t.description,
        a.name as account,
        p.amount
      FROM transactions t
      JOIN postings p ON p.transaction_id = t.id
      JOIN accounts a ON a.id = p.account_id
      ORDER BY t.id DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    return rows.map(r => ({
      transactionId: r.transaction_id,
      date: r.date,
      description: r.description,
      account: r.account,
      amount: Number(r.amount) || 0
    }));
  }

  function getBalances() {

    const rows = db.prepare(`
      SELECT
        a.name as account,
        SUM(p.amount) as balance
      FROM accounts a
      JOIN postings p ON p.account_id = a.id
      GROUP BY a.id
    `).all();

    return rows.map(r => ({
      account: r.account,
      balance: Number(r.balance) || 0
    }));
  }

  function getLast30DayTotals() {

    const rows = db.prepare(`
      SELECT
        a.type as type,
        SUM(p.amount) as total
      FROM transactions t
      JOIN postings p ON p.transaction_id = t.id
      JOIN accounts a ON a.id = p.account_id
      WHERE t.date >= date('now', '-30 days')
        AND (a.type = 'INCOME' OR a.type = 'EXPENSES')
      GROUP BY a.type
    `).all();

    return rows.map(r => ({
      type: r.type,
      total: Math.abs(Number(r.total) || 0)
    }));
  }

  return {
    addTransaction,
    deleteLastTransaction,
    getLedger,
    getBalances,
    getLast30DayTotals
  };
};
