// handlers/rich.js
module.exports = function registerRichHandler(bot, deps) {
  const { db, ledgerService, format, finance } = deps;
  const { formatMoney, codeBlock } = format;
  const {
    futureMonthLabel,
    getStartingAssets,
    getRecurringMonthlyNet,
    getDebtRows,
    simulateNetWorthMilestoneMonths
  } = finance;

  function renderHelp() {
    return [
      "*\\/rich*",
      "Show projected net worth milestone dates based on current assets, recurring cashflow, and debt payoff.",
      "",
      "*Usage*",
      "- `/rich`",
      "",
      "*Examples*",
      "- `/rich`",
      "",
      "*Notes*",
      "- Starting assets include `assets:bank` and `assets:savings`.",
      "- Debt is paid down using avalanche logic before larger wealth milestones accelerate."
    ].join("\n");
  }

  bot.onText(/^\/rich(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return bot.sendMessage(chatId, renderHelp(), { parse_mode: "Markdown" });
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/rich` command does not take arguments.",
          "",
          "Usage:",
          "`/rich`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    try {
      const starting = getStartingAssets(ledgerService);
      const cash = starting.total;
      const recurring = getRecurringMonthlyNet(db);
      const monthlyNet = recurring.net;
      const debtRows = getDebtRows(db);

      const totalDebt = debtRows.reduce((sum, d) => sum + d.balance, 0);
      const netWorthNow = cash - totalDebt;

      const targets = [50000, 100000, 250000, 500000, 1000000];
      const monthsMap = simulateNetWorthMilestoneMonths(
        cash,
        monthlyNet,
        debtRows,
        targets,
        {
          maxMonths: 2400,
          spendOnlyAvailableCash: true
        }
      );

      const lines = [
        "💸 *Rich Timeline*",
        "",
        codeBlock([
          `Bank Now        ${formatMoney(starting.bank)}`,
          `Savings Now     ${formatMoney(starting.savings)}`,
          `Assets Now      ${formatMoney(cash)}`,
          `Debt Now        ${formatMoney(totalDebt)}`,
          `Net Worth Now   ${netWorthNow >= 0 ? "+" : "-"}${formatMoney(Math.abs(netWorthNow))}`,
          `Recurring Net   ${monthlyNet >= 0 ? "+" : "-"}${formatMoney(Math.abs(monthlyNet))}/mo`,
          "------------------------------",
          ...targets.map((target) => {
            const months = monthsMap[target];
            const label = `${formatMoney(target)}:`.padEnd(16);
            return months == null
              ? `${label} >200 years`
              : `${label} ${futureMonthLabel(months)}`;
          })
        ].join("\n"))
      ];

      let summary;
      if (monthsMap[1000000] != null) {
        summary = `At your current trajectory, $1M net worth lands around ${futureMonthLabel(monthsMap[1000000])}.`;
      } else if (monthsMap[100000] != null) {
        summary = `At your current trajectory, six figures lands around ${futureMonthLabel(monthsMap[100000])}.`;
      } else {
        summary = "Your trajectory is positive, but larger wealth milestones are still far out.";
      }

      lines.push(summary);

      return bot.sendMessage(chatId, lines.join("\n"), {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("rich error:", err);
      return bot.sendMessage(chatId, "Error generating rich timeline.");
    }
  });
};

module.exports.help = {
  command: "rich",
  category: "Forecasting",
  summary: "Show projected net worth milestone dates based on current assets, recurring cashflow, and debt payoff.",
  usage: [
    "/rich"
  ],
  examples: [
    "/rich"
  ],
  notes: [
    "Starting assets include `assets:bank` and `assets:savings`.",
    "Debt is paid down using avalanche logic before larger wealth milestones accelerate."
  ]
};
