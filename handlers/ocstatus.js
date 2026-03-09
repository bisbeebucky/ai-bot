// handlers/ocstatus.js
module.exports = function registerOcstatusHandler(bot, deps) {
  function renderHelp() {
    return [
      "*\\/ocstatus*",
      "OpenClaw runtime status.",
      "",
      "*Usage*",
      "- `/ocstatus`",
      "",
      "*Examples*",
      "- `/ocstatus`"
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/ocstatus(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/ocstatus` command does not take arguments.",
          "",
          "Usage:",
          "`/ocstatus`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    return bot.sendMessage(chatId, "OpenClaw runtime status is not configured.");
  });
};

module.exports.help = {
  command: "ocstatus",
  category: "General",
  summary: "OpenClaw runtime status.",
  usage: [
    "/ocstatus"
  ],
  examples: [
    "/ocstatus"
  ]
};
