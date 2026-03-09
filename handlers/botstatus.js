// handlers/botstatus.js
module.exports = function registerBotstatusHandler(bot, deps) {
  const { format } = deps;
  const { codeBlock } = format;

  function renderHelp() {
    return [
      "*\\/botstatus*",
      "Local bot runtime status.",
      "",
      "*Usage*",
      "- `/botstatus`",
      "",
      "*Examples*",
      "- `/botstatus`"
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/botstatus(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/botstatus` command does not take arguments.",
          "",
          "Usage:",
          "`/botstatus`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    try {
      const uptimeSeconds = Math.floor(process.uptime());
      const memory = process.memoryUsage();

      const out = [
        "🤖 *Bot Status*",
        "",
        codeBlock([
          `PID          ${process.pid}`,
          `Node         ${process.version}`,
          `Platform     ${process.platform}`,
          `Uptime Sec   ${uptimeSeconds}`,
          `RSS Bytes    ${memory.rss}`,
          `Heap Used    ${memory.heapUsed}`,
          `Heap Total   ${memory.heapTotal}`
        ].join("\n"))
      ].join("\n");

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("botstatus error:", err);
      return bot.sendMessage(chatId, "Error getting bot status.");
    }
  });
};

module.exports.help = {
  command: "botstatus",
  category: "General",
  summary: "Local bot runtime status.",
  usage: [
    "/botstatus"
  ],
  examples: [
    "/botstatus"
  ]
};
