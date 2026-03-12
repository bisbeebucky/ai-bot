// handlers/debts_list.js
module.exports = function registerDebtsListHandler(bot, deps) {
  const { db, format } = deps;
  const { formatMoney, renderTable } = format;

  function renderHelp() {
    return [
      "*\\/debts_list*",
      "List all recorded debts with numeric IDs, balance, APR, and minimum payment.",
      "",
      "*Usage*",
      "- `/debts_list`",
      "- `/debts`",
      "",
      "*Examples*",
      "- `/debts_list`",
      "- `/debts`",
      "",
      "*Notes*",
      "- Debts are sorted by balance descending.",
      "- Use the numeric ID with `/debt_delete <id>`.",
      "- Output is shown in a Markdown code block table."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/(debts_list|debts)(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[2] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/debts_list` command does not take arguments.",
          "",
          "Usage:",
          "`/debts_list`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    try {
      const rows = db.prepare(`
        SELECT id, name, balance, apr, minimum
        FROM debts
        ORDER BY balance DESC, id ASC
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

      const out = [
        "💳 *Debts*",
        "",
        renderTable(
          ["ID", "Name", "Balance", "APR", "Minimum"],
          tableRows,
          { aligns: ["right", "left", "right", "right", "right"] }
        ),
        "Delete: `/debt_delete <id>`",
        `Total Debt: \`${formatMoney(totalDebt)}\``,
        `Total Minimums: \`${formatMoney(totalMinimum)}\``
      ].join("\n");

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("debts_list error:", err);
      return bot.sendMessage(chatId, "Error retrieving debts.");
    }
  });
};

module.exports.help = {
  command: "debts_list",
  aliases: ["debts"],
  category: "Debt",
  summary: "List all recorded debts with numeric IDs, balance, APR, and minimum payment.",
  usage: [
    "/debts_list",
    "/debts"
  ],
  examples: [
    "/debts_list",
    "/debts"
  ],
  notes: [
    "Debts are sorted by balance descending.",
    "Use the numeric ID with /debt_delete <id>.",
    "Output is shown in a Markdown code block table."
  ]
};
