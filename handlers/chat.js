// handlers/chat.js
module.exports = function registerChatHandler(bot, deps) {
  const { openai, ledgerService, db, format } = deps;
  const { formatMoney, renderTable } = format;

  const systemPrompt = `
You are a finance assistant.

You have TWO MODES:

1) CHAT MODE
If the message is conversational, greeting, question, or not clearly a financial transaction:
Respond in normal plain text.

2) ACCOUNTING MODE
If the message clearly describes money being earned, spent, transferred, paid, deposited, withdrawn, or moved between accounts:
Return ONLY valid JSON.
No markdown.
No explanation.
No extra text.

STRICT RULES:
- Only return JSON if it is DEFINITELY a financial transaction.
- If unsure, use CHAT MODE.
- Transactions MUST have:
  - date (YYYY-MM-DD)
  - description (short text)
  - postings (array of >= 2)
- Postings MUST balance to zero (sum amounts == 0).

ACCOUNTING SIGN RULES:
- Assets increase = positive
- Assets decrease = negative
- Expenses increase = positive
- Income increase = negative
- Liability increase = negative
- Liability decrease = positive

DEFAULT ACCOUNTS:
- Bank: assets:bank
- Salary: income:salary
- Windfall/Other income: income:other
- Food and groceries: expenses:food
- Rent: expenses:rent
- Transport: expenses:transport
- Utilities: expenses:utilities
- Shopping/general purchases: expenses:shopping
- Unknown/unclear expenses: expenses:misc

CATEGORY RULES:
- Use expenses:food only for groceries, restaurants, takeout, snacks, coffee, or other food/drink purchases.
- Use expenses:rent only for rent or housing payment descriptions.
- Use expenses:transport for gas, fuel, Uber, Lyft, bus, train, parking, tolls, car fare, or commuting costs.
- Use expenses:utilities for electric, water, gas bill, internet, phone bill, mobile service, trash, or similar household utility bills.
- Use expenses:shopping for retail purchases, Amazon, Walmart, Target, household goods, clothing, electronics, toiletries, and general non-food shopping.
- Use expenses:misc for anything unclear, mixed, or not well matched to another category.
- If uncertain, prefer expenses:misc over guessing.

DATE RULE:
- Always use TODAY'S real date.
- The date MUST be exactly today's date in YYYY-MM-DD format.
`;

  function todayYMD() {
    return new Date().toISOString().slice(0, 10);
  }

  function isProbablyJson(str) {
    const s = String(str || "").trim();
    return s.startsWith("{") && s.endsWith("}");
  }

  function normalizeTransaction(raw, originalText) {
    const tx = raw && typeof raw === "object" ? raw : {};

    tx.date = todayYMD();

    if (typeof tx.description !== "string" || !tx.description.trim()) {
      tx.description = originalText?.slice(0, 80) || "Transaction";
    } else {
      tx.description = tx.description.trim();
    }

    if (!Array.isArray(tx.postings)) {
      throw new Error("Missing postings array.");
    }
    if (tx.postings.length < 2) {
      throw new Error("Transaction must contain at least two postings.");
    }

    tx.postings = tx.postings.map((p) => ({
      account: String(p.account || "").trim(),
      amount: Number(p.amount)
    }));

    for (const p of tx.postings) {
      if (!p.account) throw new Error("Posting missing account name.");
      if (!Number.isFinite(p.amount)) throw new Error("Posting has invalid amount.");
    }

    const total = tx.postings.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(total) > 0.00001) {
      throw new Error(`Postings do not balance (sum = ${total}).`);
    }

    return tx;
  }

  function normalizeText(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/\s+/g, " ");
  }

  function wantsBalance(text) {
    return /^(what is|whats|what's|show|tell me)? ?my balance\??$/.test(text);
  }

  function wantsDebts(text) {
    return /^(what are|show|list|tell me)? ?my debts\??$/.test(text) ||
      /^(show|list) debts\??$/.test(text);
  }

  function wantsRecurring(text) {
    return /^(show|list) my recurring bills\??$/.test(text) ||
      /^(show|list) recurring bills\??$/.test(text) ||
      /^(show|list) my recurring items\??$/.test(text);
  }

  function wantsSummary(text) {
    return /^(show|what is|whats|what's|tell me)? ?my spending summary\??$/.test(text) ||
      /^(show|what is|whats|what's|tell me)? ?my summary\??$/.test(text);
  }

  function sendBalance(chatId) {
    const checking = db
      .prepare(`SELECT id FROM accounts WHERE name = 'assets:bank'`)
      .get();

    if (!checking) {
      return bot.sendMessage(chatId, "assets:bank account not found.");
    }

    const row = db
      .prepare(`
        SELECT IFNULL(SUM(amount), 0) AS balance
        FROM postings
        WHERE account_id = ?
      `)
      .get(checking.id);

    const balance = Number(row?.balance) || 0;

    return bot.sendMessage(
      chatId,
      [
        "💰 *Current Balance*",
        "",
        renderTable(
          ["Account", "Balance"],
          [["assets:bank", formatMoney(balance)]],
          { aligns: ["left", "right"] }
        )
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  }

  function sendDebts(chatId) {
    const rows = db.prepare(`
      SELECT id, name, balance, apr, minimum
      FROM debts
      ORDER BY id ASC
    `).all();

    if (!rows.length) {
      return bot.sendMessage(chatId, "No debts recorded.");
    }

    const tableRows = rows.map((row) => [
      String(row.id),
      String(row.name || ""),
      formatMoney(Number(row.balance) || 0),
      `${(Number(row.apr) || 0).toFixed(2)}%`,
      formatMoney(Number(row.minimum) || 0)
    ]);

    const totalDebt = rows.reduce(
      (sum, row) => sum + (Number(row.balance) || 0),
      0
    );

    const totalMinimum = rows.reduce(
      (sum, row) => sum + (Number(row.minimum) || 0),
      0
    );

    return bot.sendMessage(
      chatId,
      [
        "💳 *Debts*",
        "",
        renderTable(
          ["ID", "Name", "Balance", "APR", "Minimum"],
          tableRows,
          { aligns: ["right", "left", "right", "right", "right"] }
        ),
        `Total Debt: \`${formatMoney(totalDebt)}\``,
        `Total Minimums: \`${formatMoney(totalMinimum)}\``
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  }

  function sendRecurring(chatId) {
    const rows = db.prepare(`
      SELECT id, hash, description, postings_json, frequency, next_due_date
      FROM recurring_transactions
      ORDER BY date(next_due_date) ASC, id ASC
      LIMIT 25
    `).all();

    if (!rows.length) {
      return bot.sendMessage(chatId, "No recurring items saved.");
    }

    const tableRows = rows.map((row) => {
      let amount = 0;
      let direction = "unknown";

      try {
        const postings = JSON.parse(row.postings_json);
        const bankLine = Array.isArray(postings)
          ? postings.find((p) => p.account === "assets:bank")
          : null;

        if (bankLine) {
          const bankAmt = Number(bankLine.amount) || 0;
          amount = Math.abs(bankAmt);
          direction = bankAmt >= 0 ? "income" : "bill";
        }
      } catch (_) {
        // ignore malformed postings_json
      }

      return [
        String(row.id),
        String(row.hash || "").slice(0, 6),
        String(row.description || ""),
        formatMoney(amount),
        String(row.frequency || ""),
        String(row.next_due_date || ""),
        direction
      ];
    });

    return bot.sendMessage(
      chatId,
      [
        "📌 *Recurring*",
        "",
        renderTable(
          ["ID", "Ref", "Description", "Amount", "Freq", "Next Due", "Type"],
          tableRows,
          { aligns: ["right", "left", "left", "right", "left", "left", "left"] }
        )
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  }

  function sendSummary(chatId) {
    const rows = db.prepare(`
      SELECT a.name as account,
             SUM(p.amount) as total
      FROM postings p
      JOIN accounts a ON p.account_id = a.id
      JOIN transactions t ON p.transaction_id = t.id
      WHERE a.name LIKE 'expenses:%'
        AND date(t.date) >= date('now','-30 day')
      GROUP BY a.name
      ORDER BY total DESC
    `).all();

    if (!rows.length) {
      return bot.sendMessage(chatId, "📊 30-Day Spending Summary\n\nNo expenses recorded.");
    }

    let total = 0;
    const tableRows = [];

    for (const r of rows) {
      const amt = Math.abs(Number(r.total) || 0);
      total += amt;

      const name = String(r.account || "").replace("expenses:", "");
      tableRows.push([name, formatMoney(amt)]);
    }

    tableRows.push(["Total", formatMoney(total)]);

    return bot.sendMessage(
      chatId,
      [
        "📊 *30-Day Spending Summary*",
        "",
        renderTable(
          ["Category", "Amount"],
          tableRows,
          { aligns: ["left", "right"] }
        )
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  }

  bot.on("message", async (msg) => {
    try {
      if (!msg?.text) return;
      if (msg.text.startsWith("/")) return;
      if (msg.from?.is_bot) return;

      const chatId = msg.chat.id;
      const rawText = String(msg.text || "");
      const normalized = normalizeText(rawText);

      if (wantsBalance(normalized)) {
        return sendBalance(chatId);
      }

      if (wantsDebts(normalized)) {
        return sendDebts(chatId);
      }

      if (wantsRecurring(normalized)) {
        return sendRecurring(chatId);
      }

      if (wantsSummary(normalized)) {
        return sendSummary(chatId);
      }

      const completion = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: rawText }
        ],
        temperature: 0.2
      });

      const reply = completion?.choices?.[0]?.message?.content?.trim() || "";
      if (!reply) {
        return bot.sendMessage(chatId, "No response from AI.");
      }

      if (isProbablyJson(reply)) {
        try {
          const parsed = JSON.parse(reply);
          const tx = normalizeTransaction(parsed, rawText);

          ledgerService.addTransaction(tx);

          return bot.sendMessage(
            chatId,
            `✅ Posted: ${tx.description}\n${tx.date}`
          );
        } catch (e) {
          console.error("AI JSON parse/post error:", e);
          return bot.sendMessage(
            chatId,
            `I tried to post that as a transaction but it failed:\n${e.message}\n\nTry /deposit or /add for now.`
          );
        }
      }

      return bot.sendMessage(chatId, reply);
    } catch (err) {
      console.error("Chat handler error:", err);
      return bot.sendMessage(msg.chat.id, "AI error.");
    }
  });
};

module.exports.help = {
  hidden: true
};
