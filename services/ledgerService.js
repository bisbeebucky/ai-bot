// services/ledgerService.js
const crypto = require("crypto");

module.exports = function createLedgerService(db) {
  /* ===============================
     SCHEMA SAFETY (hash support)
  =============================== */

  function ensureTransactionHashColumn() {
    // Add column if missing
    const cols = db.prepare(`PRAGMA table_info(transactions)`).all();
    const hasHash = cols.some((c) => c.name === "hash");

    if (!hasHash) {
      db.exec(`ALTER TABLE transactions ADD COLUMN hash TEXT;`);
    }

    // Add unique index (safe even if some hashes are NULL)
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(hash);`);
  }

  ensureTransactionHashColumn();

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
    const find = db.prepare(`SELECT id FROM accounts WHERE name = ?`);
    const existing = find.get(accountName);
    if (existing) return existing.id;

    const insert = db.prepare(`
      INSERT INTO accounts (name, type)
      VALUES (?, ?)
    `);

    const type = inferAccountType(accountName);
    const result = insert.run(accountName, type);
    return result.lastInsertRowid;
  }

  /* ===============================
     HASHING
  =============================== */

  function stablePostingsForHash(postings) {
    // sort by account so hash is stable regardless of order
    return postings
      .map((p) => ({
        account: String(p.account || "").trim(),
        amount: Number(p.amount)
      }))
      .sort((a, b) => a.account.localeCompare(b.account));
  }

  function makeTxHash({ date, description, postings }) {
    const payload = {
      date: String(date),
      description: String(description || "").trim(),
      postings: stablePostingsForHash(postings),
      // nonce prevents accidental duplicates if you enter exact same tx twice
      nonce: crypto.randomUUID()
    };

    return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  }

  /* ===============================
     TRANSACTIONS
  =============================== */

  function addTransaction(transaction) {
    if (!transaction || typeof transaction !== "object") {
      throw new Error("Transaction must be an object.");
    }

    if (!transaction.date || typeof transaction.date !== "string") {
      throw new Error("Transaction.date must be YYYY-MM-DD string.");
    }

    if (!transaction.description || typeof transaction.description !== "string") {
      throw new Error("Transaction.description must be a string.");
    }

    if (!Array.isArray(transaction.postings) || transaction.postings.length < 2) {
      throw new Error("Transaction must contain at least two postings.");
    }

    for (const p of transaction.postings) {
      if (!p || typeof p.account !== "string" || !p.account.trim()) {
        throw new Error("Each posting must have an account string.");
      }
      if (typeof p.amount !== "number" || Number.isNaN(p.amount)) {
        throw new Error("Invalid posting amount.");
      }
    }

    const total = transaction.postings.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(total) > 0.00001) {
      throw new Error("Transaction postings must balance to zero.");
    }

    const hash = makeTxHash(transaction);

    const insertTransaction = db.prepare(`
      INSERT INTO transactions (date, description, hash)
      VALUES (?, ?, ?)
    `);

    const insertPosting = db.prepare(`
      INSERT INTO postings (transaction_id, account_id, amount)
      VALUES (?, ?, ?)
    `);

    const tx = db.transaction(() => {
      const result = insertTransaction.run(transaction.date, transaction.description, hash);
      const transactionId = result.lastInsertRowid;

      for (const p of transaction.postings) {
        const accountId = getOrCreateAccount(p.account);
        insertPosting.run(transactionId, accountId, p.amount);
      }

      return { transactionId, hash };
    });

    return tx();
  }

  function deleteLastTransaction() {
    const last = db.prepare(`
      SELECT id, hash, date, description
      FROM transactions
      ORDER BY id DESC
      LIMIT 1
    `).get();

    if (!last) return null;

    db.transaction(() => {
      db.prepare(`DELETE FROM postings WHERE transaction_id = ?`).run(last.id);
      db.prepare(`DELETE FROM transactions WHERE id = ?`).run(last.id);
    })();

    return last;
  }

  function getRecentTransactions(limit = 5) {
    const rows = db.prepare(`
      SELECT
        t.id,
        t.hash,
        t.date,
        t.description,
        COALESCE(
          (
            SELECT p.amount
            FROM postings p
            JOIN accounts a ON a.id = p.account_id
            WHERE p.transaction_id = t.id
              AND a.name = 'assets:bank'
            LIMIT 1
          ),
          (
            SELECT p.amount
            FROM postings p
            JOIN accounts a ON a.id = p.account_id
            WHERE p.transaction_id = t.id
              AND a.name = 'assets:savings'
            LIMIT 1
          ),
          (
            SELECT
              CASE
                WHEN a.name LIKE 'expenses:%' THEN -ABS(p.amount)
                WHEN a.name LIKE 'income:%' THEN ABS(p.amount)
                ELSE p.amount
              END
            FROM postings p
            JOIN accounts a ON a.id = p.account_id
            WHERE p.transaction_id = t.id
            ORDER BY ABS(p.amount) DESC, p.id ASC
            LIMIT 1
          ),
          0
        ) AS amount
      FROM transactions t
      ORDER BY t.id DESC
      LIMIT ?
    `).all(limit);

    return rows.map((r) => ({
      id: r.id,
      hash: r.hash,
      date: r.date,
      description: r.description,
      amount: Number(r.amount) || 0
    }));
  }

  function deleteTransactionByHashPrefix(prefix) {
    const p = String(prefix || "").trim();
    if (!p) return null;

    const row = db.prepare(`
      SELECT id, hash, date, description
      FROM transactions
      WHERE hash LIKE ?
      ORDER BY id DESC
      LIMIT 1
    `).get(`${p}%`);

    if (!row) return null;

    db.transaction(() => {
      db.prepare(`DELETE FROM postings WHERE transaction_id = ?`).run(row.id);
      db.prepare(`DELETE FROM transactions WHERE id = ?`).run(row.id);
    })();

    return row;
  }

  /* ===============================
     QUERIES
  =============================== */

  function getLedger(limit = 20, offset = 0) {
    const rows = db.prepare(`
      SELECT
        t.id as transaction_id,
        t.hash as hash,
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

    return rows.map((r) => ({
      transactionId: r.transaction_id,
      hash: r.hash,
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
        IFNULL(SUM(p.amount), 0) as balance
      FROM accounts a
      LEFT JOIN postings p ON p.account_id = a.id
      GROUP BY a.id
      ORDER BY a.name
    `).all();

    return rows.map((r) => ({
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
      WHERE date(t.date) >= date('now', '-30 days')
        AND (a.type = 'INCOME' OR a.type = 'EXPENSES')
      GROUP BY a.type
    `).all();

    return rows.map((r) => ({
      type: r.type,
      total: Math.abs(Number(r.total) || 0)
    }));
  }

  return {
    addTransaction,
    deleteLastTransaction,
    deleteTransactionByHashPrefix,
    getRecentTransactions,
    getLedger,
    getBalances,
    getLast30DayTotals
  };
};
