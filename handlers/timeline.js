// handlers/timeline.js
module.exports = function registerTimelineHandler(bot, deps) {
  const { db, ledgerService, simulateCashflow, format, finance } = deps;
  const { formatMoney, codeBlock } = format;
  const {
    futureMonthLabel,
    getStartingAssets,
    getRecurringMonthlyNet,
    getMonthlyExpenses,
    getDebtRows,
    simulateDebtPayoffMonths,
    simulateFIMonths,
    simulateNetWorthMilestoneMonths,
    findNextIncome
  } = finance;

  function renderHelp() {
    return [
      "*\\/timeline*",
      "Show a compact financial timeline including current net worth, next income, danger point, debt-free date, FI date, and key wealth milestones.",
      "",
      "*Usage*",
      "- `/timeline`",
      "",
      "*Examples*",
      "- `/timeline`",
      "",
      "*Notes*",
      "- Starting assets include `assets:bank` and `assets:savings`.",
      "- Danger point is based on the 30-day cashflow simulation for `assets:bank`."
    ].join("\n");
  }

  bot.onText(/^\/timeline(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return bot.sendMessage(chatId, renderHelp(), {
          parse_mode: "Markdown"
        });
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/timeline` command does not take arguments.",
          "",
          "Usage:",
          "`/timeline`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    try {
      const starting = getStartingAssets(ledgerService);
      const bank = starting.bank;
      const savings = starting.savings;
      const totalAssets = starting.total;

      const debtRows = getDebtRows(db);
      const totalDebt = debtRows.reduce((sum, d) => sum + d.balance, 0);
      const netWorthNow = totalAssets - totalDebt;

      const recurring = getRecurringMonthlyNet(db);
      const monthlyNet = recurring.net;

      const checking = db.prepare(`
        SELECT id
        FROM accounts
        WHERE name = 'assets:bank'
      `).get();

      if (!checking) {
        return bot.sendMessage(chatId, "Checking account not found.");
      }

      const sim = simulateCashflow(db, bank, checking.id, 30);
      const timeline = Array.isArray(sim.timeline) ? sim.timeline : [];
      let lowestEvent = null;

      for (const event of timeline) {
        if (!lowestEvent || Number(event.balance) < Number(lowestEvent.balance)) {
          lowestEvent = event;
        }
      }

      const nextIncome = findNextIncome(db);

      const debtMonths = simulateDebtPayoffMonths(
        debtRows,
        "avalanche",
        Math.max(0, monthlyNet)
      );

      const monthlyExpenses = getMonthlyExpenses(db);
      const annualExpenses = monthlyExpenses * 12;
      const fiTarget = annualExpenses > 0 ? annualExpenses * 25 : 0;
      const fiMonths = simulateFIMonths(
        totalAssets,
        Math.max(0, monthlyNet),
        7,
        fiTarget
      );

      const wealthTargets = [10000, 25000, 50000, 100000];
      const wealthMap = simulateNetWorthMilestoneMonths(
        totalAssets,
        monthlyNet,
        debtRows,
        wealthTargets,
        {
          maxMonths: 2400,
          spendOnlyAvailableCash: true
        }
      );

      const lines = [
        "🛣️ *Timeline*",
        "",
        codeBlock([
          `Bank Now         ${formatMoney(bank)}`,
          `Savings Now      ${formatMoney(savings)}`,
          `Assets Now       ${formatMoney(totalAssets)}`,
          `Debt Now         ${formatMoney(totalDebt)}`,
          `Net Worth Now    ${netWorthNow >= 0 ? "+" : "-"}${formatMoney(Math.abs(netWorthNow))}`,
          nextIncome
            ? `Next Income      ${formatMoney(nextIncome.amount)} ${nextIncome.dateText}`
            : `Next Income      unavailable`,
          lowestEvent
            ? `Danger Point     ${formatMoney(lowestEvent.balance)} on ${lowestEvent.date}`
            : `Danger Point     unavailable`,
          debtRows.length === 0
            ? `Debt Free        already debt-free`
            : debtMonths == null
              ? `Debt Free        >100 years`
              : `Debt Free        ${futureMonthLabel(debtMonths)}`,
          fiTarget <= 0 || fiMonths == null
            ? `FI Date          unavailable`
            : `FI Date          ${futureMonthLabel(fiMonths)}`,
          "------------------------------",
          ...wealthTargets.map((target) => {
            const months = wealthMap[target];
            const label = `${formatMoney(target)}:`.padEnd(16);
            return months == null
              ? `${label} >200 years`
              : `${label} ${futureMonthLabel(months)}`;
          })
        ].join("\n"))
      ];

      if (nextIncome?.description) {
        lines.push(`Next income source: \`${nextIncome.description}\``);
      }

      return bot.sendMessage(chatId, lines.join("\n"), {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("timeline error:", err);
      return bot.sendMessage(chatId, "Error generating timeline.");
    }
  });
};

module.exports.help = {
  command: "timeline",
  category: "Forecasting",
  summary: "Show a compact financial timeline including current net worth, next income, danger point, debt-free date, FI date, and key wealth milestones.",
  usage: [
    "/timeline"
  ],
  examples: [
    "/timeline"
  ],
  notes: [
    "Starting assets include `assets:bank` and `assets:savings`.",
    "Danger point is based on the 30-day cashflow simulation for `assets:bank`."
  ]
};
