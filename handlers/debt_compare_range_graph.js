// handlers/debt_compare_range_graph.js
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

module.exports = function registerDebtCompareRangeGraphHandler(bot, deps) {
  const { db, format } = deps;
  const { formatMoney } = format;

  function cloneDebts(rows) {
    return rows.map((r) => ({
      name: String(r.name || ""),
      balance: Number(r.balance) || 0,
      apr: Number(r.apr) || 0,
      minimum: Number(r.minimum) || 0
    }));
  }

  function sortDebts(debts, mode) {
    if (mode === "snowball") {
      debts.sort((a, b) => {
        const balDiff = a.balance - b.balance;
        if (balDiff !== 0) return balDiff;
        return b.apr - a.apr;
      });
    } else {
      debts.sort((a, b) => {
        const aprDiff = b.apr - a.apr;
        if (aprDiff !== 0) return aprDiff;
        return a.balance - b.balance;
      });
    }
  }

  function activeDebts(debts) {
    return debts.filter((d) => d.balance > 0.005);
  }

  function runSimulation(rows, mode, extra) {
    const debts = cloneDebts(rows);
    const totalMinimums = debts.reduce((sum, d) => sum + d.minimum, 0);
    const monthlyBudget = totalMinimums + extra;

    if (monthlyBudget <= 0) {
      return { months: null, interest: null };
    }

    let months = 0;
    let totalInterest = 0;

    while (activeDebts(debts).length > 0 && months < 1200) {
      months += 1;

      for (const d of debts) {
        if (d.balance <= 0.005) continue;
        const monthlyRate = d.apr / 100 / 12;
        const interest = d.balance * monthlyRate;
        d.balance += interest;
        totalInterest += interest;
      }

      const remaining = activeDebts(debts);
      sortDebts(remaining, mode);

      let paymentPool = monthlyBudget;

      for (const d of remaining) {
        if (paymentPool <= 0) break;
        const minPay = Math.min(d.minimum, d.balance, paymentPool);
        d.balance -= minPay;
        paymentPool -= minPay;
      }

      let targets = activeDebts(debts);
      sortDebts(targets, mode);

      while (paymentPool > 0 && targets.length > 0) {
        const target = targets[0];
        const pay = Math.min(target.balance, paymentPool);
        target.balance -= pay;
        paymentPool -= pay;

        targets = activeDebts(debts);
        sortDebts(targets, mode);
      }

      for (const d of debts) {
        if (d.balance < 0.005) d.balance = 0;
      }
    }

    if (months >= 1200) {
      return { months: null, interest: null };
    }

    return { months, interest: totalInterest };
  }

  function renderHelp() {
    return [
      "*\\/debt_compare_range_graph*",
      "Compare snowball vs avalanche across payment ranges.",
      "",
      "*Usage*",
      "- `/debt_compare_range_graph <start> <end> <step>`",
      "",
      "*Examples*",
      "- `/debt_compare_range_graph 100 500 100`"
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/debt_compare_range_graph(?:@\w+)?(?:\s+(.*))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (/^(help|--help|-h)$/i.test(raw)) {
      return sendHelp(chatId);
    }

    try {
      const parsed = raw.match(/^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/);

      if (!parsed) {
        return bot.sendMessage(
          chatId,
          [
            "Usage: `/debt_compare_range_graph <start> <end> <step>`",
            "Example: `/debt_compare_range_graph 100 500 100`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const start = Number(parsed[1]);
      const end = Number(parsed[2]);
      const step = Number(parsed[3]);

      if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(step) ||
        start < 0 || end < start || step <= 0) {
        return bot.sendMessage(
          chatId,
          [
            "Usage: `/debt_compare_range_graph <start> <end> <step>`",
            "Example: `/debt_compare_range_graph 100 500 100`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const rows = db.prepare(`
        SELECT name, balance, apr, minimum
        FROM debts
      `).all();

      if (!rows.length) {
        return bot.sendMessage(chatId, "No debts recorded.");
      }

      const labels = [];
      const snowballInterest = [];
      const avalancheInterest = [];

      for (let extra = start; extra <= end + 0.0000001; extra += step) {
        const normalizedExtra = Number(extra.toFixed(10));
        const snow = runSimulation(rows, "snowball", normalizedExtra);
        const ava = runSimulation(rows, "avalanche", normalizedExtra);

        labels.push(`$${normalizedExtra.toFixed(0)}`);
        snowballInterest.push(snow.interest == null ? null : snow.interest);
        avalancheInterest.push(ava.interest == null ? null : ava.interest);
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
              label: "Snowball Interest",
              data: snowballInterest,
              borderWidth: 4,
              tension: 0.25,
              pointRadius: 3,
              fill: false,
              borderDash: [8, 6]
            },
            {
              label: "Avalanche Interest",
              data: avalancheInterest,
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
        filename: "debt_compare_range_graph.png",
        contentType: "image/png"
      });

      return bot.sendMessage(
        chatId,
        [
          "💳 Debt Compare Range Graph",
          "",
          `Range: ${formatMoney(start)} to ${formatMoney(end)} by ${formatMoney(step)}`
        ].join("\n")
      );
    } catch (err) {
      console.error("debt_compare_range_graph error:", err);
      return bot.sendMessage(chatId, "Error generating debt compare range graph.");
    }
  });
};

module.exports.help = {
  command: "debt_compare_range_graph",
  category: "Debt",
  summary: "Compare snowball vs avalanche across payment ranges.",
  usage: [
    "/debt_compare_range_graph <start> <end> <step>"
  ],
  args: [
    { name: "<start>", description: "Starting extra payment." },
    { name: "<end>", description: "Ending extra payment." },
    { name: "<step>", description: "Step size." }
  ],
  examples: [
    "/debt_compare_range_graph 100 500 100"
  ]
};
