// handlers/recurring.js
const crypto = require("crypto");

module.exports = function registerRecurringHandler(bot, deps) {
  const { db } = deps;

  // Helpers
  function stripQuotes(s) {
    const t = s.trim();
    if (
      (t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("'") && t.endsWith("'"))
    ) {
      return t.slice(1, -1).trim();
    }
    return t;
  }

  function makeHash(payloadObj) {
    // unique + stable enough; includes randomness to avoid collisions
    const raw = JSON.stringify(payloadObj) + "|" + Date.now() + "|" + Math.random();
    return crypto.createHash("sha256").update(raw).digest("hex");
  }	

  function ymd(dateObj) {
    return dateObj.toISOString().slice(0, 10);
  }

  function lastDayOfMonth(year, monthIndex0) {
    return new Date(year, monthIndex0 + 1, 0).getDate();
  }

  function computeNextDueDate(frequency, monthlySpec) {
    // monthlySpec: { kind: "day", day: 1-31 } OR { kind: "last" } OR null
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
      const d = new Date(today);
      const year = d.getFullYear();
      const month = d.getMonth();

      let targetDay;
      if (monthlySpec?.kind === "last") {
        targetDay = lastDayOfMonth(year, month);
      } else if (monthlySpec?.kind === "day") {
        const max = lastDayOfMonth(year, month);
        targetDay = Math.min(monthlySpec.day, max);
      } else {
        const max = lastDayOfMonth(year, month);
        targetDay = Math.min(d.getDate(), max);
      }

      // Candidate date this month
      const candidate = new Date(year, month, targetDay);
      candidate.setHours(0, 0, 0, 0);

      // IMPORTANT: if candidate is TODAY or in the past, schedule next month
      // This avoids “I already paid it today” double-counting.
      if (candidate <= today) {
        const nextMonth = new Date(year, month + 1, 1);
        const ny = nextMonth.getFullYear();
        const nm = nextMonth.getMonth();

        let nextTargetDay;
        if (monthlySpec?.kind === "last") {
          nextTargetDay = lastDayOfMonth(ny, nm);
        } else if (monthlySpec?.kind === "day") {
          const max = lastDayOfMonth(ny, nm);
          nextTargetDay = Math.min(monthlySpec.day, max);
        } else {
          const max = lastDayOfMonth(ny, nm);
          nextTargetDay = Math.min(d.getDate(), max);
        }

        const nextCandidate = new Date(ny, nm, nextTargetDay);
        nextCandidate.setHours(0, 0, 0, 0);
        return nextCandidate;
      }

      return candidate;
    }

    return null;
  }

  function makeHash(input) {
    return crypto.createHash("sha256").update(input).digest("hex");
  }

  // /recurring "T-Mobile" 95 monthly 3
  // /recurring rent 1200 monthly last
  // /recurring auto_insurance 160 weekly
  bot.onText(
    /^\/recurring\s+(.+?)\s+(\d+(\.\d+)?)\s+(daily|weekly|monthly|yearly)(?:\s+(last|\d{1,2}))?$/i,
    (msg, match) => {
      const chatId = msg.chat.id;

      try {
        let description = stripQuotes(match[1]);
        const amount = Number(match[2]);
        const frequency = match[4].toLowerCase();
        const monthlyArg = match[5]; // "last" or day number or undefined

        if (!Number.isFinite(amount) || amount <= 0) {
          return bot.sendMessage(chatId, "Amount must be a positive number.");
        }

        let monthlySpec = null;

        if (frequency === "monthly") {
          if (!monthlyArg) {
            monthlySpec = null; // default to today's day
          } else if (monthlyArg.toLowerCase() === "last") {
            monthlySpec = { kind: "last" };
          } else {
            const day = Number(monthlyArg);
            if (!Number.isInteger(day) || day < 1 || day > 31) {
              return bot.sendMessage(
                chatId,
                "For monthly bills, use day 1-31 or 'last'.\nExamples:\n/recurring rent 1200 monthly 3\n/recurring rent 1200 monthly last"
              );
            }
            monthlySpec = { kind: "day", day };
          }
        }

        const nextDue = computeNextDueDate(frequency, monthlySpec);

        if (!nextDue) {
          return bot.sendMessage(chatId, "Invalid frequency. Use daily|weekly|monthly|yearly.");
        }

        // Store postings that balance to zero
        const postings = [
          { account: "assets:bank", amount: -amount },
          { account: "expenses:recurring", amount: amount }
        ];

        const postings_json = JSON.stringify(postings);
        const next_due_date = ymd(nextDue);

        // Create a stable hash for safe delete
        const hash = makeHash(`${description}|${postings_json}|${frequency}|${next_due_date}`);

        const insert = db.prepare(`
	INSERT INTO recurring_transactions (hash, description, postings_json, frequency, next_due_date)
        VALUES (?, ?, ?, ?, ?)
        `);

	// const hash = makeHash({ description, postings, frequency, next_due_date: ymd(nextDue) });

        insert.run(hash, description, postings_json, frequency, next_due_date);

        let extra = "";
        if (frequency === "monthly" && monthlyArg) extra = ` (${monthlyArg})`;

        return bot.sendMessage(
          chatId,
          `✅ Recurring added:\n${description} $${amount.toFixed(2)} ${frequency}${extra}\n` +
          `Next due: ${next_due_date}\n` +
          `ID: ${hash.slice(0, 6)}`
        );
      } catch (err) {
        console.error("Recurring add error:", err);
        return bot.sendMessage(chatId, "Error adding recurring transaction.");
      }
    }
  );

  // /recurring_income "Social Security" 1500 monthly 3
  bot.onText(
    /^\/recurring_income\s+(.+?)\s+(\d+(\.\d+)?)\s+(daily|weekly|monthly|yearly)(?:\s+(last|\d{1,2}))?$/i,
    (msg, match) => {
      const chatId = msg.chat.id;

      try {
        let description = stripQuotes(match[1]);
        const amount = Number(match[2]);
        const frequency = match[4].toLowerCase();
        const monthlyArg = match[5]; // "last" or day number or undefined

        if (!Number.isFinite(amount) || amount <= 0) {
          return bot.sendMessage(chatId, "Amount must be a positive number.");
        }

        let monthlySpec = null;

        if (frequency === "monthly") {
          if (!monthlyArg) {
            monthlySpec = null; // default to today's day
          } else if (monthlyArg.toLowerCase() === "last") {
            monthlySpec = { kind: "last" };
          } else {
            const day = Number(monthlyArg);
            if (!Number.isInteger(day) || day < 1 || day > 31) {
              return bot.sendMessage(
                chatId,
                "For monthly income, use day 1-31 or 'last'.\nExamples:\n/recurring_income \"Social Security\" 1500 monthly 3\n/recurring_income bonus 200 monthly last"
              );
            }
            monthlySpec = { kind: "day", day };
          }
        }

        const nextDue = computeNextDueDate(frequency, monthlySpec);
        if (!nextDue) {
          return bot.sendMessage(chatId, "Invalid frequency. Use daily|weekly|monthly|yearly.");
        }

        // Income: money INTO bank.
        // Bank increases => +amount on assets:bank
        // Income increases => -amount on income:...
        const postings = [
        { account: "assets:bank", amount: amount },
        { account: "income:social_security", amount: -amount }
      ];

        const postings_json = JSON.stringify(postings);
        const next_due_date = ymd(nextDue);
        const hash = makeHash(`${description}|${postings_json}|${frequency}|${next_due_date}`);

        const insert = db.prepare(`
        INSERT INTO recurring_transactions (hash, description, postings_json, frequency, next_due_date)
        VALUES (?, ?, ?, ?, ?)
      `);

       insert.run(
         hash,
         description,
         postings_json,
         frequency,
         next_due_date
       );
        let extra = "";
        if (frequency === "monthly" && monthlyArg) extra = ` (${monthlyArg})`;

        return bot.sendMessage(
          chatId,
          `✅ Recurring income added:\n${description} $${amount.toFixed(2)} ${frequency}${extra}\nNext due: ${ymd(nextDue)}`
        );
      } catch (err) {
        console.error("Recurring income add error:", err);
        return bot.sendMessage(chatId, "Error adding recurring income.");
      }
    }
  );	

  // List recurring
    bot.onText(/^\/recurring_list(@\w+)?$/, (msg) => {
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
        try {
          const postings = JSON.parse(r.postings_json);
          const bankLine = Array.isArray(postings)
            ? postings.find(p => p.account === "assets:bank")
            : null;
          if (bankLine) amt = Math.abs(Number(bankLine.amount) || 0);
        } catch {}

        out += `#${r.id}  ${String(r.hash || "").slice(0, 6)}  ${r.description}  $${amt.toFixed(2)}  ${r.frequency}  next:${r.next_due_date}\n`;
      }

      out += `\nDelete: /recurring_delete <id|hash>\nExample: /recurring_delete 3\nExample: /recurring_delete a1b2c3`;
      return bot.sendMessage(chatId, out);
    } catch (err) {
      console.error("Recurring list error:", err);
      return bot.sendMessage(chatId, "Error listing recurring bills.");
    }
  });

    module.exports = function registerRecurringHandler(bot, deps) {
    const { db } = deps;
  }

    // Delete recurring by id OR full hash OR unique hash prefix
  bot.onText(/^\/recurring_delete\s+(\S+)$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const token = (match[1] || "").trim();

    try {
      let row = null;

      // 1) If numeric => treat as ID
      if (/^\d+$/.test(token)) {
        row = db.prepare(`
          SELECT id, hash, description, postings_json, frequency, next_due_date
          FROM recurring_transactions
          WHERE id = ?
        `).get(Number(token));
      } else {
        // 2) Otherwise treat as hash/prefix
        const matches = db.prepare(`
          SELECT id, hash, description, postings_json, frequency, next_due_date
          FROM recurring_transactions
          WHERE hash LIKE ?
          ORDER BY id DESC
          LIMIT 10
        `).all(`${token}%`);

        if (matches.length === 0) {
          return bot.sendMessage(chatId, `No recurring entry found for: ${token}`);
        }

        if (matches.length > 1) {
          let out = `That prefix matches multiple entries. Use a longer hash (or ID):\n\n`;
          for (const r of matches) {
            out += `#${r.id}  ${String(r.hash).slice(0, 6)}  ${r.description}  next:${r.next_due_date}\n`;
          }
          return bot.sendMessage(chatId, out);
        }

        row = matches[0];
      }

      if (!row) {
        return bot.sendMessage(chatId, `No recurring entry found for: ${token}`);
      }

      // Amount display helper (reads bank line)
      let amt = 0;
      try {
        const postings = JSON.parse(row.postings_json);
        const bankLine = Array.isArray(postings)
          ? postings.find(p => p.account === "assets:bank")
          : null;
        if (bankLine) amt = Math.abs(Number(bankLine.amount) || 0);
      } catch {}

      // Delete it
      db.prepare(`DELETE FROM recurring_transactions WHERE id = ?`).run(row.id);

      return bot.sendMessage(
        chatId,
        `🗑️ Deleted recurring:\n` +
        `#${row.id}  ${String(row.hash || "").slice(0, 6)}  ${row.description}\n` +
        `Amount: $${amt.toFixed(2)}\n` +
        `Frequency: ${row.frequency}\n` +
        `Next due was: ${row.next_due_date}`
      );

    } catch (err) {
      console.error("Recurring delete error:", err);
      return bot.sendMessage(chatId, "Error deleting recurring entry.");
    }
  });
};
