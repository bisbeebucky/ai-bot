// bootstrap/bot.js
const TelegramBot = require("node-telegram-bot-api");

module.exports = function createBot() {
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

  const shutdown = async () => {
    try { await bot.stopPolling(); } catch {}
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  return bot;
};
