// handlers/debt_compare_graph.js
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

module.exports = function registerDebtCompareGraphHandler(bot, deps) {
  const { db, format, debt } = deps;
  const { formatMoney } = format;
  const { getDebtRows, runDebtSimulation } = debt;

  function renderHelp() {
    return [
      "*\\/debt_compare_graph*",
      "Generate a comparison graph of snowball versus avalanche debt payoff using the same extra monthly payment.",
      "",
      "*Usage*",
      "- `/debt_compare_graph <extra>`",
      "",
      "*Arguments*",
      "- `<extra>` — Extra monthly payment on top of minimums. Must be zero or greater.",
      "",
      "*Examples*",
      "- `/debt_compare_graph 100`",
      "- `/debt_compare_graph 250.50`",
      "",
      "*Notes*",
      "- Uses your current debts table.",
      "- Graph compares remaining total debt over time for both strategies."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  function padSeries(series, length) {
    const out = Array.isArray(series) ? [...series] : [];
    while (out.length < length) out.push(0);
    return out;
  }

  bot.onText(/^\/debt_compare_graph(?:@\w+)?(?:\s+(.*))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (!raw || /^(help|--help|-h)$/i.test(raw)) {
      return sendHelp(chatId);
    }

    try {
      const extra = Number(raw);

      if (!Number.isFinite(extra) || extra < 0) {
        return bot.sendMessage(
          chatId,
          [
            "Extra payment must be zero or greater.",
            "",
            "Usage:",
            "`/debt_compare_graph <extra>`",
            "",
            "Example:",
            "`/debt_compare_graph 100`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const rows = getDebtRows(db);

      if (!rows.length) {
        return bot.sendMessage(chatId, "No debts recorded.");
      }

      const snowball = runDebtSimulation(rows, "snowball", extra);
      const avalanche = runDebtSimulation(rows, "avalanche", extra);

      if (
        snowball.months == null || snowball.interest == null || !Array.isArray(snowball.totals) ||
        avalanche.months == null || avalanche.interest == null || !Array.isArray(avalanche.totals)
      ) {
        return bot.sendMessage(chatId, "Simulation exceeded safe limit.");
      }

      const maxMonths = Math.max(snowball.months, avalanche.months);
      const labels = Array.from({ length: maxMonths + 1 }, (_, i) =>
        i === 0 ? "Start" : `M${i}`
      );

      const snowballSeries = padSeries(snowball.totals, labels.length);
      const avalancheSeries = padSeries(avalanche.totals, labels.length);

      const chartJSNodeCanvas = new ChartJSNodeCanvas({
        width: 1000,
        height: 600,
        backgroundColour: "#0f172a"
      });

      const configuration = {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Snowball",
              data: snowballSeries,
              borderWidth: 4,
              tension: 0.25,
              pointRadius: 2,
              fill: false,
              borderDash: [8, 6]
            },
            {
              label: "Avalanche",
              data: avalancheSeries,
              borderWidth: 4,
              tension: 0.25,
              pointRadius: 2,
              fill: false
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
        filename: "debt_compare_graph.png",
        contentType: "image/png"
      });

      const interestSaved = snowball.interest - avalanche.interest;

      let summary = "💳 Debt Compare Graph\n\n";
      summary += `Extra Payment: ${formatMoney(extra)} / month\n\n`;
      summary += `Snowball:  ${snowball.months} months, ${formatMoney(snowball.interest)} interest\n`;
      summary += `Avalanche: ${avalanche.months} months, ${formatMoney(avalanche.interest)} interest\n\n`;

      if (interestSaved > 0) {
        summary += `Avalanche saves ${formatMoney(interestSaved)} in interest.`;
      } else if (interestSaved < 0) {
        summary += `Snowball saves ${formatMoney(Math.abs(interestSaved))} in interest.`;
      } else {
        summary += "Both strategies cost the same in interest.";
      }

      return bot.sendMessage(chatId, summary);
    } catch (err) {
      console.error("debt_compare_graph error:", err);
      return bot.sendMessage(chatId, "Error generating debt compare graph.");
    }
  });
};

module.exports.help = {
  command: "debt_compare_graph",
  category: "Debt",
  summary: "Generate a comparison graph of snowball versus avalanche debt payoff using the same extra monthly payment.",
  usage: [
    "/debt_compare_graph <extra>"
  ],
  args: [
    { name: "<extra>", description: "Extra monthly payment on top of minimums. Must be zero or greater." }
  ],
  examples: [
    "/debt_compare_graph 100",
    "/debt_compare_graph 250.50"
  ],
  notes: [
    "Uses your current debts table.",
    "Graph compares remaining total debt over time for both strategies."
  ]
};
