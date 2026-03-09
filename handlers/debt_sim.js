// handlers/debt_sim.js
module.exports = function registerDebtSimHandler(bot, deps) {
  const { db, format, debt } = deps;
  const { formatMoney, codeBlock } = format;
  const { getDebtRows, runDebtSimulation } = debt;

  function renderHelp() {
    return [
      "*\\/debt_sim*",
      "Simulate debt payoff over time using snowball or avalanche with an extra monthly payment.",
      "",
      "*Usage*",
      "- `/debt_sim <snowball|avalanche> <extra>`",
      "",
      "*Arguments*",
      "- `<snowball|avalanche>` — Debt payoff strategy to simulate.",
      "- `<extra>` — Extra monthly payment on top of minimums. Must be zero or greater.",
      "",
      "*Examples*",
      "- `/debt_sim snowball 100`",
      "- `/debt_sim avalanche 250`",
      "",
      "*Notes*",
      "- Uses your current debts table.",
      "- Shows payoff time, interest paid, and monthly debt budget."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/debt_sim(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (!raw || /^(help|--help|-h)$/i.test(raw)) {
      return sendHelp(chatId);
    }

    try {
      const parsed = raw.match(/^(snowball|avalanche)\s+(-?\d+(?:\.\d+)?)$/i);

      if (!parsed) {
        return bot.sendMessage(
          chatId,
          [
            "Missing or invalid arguments for `/debt_sim`.",
            "",
            "Usage:",
            "`/debt_sim <snowball|avalanche> <extra>`",
            "",
            "Examples:",
            "`/debt_sim snowball 100`",
            "`/debt_sim avalanche 250`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const mode = String(parsed[1] || "").toLowerCase();
      const extra = Number(parsed[2]);

      if (!Number.isFinite(extra) || extra < 0) {
        return bot.sendMessage(
          chatId,
          [
            "Extra payment must be zero or greater.",
            "",
            "Usage:",
            "`/debt_sim <snowball|avalanche> <extra>`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const rows = getDebtRows(db);

      if (!rows.length) {
        return bot.sendMessage(chatId, "No debts recorded.");
      }

      const result = runDebtSimulation(rows, mode, extra);

      if (result.months == null || result.interest == null) {
        return bot.sendMessage(
          chatId,
          "Simulation exceeded safe limit. Budget may be too low."
        );
      }

      const out = [
        `🧮 *Debt Simulation (${mode})*`,
        "",
        codeBlock([
          `Starting Debt   ${formatMoney(result.startingDebt)}`,
          `Min Payments    ${formatMoney(result.totalMinimums)}`,
          `Extra Payment   ${formatMoney(extra)}`,
          `Monthly Budget  ${formatMoney(result.monthlyBudget)}`,
          `Months to Payoff ${result.months}`,
          `Interest Paid   ${formatMoney(result.interest)}`
        ].join("\n"))
      ].join("\n");

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("debt_sim error:", err);
      return bot.sendMessage(chatId, "Error simulating debt payoff.");
    }
  });
};

module.exports.help = {
  command: "debt_sim",
  category: "Debt",
  summary: "Simulate debt payoff over time using snowball or avalanche with an extra monthly payment.",
  usage: [
    "/debt_sim <snowball|avalanche> <extra>"
  ],
  args: [
    { name: "<snowball|avalanche>", description: "Debt payoff strategy to simulate." },
    { name: "<extra>", description: "Extra monthly payment on top of minimums. Must be zero or greater." }
  ],
  examples: [
    "/debt_sim snowball 100",
    "/debt_sim avalanche 250"
  ],
  notes: [
    "Uses your current debts table.",
    "Shows payoff time, interest paid, and monthly debt budget."
  ]
};
