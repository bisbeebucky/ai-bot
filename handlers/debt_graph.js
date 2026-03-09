// handlers/debt_graph.js
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

module.exports = function registerDebtGraphHandler(bot, deps) {
  const { db, format, debt } = deps;
  const { formatMoney } = format;
  const { getDebtRows, runDebtSimulation } = debt;

  function renderHelp() {
    return [
      "*\\/debt_graph*",
      "Generate a debt payoff graph using either snowball or avalanche with an extra monthly payment.",
      "",
      "*Usage*",
      "- `/debt_graph <snowball|avalanche> <extra>`",
      "",
      "*Arguments*",
      "- `<snowball|avalanche>` — Debt payoff strategy to graph.",
      "- `<extra>` — Extra monthly payment on top of minimums. Must be zero or greater.",
      "",
      "*Examples*",
      "- `/debt_graph snowball 100`",
      "- `/debt_graph avalanche 250`",
      "",
      "*Notes*",
      "- Uses your current debts table.",
      "- Graph runs until payoff or the simulation safety limit."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/debt_graph(?:@\w+)?(?:\s+(.*))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (!raw || /^(help|--help|-h)$/i.test(raw)) {
      return sendHelp(chatId);
    }

    try {
      const parsed = raw.match(/^(snowball|avalanche)\s+(-?\d+(?:\.\d+)?)$/i);

      if (!parsed) {
        return bot.sendMessage(
          chatId,
          [
            "Missing or invalid arguments for `/debt_graph`.",
            "",
            "Usage:",
            "`/debt_graph <snowball|avalanche> <extra>`",
            "",
            "Examples:",
            "`/debt_graph snowball 100`",
            "`/debt_graph avalanche 250`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const mode = String(parsed[1] || "").toLowerCase();
      const extra = Number(parsed[2]);

      if (!Number.isFinite(extra) || extra < 0) {
        return bot.sendMessage(
          chatId,
          [
            "Extra payment must be zero or greater.",
            "",
            "Usage:",
            "`/debt_graph <snowball|avalanche> <extra>`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const rows = getDebtRows(db);

      if (!rows.length) {
        return bot.sendMessage(chatId, "No debts recorded.");
      }

      const result = runDebtSimulation(rows, mode, extra);

      if (
        result.months == null ||
        result.interest == null ||
        !Array.isArray(result.totals) ||
        !result.totals.length
      ) {
        return bot.sendMessage(chatId, "Simulation exceeded safe limit.");
      }

      const labels = Array.from({ length: result.totals.length }, (_, i) =>
        i === 0 ? "Start" : `M${i}`
      );

      const width = 1000;
      const height = 600;

      const chartJSNodeCanvas = new ChartJSNodeCanvas({
        width,
        height,
        backgroundColour: "#0f172a"
      });

      const configuration = {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: `Debt Payoff (${mode})`,
              data: result.totals,
              borderWidth: 4,
              tension: 0.25,
              pointRadius: 3,
              fill: true,
              borderColor: "#22c55e",
              backgroundColor: "rgba(34, 197, 94, 0.2)"
            }
          ]
        },
        options: {
          responsive: false,
          layout: { padding: 40 },
          plugins: {
            legend: {
              labels: {
                color: "#ffffff",
                font: { size: 24 }
              }
            }
          },
          scales: {
            x: {
              ticks: {
                color: "#ffffff",
                font: { size: 18 },
                maxTicksLimit: 10
              },
              grid: {
                color: "rgba(255,255,255,0.08)"
              }
            },
            y: {
              ticks: {
                color: "#ffffff",
                font: { size: 22 },
                callback: (value) => "$" + Number(value).toLocaleString()
              },
              grid: {
                color: (ctx) =>
                  ctx.tick.value === 0
                    ? "rgba(255,255,255,0.35)"
                    : "rgba(255,255,255,0.08)"
              }
            }
          }
        }
      };

      const image = await chartJSNodeCanvas.renderToBuffer(configuration);

      await bot.sendPhoto(chatId, image, {
        filename: "debt_graph.png",
        contentType: "image/png"
      });

      let summary = `💳 Debt Graph (${mode})\n\n`;
      summary += `Starting Debt: ${formatMoney(result.startingDebt)}\n`;
      summary += `Extra Payment: ${formatMoney(extra)} / month\n`;
      summary += `Months to Payoff: ${result.months}\n`;
      summary += `Interest Paid: ${formatMoney(result.interest)}`;

      return bot.sendMessage(chatId, summary);
    } catch (err) {
      console.error("debt_graph error:", err);
      return bot.sendMessage(chatId, "Error generating debt graph.");
    }
  });
};

module.exports.help = {
  command: "debt_graph",
  category: "Debt",
  summary: "Generate a debt payoff graph using either snowball or avalanche with an extra monthly payment.",
  usage: [
    "/debt_graph <snowball|avalanche> <extra>"
  ],
  args: [
    { name: "<snowball|avalanche>", description: "Debt payoff strategy to graph." },
    { name: "<extra>", description: "Extra monthly payment on top of minimums. Must be zero or greater." }
  ],
  examples: [
    "/debt_graph snowball 100",
    "/debt_graph avalanche 250"
  ],
  notes: [
    "Uses your current debts table.",
    "Graph runs until payoff or the simulation safety limit."
  ]
};
