// index.js
// require("dotenv").config(); // optional: only if you use a .env file

const db = require("./models/db");

const createBot = require("./bootstrap/bot");
const createOpenAIClient = require("./bootstrap/openai");
const createDeps = require("./bootstrap/deps");
const registerCronJobs = require("./bootstrap/cron");

const registerAllHandlers = require("./handlers");

/* =====================================================
   ENV CHECKS
===================================================== */

function requireEnv(key) {
  if (!process.env[key]) {
    console.error(`${key} not set`);
    process.exit(1);
  }
}

function requireAnyEnv(keys) {
  const found = keys.find((k) => process.env[k]);
  if (!found) {
    console.error(`${keys.join(" or ")} not set`);
    process.exit(1);
  }
}

requireEnv("TELEGRAM_BOT_TOKEN");
requireAnyEnv(["OPENROUTER_API_KEY", "OPENAI_API_KEY"]);

/* =====================================================
   BOOTSTRAP
===================================================== */

const bot = createBot();
const openai = createOpenAIClient();

// deps is the single source of truth for services
const deps = createDeps(db, openai);

/* =====================================================
   STARTUP
===================================================== */

registerAllHandlers(bot, deps);
registerCronJobs({ recurringProcessor: deps.recurringProcessor });

console.log("Bot started.");

console.log(`
Kalverion_bot running.

If you find this project useful please give it a star:
https://github.com/bisbeebucky/ai-bot
`);
