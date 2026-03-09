// handlers/history.js
module.exports = function registerHistoryHandler(bot, deps) {
  const { ledgerService, format } = deps;
  const { codeBlock } = format;

  function renderHelp() {
    return [
      "*\\/history*",
      "Show recent transactions.",
      "",
      "*Usage*",
      "- `/history`",
      "",
      "*Examples*",
      "- `/history`",
      "",
      "*Notes*",
      "- Shows the 5 most recent transactions.",
      "- Includes example `/undo` commands."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/history(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/history` command does not take arguments.",
          "",
          "Usage:",
          "`/history`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    try {
      const rows = ledgerService.getRecentTransactions(5);

      if (!rows.length) {
        return bot.sendMessage(chatId, "No transactions recorded yet.");
      }

      const lines = rows.map((r) => {
        const date = String(r.date || "");
        const hash = String(r.hash || "").slice(0, 8);
        const description = String(r.description || "");
        return `${date}  ${hash}  ${description}`;
      });

      const out = [
        "🧾 *Last Transactions*",
        "",
        codeBlock(lines.join("\n")),
        "Undo examples:",
        "`/undo`",
        `\`/undo ${String(rows[0].hash || "").slice(0, 8)}\``
      ].join("\n");

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("History error:", err);
      return bot.sendMessage(chatId, "Error retrieving history.");
    }
  });
};

module.exports.help = {
  command: "history",
  category: "Reporting",
  summary: "Show recent transactions.",
  usage: [
    "/history"
  ],
  examples: [
    "/history"
  ],
  notes: [
    "Shows the 5 most recent transactions.",
    "Includes example `/undo` commands."
  ]
};
