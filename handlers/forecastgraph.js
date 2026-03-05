// handlers/forecastgraph.js
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

module.exports = function registerForecastGraphHandler(bot, deps) {
  const { db, simulateCashflow } = deps;

  function money(n) {
    const x = Number(n) || 0;
    return "$" + x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function shorten(s, max = 14) {
    const t = String(s || "").trim();
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + "…";
  }

  bot.onText(/^\/forecastgraph(@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const checking = db.prepare(`
        SELECT id FROM accounts
        WHERE name = 'assets:bank'
      `).get();

      if (!checking) {
        return bot.sendMessage(chatId, "Checking account assets:bank not found.");
      }

      const row = db.prepare(`
        SELECT IFNULL(SUM(amount), 0) as balance
        FROM postings
        WHERE account_id = ?
      `).get(checking.id);

      const currentBalance = Number(row?.balance) || 0;

      const result = simulateCashflow(db, currentBalance, checking.id, 30);

      const labels = ["Today"];
      const balances = [currentBalance];

      // Build a map of date -> labelText from simulation timeline
      // (timeline items are recurring occurrences)
      const eventLabelByDate = new Map();
      if (result?.timeline?.length) {
        for (const evt of result.timeline) {
          labels.push(evt.date);
          balances.push(Number(evt.balance) || 0);

          // Only keep the first event label per date (avoid stacking)
          if (!eventLabelByDate.has(evt.date)) {
            eventLabelByDate.set(evt.date, shorten(evt.description, 16));
          }
        }
      }

      const minBalance = Math.min(...balances);
      const hasNegative = minBalance < 0;

      // First negative date
      let firstNegativeDate = null;
      for (let i = 0; i < balances.length; i++) {
        if (balances[i] < 0) {
          firstNegativeDate = labels[i];
          break;
        }
      }

      // Upcoming recurring (next 5)
      const upcoming = db.prepare(`
        SELECT id, hash, description, postings_json, frequency, next_due_date
        FROM recurring_transactions
        ORDER BY date(next_due_date) ASC
        LIMIT 5
      `).all();

      const upcomingLines = [];
      for (const r of upcoming) {
        let amt = 0;
        try {
          const postings = JSON.parse(r.postings_json);
          const bankLine = Array.isArray(postings)
            ? postings.find(p => p.account === "assets:bank")
            : null;
          if (bankLine) amt = Math.abs(Number(bankLine.amount) || 0);
        } catch {}

        const shortHash = String(r.hash || "").slice(0, 6);
        upcomingLines.push(
          `• ${r.next_due_date}  ${r.description}  ${money(amt)}  (${r.frequency})  #${r.id} ${shortHash}`
        );
      }

      // Pick up to 6 dates to label on chart
      const labelDates = [];
      for (const d of labels) {
        if (eventLabelByDate.has(d)) labelDates.push(d);
        if (labelDates.length >= 6) break;
      }

      // Custom Chart.js plugin to draw labels on canvas
      const eventLabelPlugin = {
        id: "eventLabelPlugin",
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          const meta = chart.getDatasetMeta(0); // our main line dataset
          if (!meta || !meta.data) return;

          ctx.save();
          ctx.font = "18px sans-serif";
          ctx.fillStyle = "#ffffff";

          // draw labels slightly above points
          for (let i = 0; i < labels.length; i++) {
            const date = labels[i];
            if (!labelDates.includes(date)) continue;

            const point = meta.data[i];
            if (!point) continue;

            const text = eventLabelByDate.get(date);
            if (!text) continue;

            const x = point.x;
            const y = point.y;

            // small shadow so white text is readable
            ctx.shadowColor = "rgba(0,0,0,0.6)";
            ctx.shadowBlur = 6;

            // offset label
            ctx.fillText(text, x + 8, y - 10);

            ctx.shadowBlur = 0;
          }

          ctx.restore();
        }
      };

      // --- Chart render (keep your nice styling) ---
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
              label: "Projected Balance",
              data: balances,
              borderWidth: 4,
              tension: 0.25,
              pointRadius: 4,
              fill: true,
              borderColor: hasNegative ? "#ef4444" : "#22c55e",
              backgroundColor: hasNegative
                ? "rgba(239, 68, 68, 0.15)"
                : "rgba(34, 197, 94, 0.2)"
            }
          ]
        },
        plugins: [eventLabelPlugin],
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
              ticks: { color: "#ffffff", font: { size: 20 }, maxTicksLimit: 8 },
              grid: { color: "rgba(255,255,255,0.08)" }
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
        filename: "forecast.png",
        contentType: "image/png"
      });

      // --- Summary message ---
      let summary = "";
      summary += `Current Balance: ${money(currentBalance)}\n`;
      summary += `Projected 30-Day Minimum: ${money(minBalance)}\n`;
      if (firstNegativeDate) summary += `First negative date: ${firstNegativeDate}\n`;
      summary += `\n`;
      summary += hasNegative
        ? "⚠️ Overdraft risk detected in the next 30 days."
        : "✅ No overdraft risk in the next 30 days.";

      if (upcomingLines.length) {
        summary += `\n\n📌 Upcoming recurring (next ${Math.min(upcomingLines.length, 5)}):\n`;
        summary += upcomingLines.join("\n");
      }

      return bot.sendMessage(chatId, summary);
    } catch (err) {
      console.error("Forecast graph error:", err);
      return bot.sendMessage(chatId, "Error generating forecast graph.");
    }
  });
};
