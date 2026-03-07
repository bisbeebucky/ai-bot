const fs = require("fs");

module.exports = function registerHelpHandler(bot) {
  bot.onText(/^\/help(@\w+)?$/, (msg) => {
    const chatId = msg.chat.id;

    const dir = __dirname;

    const files = fs
      .readdirSync(dir)
      .filter(f => f.endsWith(".js") && f !== "index.js");

    const commands = [

      { cmd: "/add", desc: "Add expense: /add groceries 20" },
      { cmd: "/deposit", desc: "Deposit money: /deposit 500 paycheck" },
      { cmd: "/withdraw", desc: "Withdraw money: /withdraw 50 cash" },

      { cmd: "/balance", desc: "Show bank balance" },
      { cmd: "/accounts", desc: "List all account balances" },
      { cmd: "/networth", desc: "Assets minus liabilities" },
      { cmd: "/history", desc: "Recent transactions" },
      { cmd: "/undo", desc: "Undo last transaction" },

      { cmd: "/forecast", desc: "30-day forecast (text)" },
      { cmd: "/forecastgraph", desc: "30-day forecast graph" },
      { cmd: "/whatif", desc: "Simulate spending impact" },

      { cmd: "/recurring", desc: "Add recurring bill" },
      { cmd: "/recurring_income", desc: "Add recurring income" },
      { cmd: "/recurring_list", desc: "List recurring rules" },
      { cmd: "/recurring_delete", desc: "Delete recurring rule" },
      { cmd: "/runrecurring", desc: "Post due recurring transactions" },
      { cmd: "/upcoming", desc: "Show upcoming recurring events" },

      { cmd: "/monthly_detail", desc: "Monthly income/expense breakdown" },
      { cmd: "/burnrate", desc: "Monthly burn rate analysis" },
      { cmd: "/projection", desc: "12-month projection" },

      { cmd: "/debt_add", desc: "Add debt account" },
      { cmd: "/debt_edit", desc: "Edit debt balance/APR/minimum" },
      { cmd: "/debt_pay", desc: "Record payment toward debt" },
      { cmd: "/debt_delete", desc: "Delete debt entry" },
      { cmd: "/debts", desc: "List debts" },
      { cmd: "/debt_total", desc: "Show total debt" },

      { cmd: "/debt_strategy", desc: "Snowball vs avalanche order" },
      { cmd: "/debt_plan", desc: "Debt payoff plan" },
      { cmd: "/debt_sim", desc: "Debt payoff simulation" },
      { cmd: "/debt_compare", desc: "Compare strategies" },
      { cmd: "/debt_graph", desc: "Debt payoff graph" },
      { cmd: "/debt_compare_graph", desc: "Compare payoff graphs" },

      { cmd: "/financial_health", desc: "Financial health score" },
      { cmd: "/milestones", desc: "Financial milestone dates" },

      { cmd: "/future", desc: "Financial projection graph (/future 24)" },

      { cmd: "/retirement", desc: "Retirement growth projection" },
      { cmd: "/retirement_auto", desc: "Months to retirement target" },
      { cmd: "/retirement_fi", desc: "Financial independence estimate" },

      { cmd: "/status", desc: "Financial dashboard summary" },
      { cmd: "/botstatus", desc: "Bot system status" },
      { cmd: "/ocstatus", desc: "OpenClaw runtime status" }
    ];

    let out = "🤖 Bot Commands\n\n";

    out += commands.map(c => `${c.cmd.padEnd(20)} ${c.desc}`).join("\n");

    out += "\n\n📦 Loaded Handlers\n";
    out += files.map(f => `• ${f}`).join("\n");

    return bot.sendMessage(chatId, out);
  });
}
