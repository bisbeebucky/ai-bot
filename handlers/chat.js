// handlers/chat.js
module.exports = function registerChatHandler(bot, deps) {
  const { openai, ledgerService, db, format, simulateCashflow, finance, queryService } = deps;
  const { formatMoney, renderTable, codeBlock } = format;
  const {
    getStartingAssets,
    getRecurringMonthlyNet,
    getDebtRows,
    getMonthlyExpenses
  } = finance || {};

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

  function parseYMD(value) {
    const s = String(value || "").trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;

    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);

    const dt = new Date(y, mo - 1, d);
    dt.setHours(0, 0, 0, 0);

    if (
      dt.getFullYear() !== y ||
      dt.getMonth() !== mo - 1 ||
      dt.getDate() !== d
    ) {
      return null;
    }

    return dt;
  }

  function ymd(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function diffDays(fromDate, toDate) {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((toDate.getTime() - fromDate.getTime()) / msPerDay);
  }

  function parseLocalDate(dateStr) {
    const s = String(dateStr || "").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;

    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setHours(12, 0, 0, 0);
    return d;
  }

  function wantsBalance(text) {
    return text.includes("my balance") || text === "balance";
  }

  function wantsDebts(text) {
    return text.includes("my debts") || text === "debts" || text === "list debts";
  }

  function wantsRecurring(text) {
    return text.includes("recurring bills") ||
      text.includes("recurring items") ||
      text === "show recurring bills" ||
      text === "list recurring bills";
  }

  function wantsSummary(text) {
    return text.includes("spending summary") ||
      text === "show my summary" ||
      text === "what is my summary?" ||
      text === "whats my summary?" ||
      text === "my summary";
  }

  function parseBalanceOnDate(text) {
    const m = text.match(
      /^(what will|whats|what's|what is|tell me|show me) ?my balance be on (\d{4}-\d{2}-\d{2})\??$/
    );
    return m ? m[2] : null;
  }

  function wantsForecast(text) {
    return /^(what is|whats|what's|show|tell me)? ?my forecast\??$/.test(text) ||
      /^(show|tell me) forecast\??$/.test(text);
  }

  function wantsOverdraft(text) {
    return /^will i overdraft\??$/.test(text) ||
      /^am i going to overdraft\??$/.test(text) ||
      /^do i have overdraft risk\??$/.test(text);
  }

  function wantsNetWorth(text) {
    return text.includes("my net worth") || text === "net worth";
  }

  function wantsEmergencyFund(text) {
    return text.includes("my emergency fund") || text === "emergency fund";
  }

  function wantsWhy(text) {
    return text === "why does my balance drop?" ||
      text === "why does my balance drop" ||
      text === "why is my balance dropping?" ||
      text === "why is my balance dropping" ||
      text === "why do i go low?" ||
      text === "why do i go low" ||
      text === "why do i go negative?" ||
      text === "why do i go negative";
  }

  function wantsDueNext(text) {
    return text === "whats due next?" ||
      text === "whats due next" ||
      text === "what's due next?" ||
      text === "what's due next" ||
      text === "what bills are due next?" ||
      text === "what bills are due next" ||
      text === "what recurring bills are due next?" ||
      text === "what recurring bills are due next";
  }

  function wantsPayday(text) {
    return text === "when is payday?" ||
      text === "when is payday" ||
      text === "when do i get paid next?" ||
      text === "when do i get paid next" ||
      text === "whats my next paycheck date?" ||
      text === "whats my next paycheck date" ||
      text === "what's my next paycheck date?" ||
      text === "what's my next paycheck date";
  }

  function wantsCashflow(text) {
    return text === "whats my cashflow?" ||
      text === "whats my cashflow" ||
      text === "what's my cashflow?" ||
      text === "what's my cashflow" ||
      text === "show my cashflow" ||
      text === "what is my cashflow?" ||
      text === "what is my cashflow" ||
      text === "whats my monthly cashflow?" ||
      text === "whats my monthly cashflow" ||
      text === "what's my monthly cashflow?" ||
      text === "what's my monthly cashflow" ||
      text === "show my monthly cashflow";
  }

  function wantsUntilPayday(text) {
    return text === "am i safe until payday?" ||
      text === "am i safe until payday" ||
      text === "will i make it to payday?" ||
      text === "will i make it to payday" ||
      text === "can i make it to payday?" ||
      text === "can i make it to payday" ||
      text === "will i make it until payday?" ||
      text === "will i make it until payday";
  }

  function wantsUpcomingIncome(text) {
    return text === "what income is coming up?" ||
      text === "what income is coming up" ||
      text === "show my upcoming income" ||
      text === "show upcoming income" ||
      text === "what recurring income is coming up?" ||
      text === "what recurring income is coming up";
  }

  function wantsUpcomingBills(text) {
    return text === "what bills are coming up?" ||
      text === "what bills are coming up" ||
      text === "show my upcoming bills" ||
      text === "show upcoming bills" ||
      text === "what recurring bills are coming up?" ||
      text === "what recurring bills are coming up";
  }

  function wantsLowestBalance(text) {
    return text === "whats my lowest balance?" ||
      text === "whats my lowest balance" ||
      text === "what's my lowest balance?" ||
      text === "what's my lowest balance" ||
      text === "what is my lowest balance?" ||
      text === "what is my lowest balance" ||
      text === "show my lowest balance";
  }

  function sendBalance(chatId) {
    const result = queryService.getCurrentBankBalance(db);

    if (!result.ok) {
      return bot.sendMessage(chatId, result.error);
    }

    return bot.sendMessage(
      chatId,
      [
        "💰 *Current Balance*",
        "",
        renderTable(
          ["Account", "Balance"],
          [[result.account.name, formatMoney(result.balance)]],
          { aligns: ["left", "right"] }
        )
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  }

  function sendDebts(chatId) {
    const result = queryService.getDebtSummary(db);

    if (!result.debts.length) {
      return bot.sendMessage(chatId, "No debts recorded.");
    }

    const tableRows = result.debts.map((debt) => [
      String(debt.id),
      debt.name,
      formatMoney(debt.balance),
      `${debt.apr.toFixed(2)}%`,
      formatMoney(debt.minimum)
    ]);

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
        `Total Debt: \`${formatMoney(result.totalDebt)}\``,
        `Total Minimums: \`${formatMoney(result.totalMinimum)}\``
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  }

  function sendRecurring(chatId) {
    const result = queryService.getRecurringItems(db, 25);

    if (!result.items.length) {
      return bot.sendMessage(chatId, "No recurring items saved.");
    }

    const tableRows = result.items.map((item) => [
      String(item.id),
      item.ref,
      item.description,
      formatMoney(item.amount),
      item.frequency,
      item.nextDue,
      item.type
    ]);

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
    const result = queryService.getSpendingSummary(db, 30);

    if (!result.categories.length) {
      return bot.sendMessage(chatId, "📊 30-Day Spending Summary\n\nNo expenses recorded.");
    }

    const tableRows = result.categories.map((c) => [
      c.category,
      formatMoney(c.amount)
    ]);

    tableRows.push(["Total", formatMoney(result.total)]);

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

    function sendBalanceOn(chatId, rawDate) {
      const targetDate = parseYMD(rawDate);

      if (!targetDate) {
        return bot.sendMessage(
          chatId,
          "Please use a date like `2026-04-03`.",
          { parse_mode: "Markdown" }
        );
      }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = diffDays(today, targetDate);

    if (days < 0) {
      return bot.sendMessage(chatId, "Only future dates are supported.");
    }

    const checking = db.prepare(`
      SELECT id
      FROM accounts
      WHERE name = 'assets:bank'
    `).get();

    if (!checking) {
      return bot.sendMessage(chatId, "assets:bank account not found.");
    }

    const row = db.prepare(`
      SELECT IFNULL(SUM(amount), 0) as balance
      FROM postings
      WHERE account_id = ?
    `).get(checking.id);

    const currentBalance = Number(row?.balance) || 0;

    if (days === 0) {
      return bot.sendMessage(
        chatId,
        [
          "💰 *Balance On Date*",
          "",
          `Date: \`${ymd(targetDate)}\``,
          `Estimated Balance: \`${formatMoney(currentBalance)}\``
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    const result = simulateCashflow(db, currentBalance, checking.id, days);
    const timeline = Array.isArray(result?.timeline) ? result.timeline : [];

    let estimatedBalance = currentBalance;
    for (const evt of timeline) {
      if (String(evt.date || "") <= ymd(targetDate)) {
        estimatedBalance = Number(evt.balance) || 0;
      }
    }

    return bot.sendMessage(
      chatId,
      [
        "💰 *Balance On Date*",
        "",
        `Date: \`${ymd(targetDate)}\``,
        `Current Balance: \`${formatMoney(currentBalance)}\``,
        `Estimated Balance: \`${formatMoney(estimatedBalance)}\``
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  }

  function sendForecast(chatId) {
    const checking = db.prepare(`
      SELECT id
      FROM accounts
      WHERE name = 'assets:bank'
    `).get();

    if (!checking) {
      return bot.sendMessage(chatId, "Checking account `assets:bank` not found.", {
        parse_mode: "Markdown"
      });
    }

    const row = db.prepare(`
      SELECT IFNULL(SUM(amount), 0) as balance
      FROM postings
      WHERE account_id = ?
    `).get(checking.id);

    const currentBalance = Number(row?.balance) || 0;
    const result = simulateCashflow(db, currentBalance, checking.id, 30);
    const timeline = Array.isArray(result?.timeline) ? result.timeline : [];
    const lowest = Number(result?.lowestBalance) || currentBalance;

    let firstNegativeDate = null;
    for (const evt of timeline) {
      const b = Number(evt.balance) || 0;
      if (b < 0) {
        firstNegativeDate = evt.date;
        break;
      }
    }

    const message = [
      "📈 *30-Day Forecast*",
      "",
      `Current Balance: \`${formatMoney(currentBalance)}\``,
      `Projected Lowest Balance: \`${formatMoney(lowest)}\``
    ];

    if (firstNegativeDate) {
      message.push(`First Negative Date: \`${firstNegativeDate}\``);
      message.push("");
      message.push("⚠️ Overdraft risk detected in the next 30 days.");
    } else {
      message.push("");
      message.push("✅ No overdraft risk in the next 30 days.");
    }

    return bot.sendMessage(chatId, message.join("\n"), {
      parse_mode: "Markdown"
    });
  }

  function sendNetWorth(chatId) {
    if (!getStartingAssets || !getDebtRows) {
      return bot.sendMessage(chatId, "Net worth helper not available.");
    }

    const starting = getStartingAssets(ledgerService);
    const debtRows = getDebtRows(db);
    const totalDebt = debtRows.reduce((sum, d) => sum + (Number(d.balance) || 0), 0);
    const netWorth = Number(starting.total || 0) - totalDebt;

    return bot.sendMessage(
      chatId,
      [
        "🏦 *Net Worth*",
        "",
        renderTable(
          ["Item", "Amount"],
          [
            ["Bank", formatMoney(Number(starting.bank) || 0)],
            ["Savings", formatMoney(Number(starting.savings) || 0)],
            ["Assets", formatMoney(Number(starting.total) || 0)],
            ["Debt", formatMoney(totalDebt)],
            ["Net Worth", `${netWorth >= 0 ? "+" : "-"}${formatMoney(Math.abs(netWorth))}`]
          ],
          { aligns: ["left", "right"] }
        )
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  }

  function sendEmergencyFund(chatId) {
    if (!getRecurringMonthlyNet || !getMonthlyExpenses) {
      return bot.sendMessage(chatId, "Emergency fund helper not available.");
    }

    const checking = db.prepare(`
      SELECT id
      FROM accounts
      WHERE name = 'assets:bank'
    `).get();

    if (!checking) {
      return bot.sendMessage(chatId, "assets:bank account not found.");
    }

    const row = db.prepare(`
      SELECT IFNULL(SUM(amount), 0) as balance
      FROM postings
      WHERE account_id = ?
    `).get(checking.id);

    const cashOnHand = Number(row?.balance) || 0;
    const monthlyExpenses = Number(getMonthlyExpenses(db)) || 0;
    const recurring = getRecurringMonthlyNet(db);
    const targetMonths = 3;
    const targetFund = monthlyExpenses * targetMonths;
    const surplus = Number(recurring?.net) || 0;
    const fundedPct = targetFund > 0 ? Math.floor((cashOnHand / targetFund) * 100) : 0;
    const gap = Math.max(0, targetFund - cashOnHand);

    let etaText = "Already funded";
    if (gap > 0) {
      if (surplus > 0) {
        etaText = `${Math.ceil(gap / surplus)} month(s)`;
      } else {
        etaText = "Not available with current surplus";
      }
    }

    const status =
      targetFund > 0 && cashOnHand >= targetFund
        ? "🟢 Funded."
        : "🟡 In progress.";

    return bot.sendMessage(
      chatId,
      [
        "🛟 *Emergency Fund*",
        "",
        codeBlock([
          `Cash on Hand      ${formatMoney(cashOnHand)}`,
          `Monthly Expenses  ${formatMoney(monthlyExpenses)}`,
          `Target Months     ${targetMonths}`,
          `Target Fund       ${formatMoney(targetFund)}`,
          `Recurring Surplus ${surplus >= 0 ? "+" : "-"}${formatMoney(Math.abs(surplus))}`,
          `Funded            ${targetFund > 0 ? `${fundedPct}%` : "n/a"}`,
          `Gap               ${formatMoney(gap)}`,
          `ETA               ${etaText}`
        ].join("\n")),
        "",
        status
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  }

  function sendWhy(chatId) {
    const checking = db.prepare(`
      SELECT id
      FROM accounts
      WHERE name = 'assets:bank'
    `).get();

    if (!checking) {
      return bot.sendMessage(chatId, "Checking account not found.");
    }

    const balanceRow = db.prepare(`
      SELECT IFNULL(SUM(amount),0) as balance
      FROM postings
      WHERE account_id = ?
    `).get(checking.id);

    const currentBalance = Number(balanceRow?.balance) || 0;
    const sim = simulateCashflow(db, currentBalance, checking.id, 30);
    const timeline = Array.isArray(sim?.timeline) ? sim.timeline : [];
    const lowest = Number(sim?.lowestBalance) || currentBalance;

    if (!timeline.length) {
      return bot.sendMessage(
        chatId,
        [
          "🧠 *Why Your Balance Drops*",
          "",
          codeBlock([
            `Lowest Balance   ${formatMoney(currentBalance)}`,
            `Date             ${todayYMD()}`,
            "",
            "Main Causes",
            "No upcoming recurring events were found in the forecast window.",
            "Your current balance is also your projected lowest balance."
          ].join("\n"))
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    let lowestDate = null;
    for (const e of timeline) {
      if (Number(e.balance) === lowest) {
        lowestDate = parseLocalDate(e.date);
        break;
      }
    }

    if (!lowestDate) {
      return bot.sendMessage(
        chatId,
        [
          "🧠 *Why Your Balance Drops*",
          "",
          codeBlock([
            `Lowest Balance   ${formatMoney(lowest)}`,
            `Date             ${todayYMD()}`,
            "",
            "Main Causes",
            "No future event drops your balance below where it is today.",
            "Your current balance is the projected low point."
          ].join("\n"))
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    const causes = [];
    for (const e of timeline) {
      const d = parseLocalDate(e.date);
      const amt = Number(e.amount) || 0;

      if (d && d <= lowestDate && amt < 0) {
        causes.push({
          description: e.description || "expense",
          amount: Math.abs(amt)
        });
      }
    }

    causes.sort((a, b) => b.amount - a.amount);
    const top = causes.slice(0, 5);

    if (!top.length) {
      return bot.sendMessage(
        chatId,
        [
          "🧠 *Why Your Balance Drops*",
          "",
          codeBlock([
            `Lowest Balance   ${formatMoney(lowest)}`,
            `Date             ${lowestDate.toISOString().slice(0, 10)}`,
            "",
            "Main Causes",
            "No expense events were found before the low point."
          ].join("\n"))
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    const lines = top.map((c, i) =>
      `${String(i + 1).padEnd(2)} ${c.description.padEnd(20)} ${formatMoney(c.amount)}`
    );

    return bot.sendMessage(
      chatId,
      [
        "🧠 *Why Your Balance Drops*",
        "",
        codeBlock([
          `Lowest Balance   ${formatMoney(lowest)}`,
          `Date             ${lowestDate.toISOString().slice(0, 10)}`,
          "",
          "Main Causes",
          ...lines
        ].join("\n"))
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  }

  function sendDueNext(chatId) {
    const rows = db.prepare(`
      SELECT id, hash, description, frequency, next_due_date, postings_json
      FROM recurring_transactions
      ORDER BY date(next_due_date) ASC, id ASC
      LIMIT 5
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
        String(row.next_due_date || ""),
        String(row.description || ""),
        formatMoney(amount),
        direction
      ];
    });

    return bot.sendMessage(
      chatId,
      [
        "⏭️ *Due Next*",
        "",
        renderTable(
          ["Next Due", "Description", "Amount", "Type"],
          tableRows,
          { aligns: ["left", "left", "right", "left"] }
        )
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  }

  function sendPayday(chatId) {
    const rows = db.prepare(`
      SELECT id, hash, description, frequency, next_due_date, postings_json
      FROM recurring_transactions
      ORDER BY date(next_due_date) ASC, id ASC
    `).all();

    const incomeRows = rows.filter((row) => {
      try {
        const postings = JSON.parse(row.postings_json);
        const bankLine = Array.isArray(postings)
          ? postings.find((p) => p.account === "assets:bank")
          : null;
        return bankLine && (Number(bankLine.amount) || 0) > 0;
      } catch (_) {
        return false;
      }
    });

    if (!incomeRows.length) {
      return bot.sendMessage(chatId, "No recurring income items found.");
    }

    const next = incomeRows[0];
    return bot.sendMessage(
      chatId,
      [
        "💵 *Next Payday*",
        "",
        `Description: \`${String(next.description || "")}\``,
        `Next Date: \`${String(next.next_due_date || "")}\``
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  }

  function sendCashflow(chatId) {
    if (!getRecurringMonthlyNet) {
      return bot.sendMessage(chatId, "Cashflow helper not available.");
    }

    const recurring = getRecurringMonthlyNet(db);
    const income = Number(recurring?.income) || 0;
    const bills = Number(recurring?.bills) || 0;
    const net = Number(recurring?.net) || 0;

    return bot.sendMessage(
      chatId,
      [
        "🧾 *Monthly Cashflow*",
        "",
        codeBlock([
          `Income  ${formatMoney(income)}`,
          `Bills   ${formatMoney(bills)}`,
          `Net     ${net >= 0 ? "+" : "-"}${formatMoney(Math.abs(net))}`
        ].join("\n"))
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  }

  function sendUntilPayday(chatId) {
    const checking = db.prepare(`
      SELECT id
      FROM accounts
      WHERE name = 'assets:bank'
    `).get();

    if (!checking) {
      return bot.sendMessage(chatId, "Checking account not found.");
    }

    const balanceRow = db.prepare(`
      SELECT IFNULL(SUM(amount),0) as balance
      FROM postings
      WHERE account_id = ?
    `).get(checking.id);

    const currentBalance = Number(balanceRow?.balance) || 0;
    const sim = simulateCashflow(db, currentBalance, checking.id, 30);
    const lowestBeforePay = Number(sim?.lowestBalance) || currentBalance;

    const rows = db.prepare(`
      SELECT id, description, next_due_date, postings_json
      FROM recurring_transactions
      ORDER BY date(next_due_date) ASC, id ASC
    `).all();

    const incomeRows = rows.filter((row) => {
      try {
        const postings = JSON.parse(row.postings_json);
        const bankLine = Array.isArray(postings)
          ? postings.find((p) => p.account === "assets:bank")
          : null;
        return bankLine && (Number(bankLine.amount) || 0) > 0;
      } catch (_) {
        return false;
      }
    });

    let nextPayday = null;
    if (incomeRows.length) {
      nextPayday = String(incomeRows[0].next_due_date || "");
    }

    const safe = lowestBeforePay >= 0;
    const lines = [
      "💵 *Until Payday*",
      "",
      `Current Balance: \`${formatMoney(currentBalance)}\``,
      `Lowest Before Payday: \`${formatMoney(lowestBeforePay)}\``
    ];

    if (nextPayday) {
      lines.push(`Next Payday: \`${nextPayday}\``);
    }

    lines.push("");
    lines.push(safe
      ? "✅ You look safe until payday based on current recurring items."
      : "⚠️ You may dip below zero before payday.");

    return bot.sendMessage(chatId, lines.join("\n"), {
      parse_mode: "Markdown"
    });
  }

  function sendUpcomingIncome(chatId) {
    const rows = db.prepare(`
      SELECT id, description, next_due_date, postings_json
      FROM recurring_transactions
      ORDER BY date(next_due_date) ASC, id ASC
    `).all();

    const incomeRows = rows.filter((row) => {
      try {
        const postings = JSON.parse(row.postings_json);
        const bankLine = Array.isArray(postings)
          ? postings.find((p) => p.account === "assets:bank")
          : null;
        return bankLine && (Number(bankLine.amount) || 0) > 0;
      } catch (_) {
        return false;
      }
    });

    if (!incomeRows.length) {
      return bot.sendMessage(chatId, "No recurring income items found.");
    }

    const tableRows = incomeRows.slice(0, 5).map((row) => {
      let amount = 0;
      try {
        const postings = JSON.parse(row.postings_json);
        const bankLine = Array.isArray(postings)
          ? postings.find((p) => p.account === "assets:bank")
          : null;
        amount = Math.abs(Number(bankLine?.amount) || 0);
      } catch (_) {
        amount = 0;
      }

      return [
        String(row.next_due_date || ""),
        String(row.description || ""),
        formatMoney(amount)
      ];
    });

    return bot.sendMessage(
      chatId,
      [
        "💵 *Upcoming Income*",
        "",
        renderTable(
          ["Next Date", "Description", "Amount"],
          tableRows,
          { aligns: ["left", "left", "right"] }
        )
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  }

  function sendUpcomingBills(chatId) {
    const rows = db.prepare(`
      SELECT id, description, next_due_date, postings_json
      FROM recurring_transactions
      ORDER BY date(next_due_date) ASC, id ASC
    `).all();

    const billRows = rows.filter((row) => {
      try {
        const postings = JSON.parse(row.postings_json);
        const bankLine = Array.isArray(postings)
          ? postings.find((p) => p.account === "assets:bank")
          : null;
        return bankLine && (Number(bankLine.amount) || 0) < 0;
      } catch (_) {
        return false;
      }
    });

    if (!billRows.length) {
      return bot.sendMessage(chatId, "No recurring bills found.");
    }

    const tableRows = billRows.slice(0, 5).map((row) => {
      let amount = 0;
      try {
        const postings = JSON.parse(row.postings_json);
        const bankLine = Array.isArray(postings)
          ? postings.find((p) => p.account === "assets:bank")
          : null;
        amount = Math.abs(Number(bankLine?.amount) || 0);
      } catch (_) {
        amount = 0;
      }

      return [
        String(row.next_due_date || ""),
        String(row.description || ""),
        formatMoney(amount)
      ];
    });

    return bot.sendMessage(
      chatId,
      [
        "🧾 *Upcoming Bills*",
        "",
        renderTable(
          ["Next Date", "Description", "Amount"],
          tableRows,
          { aligns: ["left", "left", "right"] }
        )
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  }

  function sendLowestBalance(chatId) {
    const checking = db.prepare(`
      SELECT id
      FROM accounts
      WHERE name = 'assets:bank'
    `).get();

    if (!checking) {
      return bot.sendMessage(chatId, "Checking account not found.");
    }

    const balanceRow = db.prepare(`
      SELECT IFNULL(SUM(amount),0) as balance
      FROM postings
      WHERE account_id = ?
    `).get(checking.id);

    const currentBalance = Number(balanceRow?.balance) || 0;
    const sim = simulateCashflow(db, currentBalance, checking.id, 30);
    const timeline = Array.isArray(sim?.timeline) ? sim.timeline : [];
    const lowest = Number(sim?.lowestBalance) || currentBalance;

    let lowestDate = todayYMD();
    for (const e of timeline) {
      if (Number(e.balance) === lowest) {
        lowestDate = String(e.date || lowestDate);
        break;
      }
    }

    return bot.sendMessage(
      chatId,
      [
        "📉 *Lowest Balance*",
        "",
        `Projected Lowest Balance: \`${formatMoney(lowest)}\``,
        `Date: \`${lowestDate}\``
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

      const balanceOnDate = parseBalanceOnDate(normalized);
      if (balanceOnDate) {
        return sendBalanceOn(chatId, balanceOnDate);
      }

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

      if (wantsForecast(normalized) || wantsOverdraft(normalized)) {
        return sendForecast(chatId);
      }

      if (wantsNetWorth(normalized)) {
        return sendNetWorth(chatId);
      }

      if (wantsEmergencyFund(normalized)) {
        return sendEmergencyFund(chatId);
      }

      if (wantsWhy(normalized)) {
        return sendWhy(chatId);
      }

      if (wantsDueNext(normalized)) {
        return sendDueNext(chatId);
      }

      if (wantsPayday(normalized)) {
        return sendPayday(chatId);
      }

      if (wantsCashflow(normalized)) {
        return sendCashflow(chatId);
      }

      if (wantsUntilPayday(normalized)) {
        return sendUntilPayday(chatId);
      }

      if (wantsUpcomingIncome(normalized)) {
        return sendUpcomingIncome(chatId);
      }

      if (wantsUpcomingBills(normalized)) {
        return sendUpcomingBills(chatId);
      }

      if (wantsLowestBalance(normalized)) {
        return sendLowestBalance(chatId);
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
