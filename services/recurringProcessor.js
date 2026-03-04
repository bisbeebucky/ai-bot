// services/recurringProcessor.js
function ymd(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

function nextDueDate(dateObj, frequency) {
  const d = new Date(dateObj);
  switch ((frequency || "").toLowerCase()) {
    case "daily":
      d.setDate(d.getDate() + 1);
      return d;

    case "weekly":
      d.setDate(d.getDate() + 7);
      return d;

    case "monthly": {
      const day = d.getDate();
      d.setMonth(d.getMonth() + 1);
      // handle rollover (Jan 31 -> Feb last day)
      if (d.getDate() !== day) d.setDate(0);
      return d;
    }

    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      return d;

    default:
      return null;
  }
}

module.exports = function createRecurringProcessor(db, ledgerService) {
  function processDueRecurring(runDate = new Date()) {
    const todayStr = ymd(runDate);

    const selectDue = db.prepare(`
      SELECT id, description, postings_json, frequency, next_due_date
      FROM recurring_transactions
      WHERE date(next_due_date) <= date(?)
      ORDER BY date(next_due_date) ASC, id ASC
    `);

    const markEvent = db.prepare(`
      INSERT INTO recurring_events (recurring_id, occurrence_date, transaction_id)
      VALUES (?, ?, ?)
    `);

    const updateNextDue = db.prepare(`
      UPDATE recurring_transactions
      SET next_due_date = ?
      WHERE id = ?
    `);

    const tx = db.transaction(() => {
      const dueRows = selectDue.all(todayStr);
      let postedCount = 0;

      for (const r of dueRows) {
        // Attempt to post exactly for r.next_due_date (not “today”)
        const occurrenceDate = r.next_due_date;

        // If already posted (unique constraint), skip safely
        // We detect by trying to insert after creating tx, and rolling back that row if constraint fails.
        let postings;
        try {
          postings = JSON.parse(r.postings_json);
        } catch {
          postings = null;
        }
        if (!Array.isArray(postings) || postings.length < 2) continue;

        // Write the real ledger transaction
        ledgerService.addTransaction({
          date: occurrenceDate,
          description: r.description,
          postings
        });

        // Get the transaction id we just inserted (best-sqlite3 exposes last row id on the insert,
        // but ledgerService encapsulates it. So we fetch last tx id reliably here.)
        const lastTx = db.prepare(`
          SELECT id FROM transactions ORDER BY id DESC LIMIT 1
        `).get();

        const txId = lastTx?.id;
        if (!txId) continue;

        try {
          markEvent.run(r.id, occurrenceDate, txId);
        } catch (e) {
          // UNIQUE(recurring_id, occurrence_date) hit -> already posted earlier
          // Undo the duplicate transaction we just wrote (delete postings+tx)
          db.prepare(`DELETE FROM postings WHERE transaction_id = ?`).run(txId);
          db.prepare(`DELETE FROM transactions WHERE id = ?`).run(txId);
          continue;
        }

        // Advance next_due_date forward until it’s in the future
        let next = new Date(r.next_due_date);
        next.setHours(0, 0, 0, 0);

        while (ymd(next) <= todayStr) {
          const advanced = nextDueDate(next, r.frequency);
          if (!advanced) break;
          next = advanced;
          next.setHours(0, 0, 0, 0);
        }

        updateNextDue.run(ymd(next), r.id);
        postedCount += 1;
      }

      return postedCount;
    });

    return tx();
  }

  return { processDueRecurring };
};
