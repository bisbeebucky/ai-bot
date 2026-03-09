// handlers/forecast.js
module.exports = function registerForecastHandler(bot, deps) {
  const { db, simulateCashflow, format } = deps;
  const { formatMoney, renderTable, codeBlock } = format;

  function renderHelp() {
    return [
      "*\\/forecast*",
      "Show a 30-day projected cashflow timeline for `assets:bank`.",
      "",
      "*Usage*",
      "- `/forecast`",
      "",
      "*Examples*",
      "- `/forecast`",
      "",
      "*Notes*",
      "- Uses `simulateCashflow`.",
      "- Starting balance is read from `assets:bank`.",
      "- Forecast horizon is currently fixed at 30 days in this handler."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/forecast(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/forecast` command does not take arguments.",
          "",
          "Usage:",
          "`/forecast`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    try {
      const checking = db.prepare(`
        SELECT id
        FROM accounts
        WHERE name = 'assets:bank'
      `).get();

      if (!checking) {
        return bot.sendMessage(chatId, "Checking account not found.");
      }

      const balanceRow = db.prepare(`
        SELECT IFNULL(SUM(amount), 0) as balance
        FROM postings
        WHERE account_id = ?
      `).get(checking.id);

      const currentBalance = Number(balanceRow?.balance) || 0;
      const result = simulateCashflow(db, currentBalance, checking.id, 30);

      const timeline = Array.isArray(result?.timeline) ? result.timeline : [];

      if (!timeline.length) {
        return bot.sendMessage(
          chatId,
          [
            "📊 *30-Day Forecast*",
            "",
            codeBlock([
              `Starting Balance  ${formatMoney(currentBalance)}`,
              "Timeline          No forecast events"
            ].join("\n"))
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const tableRows = timeline.slice(0, 25).map((event) => [
        String(event.date || ""),
        String(event.description || ""),
        formatMoney(Number(event.balance) || 0)
      ]);

      const lines = [
        "📊 *30-Day Forecast*",
        "",
        codeBlock([
          `Starting Balance  ${formatMoney(currentBalance)}`,
          `Lowest Balance    ${formatMoney(Number(result?.lowestBalance) || currentBalance)}`,
          `Events Shown      ${tableRows.length}${timeline.length > 25 ? ` of ${timeline.length}` : ""}`
        ].join("\n")),
        renderTable(
          ["Date", "Description", "Balance"],
          tableRows,
          { aligns: ["left", "left", "right"] }
        )
      ];

      if (timeline.length > 25) {
        lines.push("_Showing first 25 forecast events._");
      }

      return bot.sendMessage(chatId, lines.join("\n"), {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("forecast error:", err);
      return bot.sendMessage(chatId, "Forecast error.");
    }
  });
};

module.exports.help = {
  command: "forecast",
  category: "Forecasting",
  summary: "Show a 30-day projected cashflow timeline for assets:bank.",
  usage: [
    "/forecast"
  ],
  examples: [
    "/forecast"
  ],
  notes: [
    "Uses `simulateCashflow`.",
    "Starting balance is read from `assets:bank`.",
    "Forecast horizon is currently fixed at 30 days in this handler."
  ]
};
