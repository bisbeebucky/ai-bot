// handlers/botstatus.js
module.exports = function registerBotstatusHandler(bot, deps) {
  const { format } = deps;
  const { codeBlock } = format;

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function formatUptime(sec) {
    const s = Math.floor(Number(sec) || 0);
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  function renderHelp() {
    return [
      "*\\/botstatus*",
      "Show local bot runtime status, including process ID, Node version, platform, uptime, and memory usage.",
      "",
      "*Usage*",
      "- `/botstatus`",
      "",
      "*Examples*",
      "- `/botstatus`",
      "",
      "*Notes*",
      "- Shows local process runtime information only.",
      "- Useful for verifying that the bot process is alive and stable."
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
      const memory = process.memoryUsage();

      const out = [
        "🤖 *Bot Status*",
        "",
        codeBlock([
          `PID          ${process.pid}`,
          `Node         ${process.version}`,
          `Platform     ${process.platform}`,
          `Uptime       ${formatUptime(process.uptime())}`,
          `RSS          ${formatBytes(memory.rss)}`,
          `Heap Used    ${formatBytes(memory.heapUsed)}`,
          `Heap Total   ${formatBytes(memory.heapTotal)}`
        ].join("\n")),
        "",
        "Project: https://github.com/bisbeebucky/ai-bot",
        "⭐ Star the repo if you find it useful"
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
  category: "Runtime",
  summary: "Show local bot runtime status, including process ID, Node version, platform, uptime, and memory usage.",
  usage: [
    "/botstatus"
  ],
  examples: [
    "/botstatus"
  ],
  notes: [
    "Shows local process runtime information only.",
    "Useful for verifying that the bot process is alive and stable."
  ]
};
