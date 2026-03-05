// handlers/recurring.js
const crypto = require("crypto");

module.exports = function registerRecurringHandler(bot, deps) {
  const { db } = deps;

  function stripQuotes(s) {
    const t = String(s || "").trim();
    if (
      (t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("'") && t.endsWith("'"))
    ) return t.slice(1, -1).trim();
    return t;
  }

  function ymd(dateObj) {
    return dateObj.toISOString().slice(0, 10);
  }

  function lastDayOfMonth(year, monthIndex0) {
    return new Date(year, monthIndex0 + 1, 0).getDate();
  }

  function computeNextDueDate(frequency, monthlySpec) {
    // monthlySpec: { kind:"day", day:1-31 } OR { kind:"last" } OR null
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
        targetDay = Math.min(monthlySpec.day, lastDayOfMonth(year, month));
      } else {
        targetDay = Math.min(d.getDate(), lastDayOfMonth(year, month));
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
          nextTargetDay = Math.min(d.getDate(), lastDayOfMonth(ny, nm));
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
    return crypto.createHash("sha256").update(String(input)).digest("hex");
  }

  function insertRecurring({ description, postings, frequency, nextDue }) {
    const postings_json = JSON.stringify(postings);
    const next_due_date = ymd(nextDue);

    const hash = makeHash(`${description}|${postings_json}|${frequency}|${next_due_date}`);

    const stmt = db.prepare(`
      INSERT INTO recurring_transactions (hash, description, postings_json, frequency, next_due_date)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(hash, description, postings_json, frequency, next_due_date);

    return { hash, next_due_date };
  }

  // ---------------------------
  // /recurring (EXPENSE)
  // ---------------------------
  // /recurring "Rent" 427 monthly 3
  // /recurring "Rent" 427 monthly last
  bot.onText(
    /^\/recurring\s+(.+?)\s+(\d+(\.\d+)?)\s+(daily|weekly|monthly|yearly)(?:\s+(last|\d{1,2}))?$/i,
    (msg, match) => {
      const chatId = msg.chat.id;

      try {
        const description = stripQuotes(match[1]);
        const amount = Number(match[2]);
        const frequency = match[4].toLowerCase();
        const monthlyArg = match[5]; // "last" or day number or undefined

        if (!Number.isFinite(amount) || amount <= 0) {
          return bot.sendMessage(chatId, "Amount must be a positive number.");
        }

        let monthlySpec = null;
        if (frequency === "monthly") {
          if (!monthlyArg) {
            monthlySpec = null;
          } else if (String(monthlyArg).toLowerCase() === "last") {
            monthlySpec = { kind: "last" };
          } else {
            const day = Number(monthlyArg);
            if (!Number.isInteger(day) || day < 1 || day > 31) {
              return bot.sendMessage(
                chatId,
                "For monthly bills, use day 1-31 or 'last'.\nExamples:\n/recurring rent 427 monthly 3\n/recurring rent 427 monthly last"
              );
            }
            monthlySpec = { kind: "day", day };
          }
        }

        const nextDue = computeNextDueDate(frequency, monthlySpec);
        if (!nextDue) return bot.sendMessage(chatId, "Invalid frequency.");

        // Expense: money OUT of bank
        const postings = [
          { account: "assets:bank", amount: -amount },
          { account: "expenses:recurring", amount: amount }
        ];

        const { hash, next_due_date } = insertRecurring({
          description,
          postings,
          frequency,
          nextDue
        });

        const extra = frequency === "monthly" && monthlyArg ? ` (${monthlyArg})` : "";

        return bot.sendMessage(
          chatId,
          `✅ Recurring bill added:\n${description} $${amount.toFixed(2)} ${frequency}${extra}\nNext due: ${next_due_date}\nRef: ${hash.slice(0, 6)}`
        );
      } catch (err) {
        console.error("recurring add error:", err);
        return bot.sendMessage(chatId, "Error adding recurring bill.");
      }
    }
  );

  // ---------------------------
  // /recurring_income (INCOME)
  // ---------------------------
  // /recurring_income "Social Security" 1500 monthly 3
  bot.onText(
    /^\/recurring_income\s+(.+?)\s+(\d+(\.\d+)?)\s+(daily|weekly|monthly|yearly)(?:\s+(last|\d{1,2}))?$/i,
    (msg, match) => {
      const chatId = msg.chat.id;

      try {
        const description = stripQuotes(match[1]);
        const amount = Number(match[2]);
        const frequency = match[4].toLowerCase();
        const monthlyArg = match[5];

        if (!Number.isFinite(amount) || amount <= 0) {
          return bot.sendMessage(chatId, "Amount must be a positive number.");
        }

        let monthlySpec = null;
        if (frequency === "monthly") {
          if (!monthlyArg) {
            monthlySpec = null;
          } else if (String(monthlyArg).toLowerCase() === "last") {
            monthlySpec = { kind: "last" };
          } else {
            const day = Number(monthlyArg);
            if (!Number.isInteger(day) || day < 1 || day > 31) {
              return bot.sendMessage(
                chatId,
                "For monthly income, use day 1-31 or 'last'.\nExample:\n/recurring_income \"Social Security\" 1500 monthly 3"
              );
            }
            monthlySpec = { kind: "day", day };
          }
        }

        const nextDue = computeNextDueDate(frequency, monthlySpec);
        if (!nextDue) return bot.sendMessage(chatId, "Invalid frequency.");

        // Income: money INTO bank
        // (assets increases +, income increases -)
        const postings = [
          { account: "assets:bank", amount: amount },
          { account: "income:recurring", amount: -amount }
        ];

        const { hash, next_due_date } = insertRecurring({
          description,
          postings,
          frequency,
          nextDue
        });

        const extra = frequency === "monthly" && monthlyArg ? ` (${monthlyArg})` : "";

        return bot.sendMessage(
          chatId,
          `✅ Recurring income added:\n${description} $${amount.toFixed(2)} ${frequency}${extra}\nNext due: ${next_due_date}\nRef: ${hash.slice(0, 6)}`
        );
      } catch (err) {
        console.error("recurring income add error:", err);
        return bot.sendMessage(chatId, "Error adding recurring income.");
      }
    }
  );

  // ---------------------------
  // /recurring_list
  // ---------------------------
  bot.onText(/^\/recurring_list(@\w+)?$/, (msg) => {
    const chatId = msg.chat.id;

    try {
      const rows = db.prepare(`
        SELECT id, hash, description, postings_json, frequency, next_due_date
        FROM recurring_transactions
        ORDER BY date(next_due_date) ASC, id ASC
        LIMIT 25
      `).all();

      if (!rows.length) return bot.sendMessage(chatId, "No recurring items saved.");

      let out = "📌 Recurring\n\n";

      for (const r of rows) {
        let amt = 0;
        let direction = "";
        try {
          const postings = JSON.parse(r.postings_json);
          const bankLine = Array.isArray(postings)
            ? postings.find(p => p.account === "assets:bank")
            : null;
          if (bankLine) {
            const bankAmt = Number(bankLine.amount) || 0;
            amt = Math.abs(bankAmt);
            direction = bankAmt >= 0 ? "income" : "bill";
          }
        } catch { }

        out += `#${r.id}  ${String(r.hash).slice(0, 6)}  ${r.description}  $${amt.toFixed(2)}  ${r.frequency}  next:${r.next_due_date}  (${direction})\n`;
      }

      out += `\nDelete: /recurring_delete <id|hash>\nExample: /recurring_delete 3\nExample: /recurring_delete a1b2c3`;

      return bot.sendMessage(chatId, out);
    } catch (err) {
      console.error("recurring list error:", err);
      return bot.sendMessage(chatId, "Error listing recurring items.");
    }
  });

  // ---------------------------
  // /recurring_delete <id|hashPrefix>
  // ---------------------------
  bot.onText(/^\/recurring_delete(@\w+)?\s+([0-9]+|[a-f0-9]{3,64})$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const token = match[2];

    try {
      let row = null;

      if (/^\d+$/.test(token)) {
        row = db.prepare(`
          SELECT id, hash, description, next_due_date
          FROM recurring_transactions
          WHERE id = ?
        `).get(Number(token));
      } else {
        row = db.prepare(`
          SELECT id, hash, description, next_due_date
          FROM recurring_transactions
          WHERE hash LIKE ?
          ORDER BY id DESC
          LIMIT 1
        `).get(`${token}%`);
      }

      if (!row) return bot.sendMessage(chatId, "Not found.");

      db.transaction(() => {
        // remove events first (fk-safe)
        db.prepare(`DELETE FROM recurring_events WHERE recurring_id = ?`).run(row.id);
        db.prepare(`DELETE FROM recurring_transactions WHERE id = ?`).run(row.id);
      })();

      return bot.sendMessage(
        chatId,
        `🗑️ Deleted recurring: #${row.id} ${row.description} (ref ${String(row.hash).slice(0, 6)})`
      );
    } catch (err) {
      console.error("recurring delete error:", err);
      return bot.sendMessage(chatId, "Error deleting recurring item.");
    }
  });
};
