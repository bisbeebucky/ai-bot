// handlers/milestones_graph.js
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

module.exports = function registerMilestonesGraphHandler(bot, deps) {
  const { db, ledgerService, finance, format } = deps;
  const { codeBlock } = format;
  const {
    futureMonthLabel,
    getStartingAssets,
    getRecurringMonthlyNet,
    getMonthlyExpenses,
    getDebtRows,
    simulateDebtPayoffMonths,
    simulateFIMonths,
    simulateNetWorthMilestoneMonths
  } = finance;

  function renderHelp() {
    return [
      "*\\/milestones_graph*",
      "Generate a milestone graph for debt payoff, FI, and net worth targets.",
      "",
      "*Usage*",
      "- `/milestones_graph`",
      "",
      "*Examples*",
      "- `/milestones_graph`",
      "",
      "*Notes*",
      "- Shows projected month counts for debt-free, FI, and net worth milestones.",
      "- Net worth targets currently include `10k`, `25k`, `50k`, and `100k`."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  function splitFutureLabel(text) {
    const raw = String(text || "").trim();
    const parts = raw.match(/^([A-Za-z]+)\s+(\d{4})$/);

    if (!parts) {
      return { month: raw, year: "" };
    }

    return {
      month: parts[1],
      year: parts[2]
    };
  }

  function formatSummaryRow(label, dateText, monthsValue) {
    const parts = splitFutureLabel(dateText);
    return [
      String(label).padEnd(12),
      String(parts.month).padEnd(10),
      String(parts.year).padEnd(4),
      `(${monthsValue}m)`.padStart(6)
    ].join(" ");
  }

  bot.onText(/^\/milestones_graph(?:@\w+)?(?:\s+(.*))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/milestones_graph` command does not take arguments.",
          "",
          "Usage:",
          "`/milestones_graph`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    try {
      const starting = getStartingAssets(ledgerService);
      const bankBalance = starting.bank;
      const recurring = getRecurringMonthlyNet(db);
      const monthlyExpenses = getMonthlyExpenses(db);
      const debtRows = getDebtRows(db);

      const debtMonths = simulateDebtPayoffMonths(
        debtRows,
        "avalanche",
        Math.max(0, recurring.net)
      );

      const annualExpenses = monthlyExpenses * 12;
      const fiTarget = annualExpenses > 0 ? annualExpenses * 25 : 0;
      const fiMonths = simulateFIMonths(
        bankBalance,
        Math.max(0, recurring.net),
        7,
        fiTarget
      );

      const targets = [10000, 25000, 50000, 100000];
      const milestoneMonths = simulateNetWorthMilestoneMonths(
        bankBalance,
        recurring.net,
        debtRows,
        targets
      );

      const labels = [];
      const values = [];
      const dateLabels = [];

      if (debtMonths != null) {
        labels.push("Debt Free");
        values.push(debtMonths);
        dateLabels.push(futureMonthLabel(debtMonths));
      }

      if (fiMonths != null) {
        labels.push("FI");
        values.push(fiMonths);
        dateLabels.push(futureMonthLabel(fiMonths));
      }

      for (const t of targets) {
        const months = milestoneMonths[t];
        if (months != null) {
          labels.push(`NW ${Math.round(t / 1000)}k`);
          values.push(months);
          dateLabels.push(futureMonthLabel(months));
        }
      }

      if (!labels.length) {
        return bot.sendMessage(chatId, "No milestone projections available.");
      }

      const chartJSNodeCanvas = new ChartJSNodeCanvas({
        width: 1000,
        height: 600,
        backgroundColour: "#0f172a"
      });

      const configuration = {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Months From Now",
              data: values,
              borderWidth: 2
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
                font: { size: 22 }
              }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.raw} month(s)`
              }
            }
          },
          scales: {
            x: {
              ticks: {
                color: "#ffffff",
                font: { size: 18 }
              },
              grid: {
                color: "rgba(255,255,255,0.08)"
              }
            },
            y: {
              beginAtZero: true,
              ticks: {
                color: "#ffffff",
                font: { size: 20 }
              },
              grid: {
                color: "rgba(255,255,255,0.08)"
              }
            }
          }
        }
      };

      const image = await chartJSNodeCanvas.renderToBuffer(configuration);

      await bot.sendPhoto(chatId, image, {
        filename: "milestones_graph.png",
        contentType: "image/png"
      });

      const summary = [
        "📍 Milestones Graph",
        "",
        codeBlock(
          labels.map((label, i) =>
            formatSummaryRow(label, dateLabels[i], values[i])
          ).join("\n")
        )
      ].join("\n");

      return bot.sendMessage(chatId, summary, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("milestones_graph error:", err);
      return bot.sendMessage(chatId, "Error generating milestones graph.");
    }
  });
};

module.exports.help = {
  command: "milestones_graph",
  category: "Forecasting",
  summary: "Generate a milestone graph for debt payoff, FI, and net worth targets.",
  usage: [
    "/milestones_graph"
  ],
  examples: [
    "/milestones_graph"
  ],
  notes: [
    "Shows projected month counts for debt-free, FI, and net worth milestones.",
    "Net worth targets currently include 10k, 25k, 50k, and 100k."
  ]
};
