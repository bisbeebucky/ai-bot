const crypto = require("crypto");

function stripQuotes(s) {
  const t = String(s || "").trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) return t.slice(1, -1).trim();
  return t;
}

function ymd(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function lastDayOfMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function computeNextDueDate(frequency, monthlySpec) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const freq = (frequency || "").toLowerCase();

  if (freq === "daily") {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }

  if (freq === "weekly") {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return d;
  }

  if (freq === "yearly") {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() + 1);
    return d;
  }

  if (freq === "monthly") {
    const year = today.getFullYear();
    const month = today.getMonth();

    let targetDay;
    if (monthlySpec?.kind === "last") {
      targetDay = lastDayOfMonth(year, month);
    } else if (monthlySpec?.kind === "day") {
      targetDay = Math.min(monthlySpec.day, lastDayOfMonth(year, month));
    } else {
      targetDay = Math.min(today.getDate(), lastDayOfMonth(year, month));
    }

    const candidate = new Date(year, month, targetDay);
    candidate.setHours(0, 0, 0, 0);

    if (candidate < today) {
      const ny = new Date(year, month + 1, 1).getFullYear();
      const nm = new Date(year, month + 1, 1).getMonth();

      let nextTargetDay;
      if (monthlySpec?.kind === "last") {
        nextTargetDay = lastDayOfMonth(ny, nm);
      } else if (monthlySpec?.kind === "day") {
        nextTargetDay = Math.min(monthlySpec.day, lastDayOfMonth(ny, nm));
      } else {
        nextTargetDay = Math.min(today.getDate(), lastDayOfMonth(ny, nm));
      }

      const nextCandidate = new Date(ny, nm, nextTargetDay);
      nextCandidate.setHours(0, 0, 0, 0);
      return nextCandidate;
    }

    return candidate;
  }

  return null;
}

