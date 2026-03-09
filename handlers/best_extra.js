// handlers/best_extra.js
module.exports = function registerBestExtraHandler(bot, deps) {
  const { db, format, debt } = deps;
  const { formatMoney, codeBlock } = format;
  const { getDebtRows, runDebtSimulation } = debt;

  function renderHelp() {
    return [
      "*\\/best_extra*",
      "Find the most effective extra payment.",
      "",
      "*Usage*",
      "- `/best_extra`",
      "- `/best_extra <start> <end> <step>`",
      "",
      "*Arguments*",
      "- `<start>` — Starting extra payment. Defaults to `100`.",
      "- `<end>` — Ending extra payment. Defaults to `500`.",
      "- `<step>` — Step size. Defaults to `100`.",
      "",
      "*Examples*",
      "- `/best_extra`",
      "- `/best_extra 100 500 100`"
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/best_extra(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (/^(help|--help|-h)$/i.test(raw)) {
      return sendHelp(chatId);
    }

    try {
      let start = 100;
      let end = 500;
      let step = 100;

      if (raw) {
        const parsed = raw.match(
          /^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/
        );

        if (!parsed) {
          return bot.sendMessage(
            chatId,
            [
              "Usage: `/best_extra [start end step]`",
              "Example: `/best_extra 100 500 100`"
            ].join("\n"),
            { parse_mode: "Markdown" }
          );
        }

        start = Number(parsed[1]);
        end = Number(parsed[2]);
        step = Number(parsed[3]);
      }

      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        !Number.isFinite(step) ||
        start < 0 ||
        end < start ||
        step <= 0
      ) {
        return bot.sendMessage(
          chatId,
          [
            "Usage: `/best_extra [start end step]`",
            "Example: `/best_extra 100 500 100`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const rows = getDebtRows(db);

      if (!rows.length) {
        return bot.sendMessage(chatId, "No debts recorded.");
      }

      const points = [];

      for (let extra = start; extra <= end + 0.0001; extra += step) {
        const normalizedExtra = Number(extra.toFixed(10));

        const snow = runDebtSimulation(rows, "snowball", normalizedExtra);
        const ava = runDebtSimulation(rows, "avalanche", normalizedExtra);

        if (
          snow.months == null || snow.interest == null ||
          ava.months == null || ava.interest == null
        ) {
          continue;
        }

        points.push({
          extra: normalizedExtra,
          snowMonths: snow.months,
          snowInterest: snow.interest,
          avaMonths: ava.months,
          avaInterest: ava.interest,
          avgMonths: (snow.months + ava.months) / 2,
          avgInterest: (snow.interest + ava.interest) / 2
        });
      }

      if (points.length < 2) {
        return bot.sendMessage(
          chatId,
          "Need at least two valid extra-payment points to compare."
        );
      }

      let bestTimeJump = null;
      let bestInterestJump = null;

      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];

        const extraDelta = curr.extra - prev.extra;
        const monthsSaved = prev.avgMonths - curr.avgMonths;
        const interestSaved = prev.avgInterest - curr.avgInterest;
        const monthsPerDollar = extraDelta > 0 ? monthsSaved / extraDelta : 0;
        const interestPerDollar = extraDelta > 0 ? interestSaved / extraDelta : 0;

        const jump = {
          from: prev.extra,
          to: curr.extra,
          extraDelta,
          monthsSaved,
          interestSaved,
          monthsPerDollar,
          interestPerDollar
        };

        if (!bestTimeJump || jump.monthsSaved > bestTimeJump.monthsSaved) {
          bestTimeJump = jump;
        }

        if (
          !bestInterestJump ||
          jump.interestPerDollar > bestInterestJump.interestPerDollar
        ) {
          bestInterestJump = jump;
        }
      }

      let diminishingAt = null;
      if (bestTimeJump && bestTimeJump.monthsSaved > 0) {
        const threshold = bestTimeJump.monthsSaved * 0.5;

        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1];
          const curr = points[i];
          const monthsSaved = prev.avgMonths - curr.avgMonths;

          if (monthsSaved < threshold) {
            diminishingAt = curr.extra;
            break;
          }
        }
      }

      const out = [
        "🎯 *Best Extra Payment*",
        "",
        codeBlock([
          `Range               ${formatMoney(start)} → ${formatMoney(end)} step ${formatMoney(step)}`,
          ...(bestTimeJump ? [
            `Best Time Jump      ${formatMoney(bestTimeJump.from)} → ${formatMoney(bestTimeJump.to)}`,
            `Months Saved        ${bestTimeJump.monthsSaved.toFixed(1)}`
          ] : []),
          ...(bestInterestJump ? [
            `Best Interest Value ${formatMoney(bestInterestJump.from)} → ${formatMoney(bestInterestJump.to)}`,
            `Interest Saved      ${formatMoney(bestInterestJump.interestSaved)}`,
            `Interest/$100 Extra ${formatMoney(bestInterestJump.interestPerDollar * 100)}`
          ] : []),
          `Diminishing Returns ${diminishingAt != null ? `around ${formatMoney(diminishingAt)} extra` : "not reached in tested range"}`
        ].join("\n"))
      ];

      let summary = "";
      if (bestTimeJump) {
        summary += `Biggest payoff-time improvement is from ${formatMoney(bestTimeJump.from)} to ${formatMoney(bestTimeJump.to)}. `;
      }
      if (diminishingAt != null) {
        summary += `Returns start flattening around ${formatMoney(diminishingAt)} extra.`;
      }

      if (summary) {
        out.push(summary.trim());
      }

      return bot.sendMessage(chatId, out.join("\n"), {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("best_extra error:", err);
      return bot.sendMessage(chatId, "Error analyzing best extra payment.");
    }
  });
};

module.exports.help = {
  command: "best_extra",
  category: "Debt",
  summary: "Find the most effective extra payment.",
  usage: [
    "/best_extra",
    "/best_extra <start> <end> <step>"
  ],
  args: [
    { name: "<start>", description: "Starting extra payment. Defaults to 100." },
    { name: "<end>", description: "Ending extra payment. Defaults to 500." },
    { name: "<step>", description: "Step size. Defaults to 100." }
  ],
  examples: [
    "/best_extra",
    "/best_extra 100 500 100"
  ]
};
