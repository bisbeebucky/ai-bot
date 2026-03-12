// handlers/dashboard_graph.js
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

module.exports = function registerDashboardGraphHandler(bot, deps) {
  const { db, ledgerService, format, finance } = deps;
  const { formatMoney, codeBlock } = format;
  const { getDebtRows, getStartingAssets, getRecurringMonthlyNet } = finance;

  function renderHelp() {
    return [
      "*\\/dashboard_graph*",
      "Visual dashboard of bank, debt and net worth.",
      "",
      "*Usage*",
      "- `/dashboard_graph`",
      "- `/dashboard_graph <months>`",
      "",
      "*Arguments*",
      "- `<months>` — Optional horizon from `1` to `120`. Defaults to `30`.",
      "",
      "*Examples*",
      "- `/dashboard_graph`",
      "- `/dashboard_graph 60`"
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  function formatSummaryRow(label, value, width = 18) {
    return `${String(label).padEnd(width)} ${value}`;
  }

  bot.onText(/^\/dashboard_graph(?:@\w+)?(?:\s+(.*))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (/^(help|--help|-h)$/i.test(raw)) {
      return sendHelp(chatId);
    }

    try {
      const months = raw ? Number(raw) : 30;

      if (!Number.isInteger(months) || months < 1 || months > 120) {
        return bot.sendMessage(
          chatId,
          [
            "Usage: `/dashboard_graph [months]`",
            "Example: `/dashboard_graph 60`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const starting = getStartingAssets(ledgerService);
      const recurring = getRecurringMonthlyNet(db);
      const debtRows = getDebtRows(db);

      const bankNow = starting.bank;
      const savingsNow = starting.savings;
      const totalAssetsNow = starting.total;
      const debtNow = debtRows.reduce((sum, d) => sum + d.balance, 0);
      const netWorthNow = totalAssetsNow - debtNow;

      const labels = Array.from({ length: months + 1 }, (_, i) => (i === 0 ? "Now" : `M${i}`));
      const assetSeries = [];
      const debtSeries = [];
      const netWorthSeries = [];

      for (let i = 0; i <= months; i += 1) {
        const assets = totalAssetsNow + recurring.net * i;
        const debt = Math.max(0, debtNow - Math.max(0, recurring.net) * i);
        const networth = assets - debt;

        assetSeries.push(assets);
        debtSeries.push(debt);
        netWorthSeries.push(networth);
      }

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
              label: "Assets",
              data: assetSeries,
              borderWidth: 4,
              tension: 0.25,
              pointRadius: 2,
              fill: false
            },
            {
              label: "Debt",
              data: debtSeries,
              borderWidth: 4,
              tension: 0.25,
              pointRadius: 2,
              fill: false,
              borderDash: [8, 6]
            },
            {
              label: "Net Worth",
              data: netWorthSeries,
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
        filename: "dashboard_graph.png",
        contentType: "image/png"
      });

      const summary = [
        "📊 Dashboard Graph",
        "",
        codeBlock([
          formatSummaryRow("Months", String(months)),
          "",
          formatSummaryRow("Bank Now", formatMoney(bankNow)),
          formatSummaryRow("Savings Now", formatMoney(savingsNow)),
          formatSummaryRow("Assets Now", formatMoney(totalAssetsNow)),
          formatSummaryRow("Debt Now", formatMoney(debtNow)),
          formatSummaryRow("Net Worth Now", formatMoney(netWorthNow))
        ].join("\n"))
      ].join("\n");

      return bot.sendMessage(chatId, summary, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("dashboard_graph error:", err);
      return bot.sendMessage(chatId, "Error generating dashboard graph.");
    }
  });
};

module.exports.help = {
  command: "dashboard_graph",
  category: "General",
  summary: "Visual dashboard of bank, debt and net worth.",
  usage: [
    "/dashboard_graph",
    "/dashboard_graph <months>"
  ],
  args: [
    { name: "<months>", description: "Optional horizon from 1 to 120. Defaults to 30." }
  ],
  examples: [
    "/dashboard_graph",
    "/dashboard_graph 60"
  ]
};
