// handlers/future_graph.js
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

module.exports = function registerFutureGraphHandler(bot, deps) {
  const { ledgerService, format, finance, debtProjection } = deps;
  const { formatMoney, codeBlock } = format;
  const {
    futureMonthLabel,
    getStartingAssets,
    getRecurringMonthlyNet,
    getMonthlyExpenses,
    getDebtRows,
    simulateFIMonths
  } = finance;
  const { simulateDebtSeries } = debtProjection;

  function monthLabels(monthsToShow = 12) {
    const labels = [];
    const d = new Date();
    d.setDate(1);

    for (let i = 0; i <= monthsToShow; i++) {
      const x = new Date(d.getFullYear(), d.getMonth() + i, 1);
      labels.push(
        x.toLocaleString("en-US", {
          month: "short",
          year: i === 0 ? undefined : "2-digit"
        })
      );
    }

    return labels;
  }

  function renderHelp() {
    return [
      "*\\/future_graph*",
      "Generate a forward-looking graph of cash, debt, and net worth over the next few months.",
      "",
      "*Usage*",
      "- `/future_graph`",
      "- `/future_graph <months>`",
      "",
      "*Arguments*",
      "- `<months>` — Optional horizon from `1` to `60`. Defaults to `12`.",
      "",
      "*Examples*",
      "- `/future_graph`",
      "- `/future_graph 24`",
      "",
      "*Notes*",
      "- Starting assets include `assets:bank` and `assets:savings`.",
      "- Alias command: `/life_projection_graph`."
    ].join("\n");
  }

  function formatSummaryRow(label, value, width = 20) {
    return `${String(label).padEnd(width)} ${value}`;
  }

  bot.onText(/^\/(future_graph|life_projection_graph)(?:@\w+)?(?:\s+(.*))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[2] || "").trim();

    if (/^(help|--help|-h)$/i.test(raw)) {
      return bot.sendMessage(chatId, renderHelp(), { parse_mode: "Markdown" });
    }

    try {
      const horizon = raw ? Number(raw) : 12;

      if (!Number.isInteger(horizon) || horizon < 1 || horizon > 60) {
        return bot.sendMessage(
          chatId,
          [
            "Usage: `/future_graph [months]`",
            "Example: `/future_graph 24`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const starting = getStartingAssets(ledgerService);
      const startingAssets = starting.total;
      const recurring = getRecurringMonthlyNet(deps.db);
      const debtRows = getDebtRows(deps.db);
      const monthlyExpenses = getMonthlyExpenses(deps.db);

      const labels = monthLabels(horizon);

      const cashSeries = [startingAssets];
      for (let i = 1; i <= horizon; i++) {
        cashSeries.push(startingAssets + recurring.net * i);
      }

      const debtExtra = Math.max(0, recurring.net);
      const debtResult = simulateDebtSeries(debtRows, "avalanche", debtExtra, horizon);
      const debtSeries = debtResult.series;

      const netWorthSeries = cashSeries.map((cash, i) => {
        const debtAtPoint = Number(debtSeries[i]) || 0;
        return cash - debtAtPoint;
      });

      const debtFreeMarker = debtSeries.map(() => null);
      if (
        typeof debtResult.payoffMonths === "number" &&
        debtResult.payoffMonths >= 0 &&
        debtResult.payoffMonths < debtSeries.length
      ) {
        debtFreeMarker[debtResult.payoffMonths] = debtSeries[debtResult.payoffMonths];
      }

      const annualExpenses = monthlyExpenses * 12;
      const fiTarget = annualExpenses > 0 ? annualExpenses * 25 : 0;
      const fiMonths = simulateFIMonths(
        startingAssets,
        Math.max(0, recurring.net),
        7,
        fiTarget
      );

      const fiMarker = netWorthSeries.map(() => null);
      if (
        typeof fiMonths === "number" &&
        fiMonths >= 0 &&
        fiMonths < netWorthSeries.length
      ) {
        fiMarker[fiMonths] = netWorthSeries[fiMonths];
      }

      const minY = Math.min(...cashSeries, ...debtSeries, ...netWorthSeries);
      const maxY = Math.max(...cashSeries, ...debtSeries, ...netWorthSeries);

      let pad = (maxY - minY) * 0.12;
      if (!Number.isFinite(pad) || pad === 0) {
        pad = Math.max(50, Math.abs(maxY) * 0.05, Math.abs(minY) * 0.05);
      }

      const chartJSNodeCanvas = new ChartJSNodeCanvas({
        width: 1000,
        height: 600,
        backgroundColour: "#0f172a"
      });

      const maxTicks =
        horizon <= 12 ? horizon + 1 :
          horizon <= 24 ? 13 :
            10;

      const configuration = {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Assets Projection",
              data: cashSeries,
              borderWidth: 4,
              tension: 0.25,
              pointRadius: 3,
              fill: false
            },
            {
              label: "Debt Projection",
              data: debtSeries,
              borderWidth: 4,
              tension: 0.25,
              pointRadius: 3,
              fill: false,
              borderDash: [8, 6]
            },
            {
              label: "Net Worth Projection",
              data: netWorthSeries,
              borderWidth: 4,
              tension: 0.25,
              pointRadius: 3,
              fill: false,
              borderDash: [2, 4]
            },
            {
              label: "Debt-Free Point",
              data: debtFreeMarker,
              showLine: false,
              pointRadius: 8,
              pointHoverRadius: 10,
              pointBorderWidth: 2
            },
            {
              label: "FI Point",
              data: fiMarker,
              showLine: false,
              pointRadius: 8,
              pointHoverRadius: 10,
              pointBorderWidth: 2
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
                maxTicksLimit: maxTicks
              },
              grid: {
                color: "rgba(255,255,255,0.08)"
              }
            },
            y: {
              suggestedMin: minY - pad,
              suggestedMax: maxY + pad,
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
        filename: "future_graph.png",
        contentType: "image/png"
      });

      let debtPayoffText;
      if (debtRows.length === 0) {
        debtPayoffText = "Already debt-free";
      } else if (debtResult.payoffMonths == null) {
        debtPayoffText = `Debt not paid off within ${horizon} months`;
      } else {
        debtPayoffText = `Debt-free by ${futureMonthLabel(debtResult.payoffMonths)}`;
      }

      let fiText;
      if (fiTarget <= 0 || fiMonths == null) {
        fiText = "FI not available";
      } else if (fiMonths > horizon) {
        fiText = `FI beyond ${horizon} months`;
      } else {
        fiText = `FI by ${futureMonthLabel(fiMonths)}`;
      }

      const finalNetWorth = netWorthSeries[netWorthSeries.length - 1];

      const summary = [
        "🔮 Financial Future",
        "",
        codeBlock([
          formatSummaryRow("Horizon", `${horizon} month(s)`),
          formatSummaryRow("Bank Now", formatMoney(starting.bank)),
          formatSummaryRow("Savings Now", formatMoney(starting.savings)),
          formatSummaryRow("Assets Now", formatMoney(startingAssets)),
          formatSummaryRow(
            "Recurring Net",
            `${recurring.net >= 0 ? "+" : "-"}${formatMoney(Math.abs(recurring.net))} / month`
          ),
          formatSummaryRow(`${horizon}-Month Assets`, formatMoney(cashSeries[cashSeries.length - 1])),
          formatSummaryRow(`${horizon}-Month Net Worth`, formatMoney(finalNetWorth)),
          formatSummaryRow("Debt Status", debtPayoffText),
          formatSummaryRow("FI Status", fiText)
        ].join("\n"))
      ].join("\n");

      return bot.sendMessage(chatId, summary, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("future_graph error:", err);
      return bot.sendMessage(chatId, "Error generating future graph.");
    }
  });
};

module.exports.help = {
  command: "future_graph",
  aliases: ["life_projection_graph"],
  category: "Forecasting",
  summary: "Generate a forward-looking graph of assets, debt, and net worth over the next few months.",
  usage: [
    "/future_graph",
    "/future_graph <months>",
    "/life_projection_graph",
    "/life_projection_graph <months>"
  ],
  args: [
    { name: "<months>", description: "Optional horizon from 1 to 60. Defaults to 12." }
  ],
  examples: [
    "/future_graph",
    "/future_graph 24",
    "/life_projection_graph 18"
  ],
  notes: [
    "Starting assets include `assets:bank` and `assets:savings`."
  ]
};
