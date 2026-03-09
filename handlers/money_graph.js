// handlers/money_graph.js
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

module.exports = function registerMoneyGraphHandler(bot, deps) {
  const { db, format, finance } = deps;
  const { formatMoney } = format;
  const {
    getStartingAssets,
    getRecurringMonthlyNet,
    getDebtRows
  } = finance;

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

  function simulateDebtSeries(rows, extra, monthsToShow = 12) {
    const debts = rows.map((r) => ({ ...r }));

    function sortDebts(arr) {
      arr.sort((a, b) => {
        const aprDiff = b.apr - a.apr;
        if (aprDiff !== 0) return aprDiff;
        return a.balance - b.balance;
      });
    }

    function activeDebts() {
      return debts.filter((d) => d.balance > 0.005);
    }

    const totalMinimums = debts.reduce((sum, d) => sum + d.minimum, 0);
    const monthlyBudget = totalMinimums + extra;

    const series = [debts.reduce((sum, d) => sum + d.balance, 0)];

    if (debts.length === 0 || monthlyBudget <= 0) {
      while (series.length < monthsToShow + 1) series.push(0);
      return { series, payoffMonths: debts.length === 0 ? 0 : null };
    }

    let months = 0;
    let payoffMonths = null;

    while (months < monthsToShow) {
      months += 1;

      if (activeDebts().length > 0) {
        for (const d of debts) {
          if (d.balance <= 0.005) continue;
          const monthlyRate = d.apr / 100 / 12;
          d.balance += d.balance * monthlyRate;
        }

        const remaining = activeDebts();
        sortDebts(remaining);

        let paymentPool = monthlyBudget;

        for (const d of remaining) {
          if (paymentPool <= 0) break;
          const minPay = Math.min(d.minimum, d.balance, paymentPool);
          d.balance -= minPay;
          paymentPool -= minPay;
        }

        let targets = activeDebts();
        sortDebts(targets);

        while (paymentPool > 0 && targets.length > 0) {
          const target = targets[0];
          const pay = Math.min(target.balance, paymentPool);
          target.balance -= pay;
          paymentPool -= pay;

          targets = activeDebts();
          sortDebts(targets);
        }

        for (const d of debts) {
          if (d.balance < 0.005) d.balance = 0;
        }

        if (activeDebts().length === 0 && payoffMonths === null) {
          payoffMonths = months;
        }
      }

      series.push(debts.reduce((sum, d) => sum + d.balance, 0));
    }

    return { series, payoffMonths };
  }

  function renderHelp() {
    return [
      "*\\/money_graph*",
      "Generate a graph of projected assets, debt, and net worth over the next few months.",
      "",
      "*Usage*",
      "- `/money_graph`",
      "- `/money_graph <months>`",
      "",
      "*Arguments*",
      "- `<months>` — Optional horizon from `1` to `60`. Defaults to `12`.",
      "",
      "*Examples*",
      "- `/money_graph`",
      "- `/money_graph 24`",
      "",
      "*Notes*",
      "- Starting assets include `assets:bank` and `assets:savings`.",
      "- Debt payoff uses avalanche logic with positive recurring surplus as extra payment."
    ].join("\n");
  }

  bot.onText(/^\/money_graph(?:@\w+)?(?:\s+(.*))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (/^(help|--help|-h)$/i.test(raw)) {
      return bot.sendMessage(chatId, renderHelp(), {
        parse_mode: "Markdown"
      });
    }

    try {
      const horizon = raw ? Number(raw) : 12;

      if (!Number.isInteger(horizon) || horizon < 1 || horizon > 60) {
        return bot.sendMessage(
          chatId,
          [
            "Usage: `/money_graph [months]`",
            "Example: `/money_graph 24`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const starting = getStartingAssets(deps.ledgerService);
      const assetsNow = starting.total;
      const recurring = getRecurringMonthlyNet(db);
      const recurringNet = recurring.net;
      const debtRows = getDebtRows(db);

      const labels = monthLabels(horizon);

      const assetSeries = [assetsNow];
      for (let i = 1; i <= horizon; i++) {
        assetSeries.push(assetsNow + recurringNet * i);
      }

      const debtExtra = Math.max(0, recurringNet);
      const debtResult = simulateDebtSeries(debtRows, debtExtra, horizon);
      const debtSeries = debtResult.series;

      const netWorthSeries = assetSeries.map(
        (assets, i) => assets - (Number(debtSeries[i]) || 0)
      );

      const minY = Math.min(...assetSeries, ...debtSeries, ...netWorthSeries);
      const maxY = Math.max(...assetSeries, ...debtSeries, ...netWorthSeries);

      let pad = (maxY - minY) * 0.12;
      if (!Number.isFinite(pad) || pad === 0) {
        pad = Math.max(50, Math.abs(maxY) * 0.05, Math.abs(minY) * 0.05);
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
              pointRadius: 3,
              fill: false,
              borderDash: [8, 6]
            },
            {
              label: "Debt",
              data: debtSeries,
              borderWidth: 4,
              tension: 0.25,
              pointRadius: 3,
              fill: false,
              borderDash: [8, 6]
            },
            {
              label: "Net Worth",
              data: netWorthSeries,
              borderWidth: 4,
              tension: 0.25,
              pointRadius: 3,
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
                maxTicksLimit: horizon <= 12 ? horizon + 1 : 10
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
        filename: "money_graph.png",
        contentType: "image/png"
      });

      const debtNow = debtSeries[0];
      const netWorthNow = netWorthSeries[0];
      const assetEnd = assetSeries[assetSeries.length - 1];
      const debtEnd = debtSeries[debtSeries.length - 1];
      const netWorthEnd = netWorthSeries[netWorthSeries.length - 1];

      const summary = [
        "💰 Money Graph",
        "",
        `Now → Bank ${formatMoney(starting.bank)}, Savings ${formatMoney(starting.savings)}, Assets ${formatMoney(assetsNow)}, Debt ${formatMoney(debtNow)}, Net Worth ${formatMoney(netWorthNow)}`,
        `${horizon}m → Assets ${formatMoney(assetEnd)}, Debt ${formatMoney(debtEnd)}, Net Worth ${formatMoney(netWorthEnd)}`
      ].join("\n");

      return bot.sendMessage(chatId, summary);
    } catch (err) {
      console.error("money_graph error:", err);
      return bot.sendMessage(chatId, "Error generating money graph.");
    }
  });
};

module.exports.help = {
  command: "money_graph",
  category: "Forecasting",
  summary: "Generate a graph of projected assets, debt, and net worth over the next few months.",
  usage: [
    "/money_graph",
    "/money_graph <months>"
  ],
  args: [
    { name: "<months>", description: "Optional horizon from 1 to 60. Defaults to 12." }
  ],
  examples: [
    "/money_graph",
    "/money_graph 24"
  ],
  notes: [
    "Starting assets include `assets:bank` and `assets:savings`.",
    "Debt payoff uses avalanche logic with positive recurring surplus as extra payment."
  ]
};
