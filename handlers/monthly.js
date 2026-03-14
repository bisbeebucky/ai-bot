// handlers/monthly.js
module.exports = function registerMonthlyHandler(bot, deps) {
  const { db, format } = deps;
  const { formatMoney, codeBlock, renderTable } = format;

  function renderHelp() {
    return [
      "*\\/monthly*",
      "Show this month's income, expenses, and net.",
      "",
      "*Usage*",
      "- `/monthly`",
      "- `/monthly detail`",
      "",
      "*Examples*",
      "- `/monthly`",
      "- `/monthly detail`",
      "",
      "*Notes*",
      "- Default mode shows a compact monthly summary.",
      "- `detail` shows income and expense breakdown by account."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/monthly(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();
    const arg = raw.toLowerCase();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      if (arg !== "detail") {
        return bot.sendMessage(
          chatId,
          [
            "Usage:",
            "`/monthly`",
            "`/monthly detail`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }
    }

    try {
      if (arg !== "detail") {
        const rows = db.prepare(`
          SELECT
            a.type as type,
            SUM(p.amount) as total
          FROM transactions t
          JOIN postings p ON p.transaction_id = t.id
          JOIN accounts a ON a.id = p.account_id
          WHERE strftime('%Y-%m', t.date) = strftime('%Y-%m', 'now')
            AND (a.type = 'INCOME' OR a.type = 'EXPENSES')
          GROUP BY a.type
        `).all();

        let income = 0;
        let expenses = 0;

        for (const r of rows) {
          const v = Math.abs(Number(r.total) || 0);
          if (r.type === "INCOME") income = v;
          if (r.type === "EXPENSES") expenses = v;
        }

        const net = income - expenses;

        const out = [
          "📊 *This Month*",
          "",
          codeBlock([
            `Income    ${formatMoney(income)}`,
            `Expenses  ${formatMoney(expenses)}`,
            `Net       ${net >= 0 ? "+" : "-"}${formatMoney(Math.abs(net))}`
          ].join("\n"))
        ].join("\n");

        return bot.sendMessage(chatId, out, {
          parse_mode: "Markdown"
        });
      }

      const rows = db.prepare(`
        SELECT
          a.name as account,
          a.type as type,
          SUM(p.amount) as total
        FROM transactions t
        JOIN postings p ON p.transaction_id = t.id
        JOIN accounts a ON a.id = p.account_id
        WHERE strftime('%Y-%m', t.date) = strftime('%Y-%m', 'now')
          AND (a.type = 'INCOME' OR a.type = 'EXPENSES')
        GROUP BY a.name, a.type
        ORDER BY a.type ASC, ABS(SUM(p.amount)) DESC, a.name ASC
      `).all();

      if (!rows.length) {
        return bot.sendMessage(chatId, "No income or expense activity this month.");
      }

      const incomeRows = [];
      const expenseRows = [];
      let incomeTotal = 0;
      let expenseTotal = 0;

      for (const r of rows) {
        const amount = Math.abs(Number(r.total) || 0);

        if (r.type === "INCOME") {
          incomeRows.push([r.account, formatMoney(amount)]);
          incomeTotal += amount;
        }

        if (r.type === "EXPENSES") {
          expenseRows.push({
            account: r.account,
            amount
          });
          expenseTotal += amount;
        }
      }

      const expenseTableRows = expenseRows.map((r) => {
        const pct = expenseTotal > 0
          ? `${((r.amount / expenseTotal) * 100).toFixed(0)}%`
          : "0%";

        return [r.account, formatMoney(r.amount), pct];
      });

      const net = incomeTotal - expenseTotal;

      let out = "📊 *Monthly Detail*";

      if (incomeRows.length) {
        out += "\n\nIncome\n";
        out += renderTable(
          ["Account", "Amount"],
          incomeRows,
          { aligns: ["left", "right"] }
        );
      }

      if (expenseTableRows.length) {
        out += "\n\nExpenses\n";
        out += renderTable(
          ["Account", "Amount", "%"],
          expenseTableRows,
          { aligns: ["left", "right", "right"] }
        );
      }

      out += "\n\nTotals\n";
      out += renderTable(
        ["Type", "Amount"],
        [
          ["Income", formatMoney(incomeTotal)],
          ["Expenses", formatMoney(expenseTotal)],
          ["Net", `${net >= 0 ? "+" : "-"}${formatMoney(Math.abs(net))}`]
        ],
        { aligns: ["left", "right"] }
      );

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("Monthly error:", err);
      return bot.sendMessage(chatId, "Error calculating monthly totals.");
    }
  });
};

module.exports.help = {
  command: "monthly",
  category: "Spending",
  summary: "Show this month's income, expenses, and net.",
  usage: [
    "/monthly",
    "/monthly detail"
  ],
  examples: [
    "/monthly",
    "/monthly detail"
  ],
  notes: [
    "Default mode shows a compact monthly summary.",
    "`detail` shows income and expense breakdown by account."
  ]
};
