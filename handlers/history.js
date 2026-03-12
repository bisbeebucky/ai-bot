// handlers/history.js
module.exports = function registerHistoryHandler(bot, deps) {
  const { ledgerService, format } = deps;
  const { codeBlock, formatMoney } = format;

  const DEFAULT_HISTORY_COUNT = 5;

  function renderHelp() {
    return [
      "*\\/history*",
      "Show recent transactions with dollar amounts.",
      "",
      "*Usage*",
      "- `/history`",
      "- `/history 10`",
      "",
      "*Examples*",
      "- `/history`",
      "- `/history 20`",
      "",
      "*Notes*",
      `- Shows the ${DEFAULT_HISTORY_COUNT} most recent transactions by default.`,
      "- You can request more entries by passing a number.",
      "- Includes example `/undo` commands."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  function formatSignedMoney(value) {
    const n = Number(value) || 0;
    return `${n >= 0 ? "+" : "-"}${formatMoney(Math.abs(n))}`;
  }

  function parseHistoryCount(raw) {
    if (!raw) return DEFAULT_HISTORY_COUNT;

    if (!/^\d+$/i.test(raw)) {
      return null;
    }

    const count = Number(raw);

    if (!Number.isInteger(count) || count <= 0) {
      return null;
    }

    return count;
  }

  bot.onText(/^\/history(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw && /^(help|--help|-h)$/i.test(raw)) {
      return sendHelp(chatId);
    }

    const count = parseHistoryCount(raw);

    if (count === null) {
      return bot.sendMessage(
        chatId,
        [
          "Invalid `/history` argument.",
          "",
          "Usage:",
          "`/history`",
          "`/history 10`",
          "`/history help`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    try {
      const rows = ledgerService.getRecentTransactions(count);

      if (!rows.length) {
        return bot.sendMessage(chatId, "No transactions recorded yet.");
      }

      const lines = rows.flatMap((r) => {
        const date = String(r.date || "");
        const hash = String(r.hash || "").slice(0, 8);
        const description = String(r.description || "");
        const amount = formatSignedMoney(r.amount);

        return [
          `${date}  ${hash}  ${amount.padStart(10)}`,
          description,
          ""
        ];
      });

      const out = [
        `🧾 *Last ${rows.length} Transaction${rows.length === 1 ? "" : "s"}*`,
        "",
        codeBlock(lines.join("\n").trim()),
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
  summary: "Show recent transactions with dollar amounts.",
  usage: [
    "/history",
    "/history 10"
  ],
  examples: [
    "/history",
    "/history 20"
  ],
  notes: [
    "Shows the 5 most recent transactions by default.",
    "You can request more entries by passing a number.",
    "Includes example `/undo` commands."
  ]
};
