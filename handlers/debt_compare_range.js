// handlers/debt_compare_range.js
module.exports = function registerDebtCompareRangeHandler(bot, deps) {
  const { db, format, debt } = deps;
  const { renderTable } = format;
  const { getDebtRows, runDebtSimulation } = debt;

  function renderHelp() {
    return [
      "*\\/debt_compare_range*",
      "Compare snowball and avalanche strategies across a range of extra monthly payment amounts.",
      "",
      "*Usage*",
      "- `/debt_compare_range <start> <end> <step>`",
      "",
      "*Arguments*",
      "- `<start>` — Starting extra monthly payment. Must be zero or greater.",
      "- `<end>` — Ending extra monthly payment. Must be greater than or equal to start.",
      "- `<step>` — Step size between values. Must be greater than 0.",
      "",
      "*Examples*",
      "- `/debt_compare_range 100 500 100`",
      "- `/debt_compare_range 50 300 50`",
      "",
      "*Notes*",
      "- Shows payoff time and total interest for each strategy at each extra-payment level.",
      "- Uses your current debts table."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/debt_compare_range(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (!raw || /^(help|--help|-h)$/i.test(raw)) {
      return sendHelp(chatId);
    }

    try {
      const parsed = raw.match(
        /^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/
      );

      if (!parsed) {
        return bot.sendMessage(
          chatId,
          [
            "Missing or invalid arguments for `/debt_compare_range`.",
            "",
            "Usage:",
            "`/debt_compare_range <start> <end> <step>`",
            "",
            "Example:",
            "`/debt_compare_range 100 500 100`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const start = Number(parsed[1]);
      const end = Number(parsed[2]);
      const step = Number(parsed[3]);

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
            "Arguments must satisfy: start >= 0, end >= start, step > 0.",
            "",
            "Usage:",
            "`/debt_compare_range <start> <end> <step>`",
            "",
            "Example:",
            "`/debt_compare_range 100 500 100`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const rows = getDebtRows(db);

      if (!rows.length) {
        return bot.sendMessage(chatId, "No debts recorded.");
      }

      const tableRows = [];

      for (let extra = start; extra <= end + 0.0000001; extra += step) {
        const normalizedExtra = Number(extra.toFixed(10));

        const snow = runDebtSimulation(rows, "snowball", normalizedExtra);
        const ava = runDebtSimulation(rows, "avalanche", normalizedExtra);

        const snowText = snow.months == null || snow.interest == null
          ? ">100y"
          : `${snow.months}m / $${snow.interest.toFixed(0)}`;

        const avaText = ava.months == null || ava.interest == null
          ? ">100y"
          : `${ava.months}m / $${ava.interest.toFixed(0)}`;

        let better = "same";
        if (
          snow.months != null && snow.interest != null &&
          ava.months != null && ava.interest != null
        ) {
          if (ava.interest + 0.005 < snow.interest) better = "avalanche";
          else if (snow.interest + 0.005 < ava.interest) better = "snowball";
        }

        tableRows.push([
          `$${normalizedExtra.toFixed(0)}`,
          snowText,
          avaText,
          better
        ]);
      }

      const out = [
        "💳 *Debt Compare Range*",
        "",
        renderTable(
          ["Extra", "Snowball", "Avalanche", "Better"],
          tableRows,
          { aligns: ["right", "left", "left", "left"] }
        )
      ].join("\n");

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("debt_compare_range error:", err);
      return bot.sendMessage(chatId, "Error comparing debt strategies across range.");
    }
  });
};

module.exports.help = {
  command: "debt_compare_range",
  category: "Debt",
  summary: "Compare snowball and avalanche strategies across a range of extra monthly payment amounts.",
  usage: [
    "/debt_compare_range <start> <end> <step>"
  ],
  args: [
    { name: "<start>", description: "Starting extra monthly payment. Must be zero or greater." },
    { name: "<end>", description: "Ending extra monthly payment. Must be greater than or equal to start." },
    { name: "<step>", description: "Step size between values. Must be greater than 0." }
  ],
  examples: [
    "/debt_compare_range 100 500 100",
    "/debt_compare_range 50 300 50"
  ],
  notes: [
    "Shows payoff time and total interest for each strategy at each extra-payment level.",
    "Uses your current debts table."
  ]
};
