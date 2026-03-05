// services/recurringProcessor.js

// Treat all stored dates (YYYY-MM-DD) as DATE-ONLY in UTC.
// This avoids timezone drift (e.g., 5th turning into 4th).

function parseYMD_UTC(ymdStr) {
  // ymdStr: "YYYY-MM-DD"
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymdStr || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

function ymd_UTC(dateObj) {
  const y = dateObj.getUTCFullYear();
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function nextDueDateUTC(dateObjUTC, frequency) {
  const d = new Date(dateObjUTC.getTime());

  switch ((frequency || "").toLowerCase()) {
    case "daily":
      d.setUTCDate(d.getUTCDate() + 1);
      return d;

    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      return d;

    case "monthly": {
      const day = d.getUTCDate(); // intended day-of-month
      d.setUTCMonth(d.getUTCMonth() + 1);

      // handle rollover (Jan 31 -> Feb last day)
      if (d.getUTCDate() !== day) {
        // setUTCDate(0) => last day of previous month (which is the month we advanced to)
        d.setUTCDate(0);
      }
      return d;
    }

    case "yearly":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      return d;

    default:
      return null;
  }
}

module.exports = function createRecurringProcessor(db, ledgerService) {
  function processDueRecurring(runDate = new Date()) {
    // Convert "now" into a UTC date-only string
    const todayUTC = new Date(Date.UTC(
      runDate.getFullYear(),
      runDate.getMonth(),
      runDate.getDate()
    ));
    const todayStr = ymd_UTC(todayUTC);

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

    const getLastTx = db.prepare(`
      SELECT id FROM transactions ORDER BY id DESC LIMIT 1
    `);

    const tx = db.transaction(() => {
      const dueRows = selectDue.all(todayStr);
      let postedCount = 0;

      for (const r of dueRows) {
        const occurrenceDate = r.next_due_date; // already YYYY-MM-DD

        let postings;
        try {
          postings = JSON.parse(r.postings_json);
        } catch {
          postings = null;
        }
        if (!Array.isArray(postings) || postings.length < 2) continue;

        // Post the transaction for the occurrence date
        ledgerService.addTransaction({
          date: occurrenceDate,
          description: r.description,
          postings
        });

        const lastTx = getLastTx.get();
        const txId = lastTx?.id;
        if (!txId) continue;

        try {
          // This prevents double-posting same recurring occurrence.
          markEvent.run(r.id, occurrenceDate, txId);
        } catch (e) {
          // Already posted -> remove duplicate tx we just created
          db.prepare(`DELETE FROM postings WHERE transaction_id = ?`).run(txId);
          db.prepare(`DELETE FROM transactions WHERE id = ?`).run(txId);
          continue;
        }

        // Advance next_due_date forward until it's strictly after todayStr
        let next = parseYMD_UTC(r.next_due_date);
        if (!next) continue;

        while (ymd_UTC(next) <= todayStr) {
          const advanced = nextDueDateUTC(next, r.frequency);
          if (!advanced) break;
          next = advanced;
        }

        updateNextDue.run(ymd_UTC(next), r.id);
        postedCount += 1;
      }

      return postedCount;
    });

    return tx();
  }

  return { processDueRecurring };
};
