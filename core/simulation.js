// core/simulation.js
function simulateCashflow(db, startingBalance, accountId, days = 30) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = new Date(today);
  end.setDate(end.getDate() + days);
  end.setHours(23, 59, 59, 999);

  const events = [];
  let balance = Number(startingBalance) || 0;
  let lowestBalance = balance;

  const recurring = db.prepare(`
    SELECT id, description, postings_json, frequency, next_due_date
    FROM recurring_transactions
  `).all();

  for (const r of recurring) {
    let due = parseYMD(r.next_due_date);
    if (!due) continue;

    while (due <= end) {
      if (due > today) {
        let postings;
        try {
          postings = JSON.parse(r.postings_json);
        } catch {
          postings = null;
        }

        if (Array.isArray(postings)) {
          let eventAmount = 0;

          for (const p of postings) {
            let resolvedAccountId = p.account_id;

            if (!resolvedAccountId && typeof p.account === "string") {
              const row = db
                .prepare(`SELECT id FROM accounts WHERE name = ?`)
                .get(p.account);
              resolvedAccountId = row?.id;
            }

            if (resolvedAccountId === accountId) {
              eventAmount += Number(p.amount) || 0;
            }
          }

          if (eventAmount !== 0) {
            events.push({
              date: ymd(due),
              description: r.description,
              amount: eventAmount
            });
          }
        }
      }

      due = nextDueDate(due, r.frequency);
      if (!due) break;
    }
  }

  // Sort by date, then income before expenses on the same day,
  // then fall back to description for stable ordering.
  events.sort((a, b) => {
    const byDate = String(a.date).localeCompare(String(b.date));
    if (byDate !== 0) return byDate;

    const aAmount = Number(a.amount) || 0;
    const bAmount = Number(b.amount) || 0;

    if (aAmount >= 0 && bAmount < 0) return -1;
    if (aAmount < 0 && bAmount >= 0) return 1;

    return String(a.description || "").localeCompare(String(b.description || ""));
  });

  const timeline = [];

  for (const event of events) {
    balance += Number(event.amount) || 0;
    if (balance < lowestBalance) lowestBalance = balance;

    timeline.push({
      date: event.date,
      description: event.description,
      amount: event.amount,
      balance
    });
  }

  return { timeline, lowestBalance };
}

function parseYMD(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;

  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nextDueDate(dateObj, frequency) {
  const d = new Date(dateObj);
  d.setHours(0, 0, 0, 0);

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

      if (d.getDate() !== day) {
        d.setDate(0);
      }
      d.setHours(0, 0, 0, 0);
      return d;
    }

    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      d.setHours(0, 0, 0, 0);
      return d;

    default:
      return null;
  }
}

module.exports = simulateCashflow;
