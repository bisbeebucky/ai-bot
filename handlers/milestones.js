// handlers/milestones.js
module.exports = function registerMilestonesHandler(bot, deps) {
  const { db, ledgerService, format, finance } = deps;
  const { formatMoney, codeBlock } = format;
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
      "*\\/milestones*",
      "Show estimated dates for debt freedom, financial independence, and selected net worth milestones.",
      "",
      "*Usage*",
      "- `/milestones`",
      "",
      "*Examples*",
      "- `/milestones`",
      "",
      "*Notes*",
      "- Starting assets include `assets:bank` and `assets:savings`.",
      "- Uses recurring net cashflow and debt payoff to estimate milestone timing."
    ].join("\n");
  }

  bot.onText(/^\/milestones(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return bot.sendMessage(chatId, renderHelp(), { parse_mode: "Markdown" });
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/milestones` command does not take arguments.",
          "",
          "Usage:",
          "`/milestones`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    try {
      const starting = getStartingAssets(ledgerService);
      const startBalance = starting.total;
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
        startBalance,
        Math.max(0, recurring.net),
        7,
        fiTarget
      );

      const targets = [10000, 25000, 50000, 100000];
      const milestoneMonths = simulateNetWorthMilestoneMonths(
        startBalance,
        recurring.net,
        debtRows,
        targets
      );

      const lines = [
        "📍 *Financial Milestones*",
        "",
        codeBlock([
          `Bank Balance      ${formatMoney(starting.bank)}`,
          `Savings Balance   ${formatMoney(starting.savings)}`,
          `Starting Assets   ${formatMoney(startBalance)}`,
          debtRows.length === 0
            ? `Debt Free         Already debt-free`
            : debtMonths == null
              ? `Debt Free         >100 years`
              : `Debt Free         ${futureMonthLabel(debtMonths)}`,
          fiTarget <= 0 || fiMonths == null
            ? `Financial Indep   unavailable`
            : `Financial Indep   ${futureMonthLabel(fiMonths)}`,
          "-----------------------------",
          ...targets.map((target) => {
            const months = milestoneMonths[target];
            const label = `Net Worth ${formatMoney(target)}:`.padEnd(22);
            return months == null
              ? `${label} >100 years`
              : `${label} ${futureMonthLabel(months)}`;
          })
        ].join("\n"))
      ];

      return bot.sendMessage(chatId, lines.join("\n"), {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("milestones error:", err);
      return bot.sendMessage(chatId, "Error generating milestones.");
    }
  });
};

module.exports.help = {
  command: "milestones",
  category: "Forecasting",
  summary: "Show estimated dates for debt freedom, financial independence, and selected net worth milestones.",
  usage: [
    "/milestones"
  ],
  examples: [
    "/milestones"
  ],
  notes: [
    "Starting assets include `assets:bank` and `assets:savings`.",
    "Uses recurring net cashflow and debt payoff to estimate milestone timing."
  ]
};
