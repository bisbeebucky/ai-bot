// core/simulation.js
function simulateCashflow(db, startingBalance, accountId, days = 30) {
  const today = new Date();
  const timeline = [];
  let balance = Number(startingBalance) || 0;
  let lowestBalance = balance;

  const end = new Date(today);
  end.setDate(end.getDate() + days);

  // Load recurring rules from NEW schema
  const recurring = db.prepare(`
    SELECT id, description, postings_json, frequency, next_due_date
    FROM recurring_transactions
  `).all();

  for (const r of recurring) {
    // Validate next_due_date
    let due = new Date(r.next_due_date);
    if (isNaN(due.getTime())) continue;

    // Walk occurrences up to end date (do NOT mutate DB)
    while (due <= end) {
      // Only add events that occur after "today"
      if (due > today) {
        let postings;
        try {
          postings = JSON.parse(r.postings_json);
        } catch {
          postings = null;
        }

        if (Array.isArray(postings)) {
          // Apply postings to the target accountId
          for (const p of postings) {
            // p can be {account, amount} or {account_id, amount}
            const pAccountId = p.account_id;

            // If posting references by name, we can resolve it once here if needed
            let resolvedAccountId = pAccountId;

            if (!resolvedAccountId && typeof p.account === "string") {
              const row = db
                .prepare(`SELECT id FROM accounts WHERE name = ?`)
                .get(p.account);
              resolvedAccountId = row?.id;
            }

            if (resolvedAccountId === accountId) {
              const amt = Number(p.amount) || 0;
              balance += amt;
              if (balance < lowestBalance) lowestBalance = balance;
            }
          }

          timeline.push({
            date: due.toISOString().slice(0, 10),
            description: r.description,
            balance
          });
        }
      }

      // advance to next occurrence
      due = nextDueDate(due, r.frequency);
      if (!due) break;
    }
  }

  return { timeline, lowestBalance };
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

      // handle month rollover (e.g., Jan 31 -> Feb)
      if (d.getDate() !== day) {
        d.setDate(0); // last day of previous month
      }
      return d;
    }

    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      return d;

    default:
      return null; // unknown frequency
  }
}

module.exports = simulateCashflow;
