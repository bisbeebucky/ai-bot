// handlers/milestones_graph.js
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

module.exports = function registerMilestonesGraphHandler(bot, deps) {
  const { db, ledgerService, finance } = deps;
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

  bot.onText(/^\/milestones_graph(@\w+)?$/i, async (msg) => {
    const chatId = msg.chat.id;

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

      let summary = "📍 Milestones Graph\n\n";
      for (let i = 0; i < labels.length; i++) {
        summary += `• ${labels[i]}: ${dateLabels[i]} (${values[i]}m)\n`;
      }

      return bot.sendMessage(chatId, summary);
    } catch (err) {
      console.error("milestones_graph error:", err);
      return bot.sendMessage(chatId, "Error generating milestones graph.");
    }
  });
};