function makeHash(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

module.exports = function registerRecurringHandler(bot, deps) {
  const { db } = deps;

  // Bills (outflow)
  // /recurring "T-Mobile" 95 monthly 10
  // /recurring rent 427 monthly 3
  // /recurring xfinity 80 monthly last
  bot.onText(
    /^\/recurring\s+(.+?)\s+(\d+(\.\d+)?)\s+(daily|weekly|monthly|yearly)(?:\s+(last|\d{1,2}))?$/i,
    (msg, match) => {
      const chatId = msg.chat.id;

      try {
        let description = stripQuotes(match[1]);
        const amount = Number(match[2]);
        const frequency = match[4].toLowerCase();
        const monthlyArg = match[5];

        if (!Number.isFinite(amount) || amount <= 0) {
          return bot.sendMessage(chatId, "Amount must be a positive number.");
        }

        let monthlySpec = null;
        if (frequency === "monthly") {
          if (!monthlyArg) monthlySpec = null;
          else if (String(monthlyArg).toLowerCase() === "last") monthlySpec = { kind: "last" };
          else {
            const day = Number(monthlyArg);
            if (!Number.isInteger(day) || day < 1 || day > 31) {
              return bot.sendMessage(chatId, "Monthly day must be 1-31 or 'last'.");
            }
            monthlySpec = { kind: "day", day };
          }
        }

        const nextDue = computeNextDueDate(frequency, monthlySpec);
        if (!nextDue) return bot.sendMessage(chatId, "Invalid frequency.");

        // Outflow: bank decreases
        const postings = [
          { account: "assets:bank", amount: -amount },
          { account: "expenses:recurring", amount: amount }
        ];

        const postings_json = JSON.stringify(postings);
        const next_due_date = ymd(nextDue);
        const hash = makeHash(`${description}|${postings_json}|${frequency}|${next_due_date}`);

        db.prepare(`
          INSERT INTO recurring_transactions (hash, description, postings_json, frequency, next_due_date)
          VALUES (?, ?, ?, ?, ?)
        `).run(hash, description, postings_json, frequency, next_due_date);

        let extra = "";
        if (frequency === "monthly" && monthlyArg) extra = ` (${monthlyArg})`;

        return bot.sendMessage(
          chatId,
          `✅ Recurring added:\n${description} $${amount.toFixed(2)} ${frequency}${extra}\nNext due: ${next_due_date}`
        );
      } catch (err) {
        console.error("Recurring add error:", err);
        return bot.sendMessage(chatId, "Error adding recurring transaction.");
      }
    }
  );

  // Income (inflow)
  // /recurring_income "Social Security" 1500 monthly 3
  bot.onText(
    /^\/recurring_income\s+(.+?)\s+(\d+(\.\d+)?)\s+(daily|weekly|monthly|yearly)(?:\s+(last|\d{1,2}))?$/i,
    (msg, match) => {
      const chatId = msg.chat.id;

      try {
        let description = stripQuotes(match[1]);
        const amount = Number(match[2]);
        const frequency = match[4].toLowerCase();
        const monthlyArg = match[5];

        if (!Number.isFinite(amount) || amount <= 0) {
          return bot.sendMessage(chatId, "Amount must be a positive number.");
        }

        let monthlySpec = null;
        if (frequency === "monthly") {
          if (!monthlyArg) monthlySpec = null;
          else if (String(monthlyArg).toLowerCase() === "last") monthlySpec = { kind: "last" };
          else {
            const day = Number(monthlyArg);
            if (!Number.isInteger(day) || day < 1 || day > 31) {
              return bot.sendMessage(chatId, "Monthly day must be 1-31 or 'last'.");
            }
            monthlySpec = { kind: "day", day };
          }
        }

        const nextDue = computeNextDueDate(frequency, monthlySpec);
        if (!nextDue) return bot.sendMessage(chatId, "Invalid frequency.");

        // Inflow: bank increases, income increases (negative in double-entry)
        const postings = [
          { account: "assets:bank", amount: amount },
          { account: "income:recurring", amount: -amount }
        ];

        const postings_json = JSON.stringify(postings);
        const next_due_date = ymd(nextDue);
        const hash = makeHash(`${description}|${postings_json}|${frequency}|${next_due_date}`);

        db.prepare(`
          INSERT INTO recurring_transactions (hash, description, postings_json, frequency, next_due_date)
          VALUES (?, ?, ?, ?, ?)
        `).run(hash, description, postings_json, frequency, next_due_date);

        let extra = "";
        if (frequency === "monthly" && monthlyArg) extra = ` (${monthlyArg})`;

        return bot.sendMessage(
          chatId,
          `✅ Recurring income added:\n${description} $${amount.toFixed(2)} ${frequency}${extra}\nNext due: ${next_due_date}`
        );
      } catch (err) {
        console.error("Recurring income add error:", err);
        return bot.sendMessage(chatId, "Error adding recurring income.");
      }
    }
  );

  // List recurring
  bot.onText(/^\/recurring_list$/, (msg) => {
    const chatId = msg.chat.id;

    try {
      const rows = db.prepare(`
        SELECT id, hash, description, postings_json, frequency, next_due_date
        FROM recurring_transactions
        ORDER BY id DESC
        LIMIT 25
      `).all();

      if (!rows.length) return bot.sendMessage(chatId, "No recurring bills saved.");

      let out = "📌 Recurring Bills\n\n";

      for (const r of rows) {
        let amt = 0;
        let kind = "rule";
        try {
          const postings = JSON.parse(r.postings_json);
          const bankLine = Array.isArray(postings)
            ? postings.find(p => p.account === "assets:bank")
            : null;

          if (bankLine) {
            const bankAmt = Number(bankLine.amount) || 0;
            amt = Math.abs(bankAmt);
            kind = bankAmt >= 0 ? "income" : "bill";
          }
        } catch {}

        out += `#${r.id}  ${String(r.hash || "").slice(0, 6)}  ${r.description}  $${amt.toFixed(2)}  ${r.frequency}  next:${r.next_due_date}  (${kind})\n`;
      }

      out += "\nDelete: /recurring_delete <id|hash>\nExample: /recurring_delete 3\nExample: /recurring_delete a1b2c3";
      return bot.sendMessage(chatId, out);
    } catch (err) {
      console.error("Recurring list error:", err);
      return bot.sendMessage(chatId, "Error listing recurring bills.");
    }
  });

  // Delete recurring by id or hash-prefix
  bot.onText(/^\/recurring_delete\s+(\S+)$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const key = String(match[1] || "").trim();

    try {
      let row = null;

      if (/^\d+$/.test(key)) {
        row = db.prepare(`SELECT id, hash, description FROM recurring_transactions WHERE id = ?`).get(Number(key));
      } else {
        row = db.prepare(`
          SELECT id, hash, description
          FROM recurring_transactions
          WHERE hash LIKE ?
          ORDER BY id DESC
          LIMIT 1
        `).get(`${key}%`);
      }

      if (!row) return bot.sendMessage(chatId, "Not found. Use /recurring_list to see ids/hashes.");

      db.prepare(`DELETE FROM recurring_events WHERE recurring_id = ?`).run(row.id);
      db.prepare(`DELETE FROM recurring_transactions WHERE id = ?`).run(row.id);

      return bot.sendMessage(chatId, `🗑️ Deleted recurring: #${row.id} ${row.description} (${String(row.hash).slice(0, 6)})`);
    } catch (err) {
      console.error("Recurring delete error:", err);
      return bot.sendMessage(chatId, "Error deleting recurring.");
    }
  });
};
