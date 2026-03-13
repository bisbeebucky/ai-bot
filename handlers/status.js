// handlers/status.js
module.exports = function registerStatusHandler(bot, deps) {
  const { db, ledgerService, format, finance } = deps;
  const { formatMoney, codeBlock, renderTable } = format;
  const { getDebtRows } = finance;

  function parseYMD(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  }

  function ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function signedMoney(n, suffix = "") {
    const value = Number(n) || 0;
    const sign = value >= 0 ? "+" : "-";
    return `${sign}${formatMoney(Math.abs(value))}${suffix}`;
  }

  function nextDueDate(dateObj, frequency) {
    const d = new Date(dateObj);
    d.setHours(12, 0, 0, 0);

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
        if (d.getDate() !== day) d.setDate(0);
        d.setHours(12, 0, 0, 0);
        return d;
      }
      case "yearly":
        d.setFullYear(d.getFullYear() + 1);
        d.setHours(12, 0, 0, 0);
        return d;
      default:
        return null;
    }
  }

  function extractBankAmount(postings_json) {
    try {
      const postings = JSON.parse(postings_json);
      if (!Array.isArray(postings)) return 0;
      const bankLine = postings.find((p) => p.account === "assets:bank");
      return Number(bankLine?.amount) || 0;
    } catch {
      return 0;
    }
  }

  function renderHelp() {
    return [
      "*\\/status*",
      "Show a compact financial status snapshot including current balance, recent income and expenses, recurring 30-day net, projected 30-day balance, and debt metrics.",
      "",
      "*Usage*",
      "- `/status`",
      "",
      "*Examples*",
      "- `/status`",
      "",
      "*Notes*",
      "- Uses `ledgerService.getBalances()` for current balances.",
      "- Expands recurring items across the next 30 days.",
      "- Shows up to 3 upcoming recurring events."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/status(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/status` command does not take arguments.",
          "",
          "Usage:",
          "`/status`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    try {
      const balances = ledgerService.getBalances();
      const bank = balances.find((b) => b.account === "assets:bank");
      const savings = balances.find((b) => b.account === "assets:savings");

      const bankBalance = Number(bank?.balance) || 0;
      const savingsBalance = Number(savings?.balance) || 0;

      const rows = db.prepare(`
        SELECT
          a.type as type,
          SUM(p.amount) as total
        FROM transactions t
        JOIN postings p ON p.transaction_id = t.id
        JOIN accounts a ON a.id = p.account_id
        WHERE t.date >= date('now', '-30 days')
          AND (a.type = 'INCOME' OR a.type = 'EXPENSES')
        GROUP BY a.type
      `).all();

      let income30 = 0;
      let expenses30 = 0;

      for (const row of rows) {
        const value = Math.abs(Number(row.total) || 0);
        if (row.type === "INCOME") income30 = value;
        if (row.type === "EXPENSES") expenses30 = value;
      }

      const net30 = income30 - expenses30;

      const recurring = db.prepare(`
        SELECT id, description, postings_json, frequency, next_due_date
        FROM recurring_transactions
        ORDER BY date(next_due_date) ASC, id ASC
      `).all();

      const today = new Date();
      today.setHours(12, 0, 0, 0);

      const end = new Date(today);
      end.setDate(end.getDate() + 30);
      end.setHours(12, 0, 0, 0);

      let recurringNet30 = 0;
      const nextItems = [];

      for (const row of recurring) {
        let due = parseYMD(row.next_due_date);
        if (!due) continue;

        let guard = 0;
        const bankAmt = extractBankAmount(row.postings_json);

        while (due <= end && guard < 500) {
          if (due >= today) {
            recurringNet30 += bankAmt;

            if (nextItems.length < 3) {
              nextItems.push({
                date: ymd(due),
                description: String(row.description || ""),
                amount: bankAmt
              });
            }
          }

          const next = nextDueDate(due, row.frequency);
          if (!next) break;
          due = next;
          guard += 1;
        }
      }

      const projectedNet30 = bankBalance + recurringNet30;

      const debtRows = getDebtRows(db);

      const totalDebt = debtRows.reduce((sum, d) => {
        return sum + (Number(d.balance) || 0);
      }, 0);

      const totalMinimums = debtRows.reduce((sum, d) => {
        return sum + (Number(d.minimum) || 0);
      }, 0);

      const weightedNumerator = debtRows.reduce((sum, d) => {
        return sum + ((Number(d.balance) || 0) * (Number(d.apr) || 0));
      }, 0);

      const weightedApr =
        totalDebt > 0 ? weightedNumerator / totalDebt : 0;

      const totalAssets = bankBalance + savingsBalance;
      const netWorth = totalAssets - totalDebt;

      const lines = [
        "📊 *Status*",
        "",
        codeBlock([
          `Bank           ${formatMoney(bankBalance)}`,
          `Savings        ${formatMoney(savingsBalance)}`,
          `Net Worth      ${signedMoney(netWorth)}`,
          `30d Income     ${formatMoney(income30)}`,
          `30d Expenses   ${formatMoney(expenses30)}`,
          `30d Net        ${signedMoney(net30)}`,
          `Recurring 30d  ${signedMoney(recurringNet30)}`,
          `Projected 30d  ${formatMoney(projectedNet30)}`,
          `Debt Total     ${formatMoney(totalDebt)}`,
          `Debt Min/Mon   ${formatMoney(totalMinimums)}`,
          `Weighted APR   ${weightedApr.toFixed(2)}%`
        ].join("\n"))
      ];

      if (nextItems.length) {
        const nextRows = nextItems.map((item) => [
          item.date,
          item.description,
          signedMoney(item.amount)
        ]);

        lines.push(
          renderTable(
            ["Date", "Next Event", "Amount"],
            nextRows,
            { aligns: ["left", "left", "right"] }
          )
        );
      }

      return bot.sendMessage(chatId, lines.join("\n"), {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("status error:", err);
      return bot.sendMessage(chatId, "Error generating status.");
    }
  });
};

module.exports.help = {
  command: "status",
  category: "Reporting",
  summary: "Show a compact financial status snapshot including current balance, recent income and expenses, recurring 30-day net, projected 30-day balance, and debt metrics.",
  usage: [
    "/status"
  ],
  examples: [
    "/status"
  ],
  notes: [
    "Uses `ledgerService.getBalances()` for current balances.",
    "Expands recurring items across the next 30 days.",
    "Shows up to 3 upcoming recurring events."
  ]
};
