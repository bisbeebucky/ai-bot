const db = require("../models/db");

/*
  Ensures account exists.
  If not, creates it.
*/
function getOrCreateAccount(accountName, type) {
  const find = db.prepare(`
    SELECT id FROM accounts WHERE name = ?
  `);

  let account = find.get(accountName);

  if (account) return account.id;

  const insert = db.prepare(`
    INSERT INTO accounts (name, type)
    VALUES (?, ?)
  `);

  const result = insert.run(accountName, type);
  return result.lastInsertRowid;
}

function addTransaction(date, description, postings) {

  const insertTransaction = db.prepare(`
    INSERT INTO transactions (date, description)
    VALUES (?, ?)
  `);

  const insertPosting = db.prepare(`
    INSERT INTO postings (transaction_id, account_id, amount)
    VALUES (?, ?, ?)
  `);

  const tx = db.transaction(() => {

    const result = insertTransaction.run(date, description);
    const transactionId = result.lastInsertRowid;

    for (const p of postings) {

      const accountId = getOrCreateAccount(p.account, p.type);

      insertPosting.run(
        transactionId,
        accountId,
        p.amount
      );
    }
  });

  tx();
}

module.exports = { addTransaction };
