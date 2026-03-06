// handlers/ocstatus.js
module.exports = function registerOCStatusHandler(bot) {
  bot.onText(/^\/ocstatus(@\w+)?$/i, (msg) => {
    const chatId = msg.chat.id;

    let out = "🧠 OpenClaw Status\n\n";
    out += "```\n";
    out += "Gateway:      OpenClaw\n";
    out += "Provider:     OpenRouter\n";
    out += "Model Route:  openrouter/free\n";
    out += "Underlying:   not exposed\n";
    out += "Role:         Telegram gateway / AI runtime\n";
    out += "```";
    out += "\nThis is the OpenClaw/OpenRouter side, not the finance engine.";

    return bot.sendMessage(chatId, out, {
      parse_mode: "Markdown"
    });
  });
};
