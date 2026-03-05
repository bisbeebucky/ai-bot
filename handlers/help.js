const fs = require("fs");
const path = require("path");

module.exports = function registerHelpHandler(bot) {
  bot.onText(/^\/help(@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;

    // list handler files -> command names (best-effort)
    const dir = __dirname;
    const files = fs
      .readdirSync(dir)
      .filter(f => f.endsWith(".js") && f !== "index.js");

    const known = [
      { cmd: "/add", desc: "Add expense: /add coffee 4.50" },
      { cmd: "/balance", desc: "Show assets:bank balance" },
      { cmd: "/history", desc: "Show last transactions" },
      { cmd: "/undo", desc: "Undo last or /undo <hashPrefix>" },
      { cmd: "/forecast", desc: "30-day forecast (text)" },
      { cmd: "/forecastgraph", desc: "30-day forecast graph" },
      { cmd: "/whatif", desc: "What-if spend: /whatif 50" },
      { cmd: "/recurring", desc: "Recurring bill: /recurring rent 427 monthly 3" },
      { cmd: "/recurring_income", desc: "Recurring income: /recurring_income \"Social Security\" 1500 monthly 3" },
      { cmd: "/recurring_list", desc: "List recurring rules" },
      { cmd: "/recurring_delete", desc: "Delete recurring: /recurring_delete <id|hash>" },
      { cmd: "/runrecurring", desc: "Manually post due recurring now" },
      { cmd: "/status", desc: "Dashboard summary" },
      { cmd: "/runway", desc: "Runway months based on net cashflow" },
      { cmd: "/networth", desc: "Net worth from balances" },
    ];

    let out = "🤖 Commands\n\n";
    out += known.map(x => `${x.cmd} — ${x.desc}`).join("\n");
    out += "\n\nLoaded handlers:\n";
    out += files.map(f => `• ${f}`).join("\n");

    return bot.sendMessage(chatId, out);
  });
};
