// handlers/money.js
module.exports = function registerMoneyHandler(bot, deps) {
  const { db, ledgerService, format, finance } = deps;
  const { formatMoney, codeBlock } = format;
  const {
    futureMonthLabel,
    getStartingAssets,
    getTotalLiabilities,
    getNetWorth,
    getRecurringMonthlyNet,
    getMonthlyExpenses,
    getDebtRows,
    simulateDebtPayoffMonths,
    simulateFIMonths
  } = finance;

  function renderHelp() {
    return [
      "*\\/money*",
      "Show a compact financial snapshot including bank balance, debt, net worth, recurring net, debt-free estimate, and FI estimate.",
      "",
      "*Usage*",
      "- `/money`",
      "",
      "*Examples*",
      "- `/money`",
      "",
      "*Notes*",
      "- Balances come from `ledgerService.getBalances()`.",
      "- Recurring net is estimated from `recurring_transactions`.",
      "- FI estimate uses current month expenses and a 7% annual return assumption."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  function signedMoney(value, suffix = "") {
    const n = Number(value) || 0;
    const sign = n >= 0 ? "+" : "-";
    return `${sign}${formatMoney(Math.abs(n))}${suffix}`;
  }

  bot.onText(/^\/money(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw && !/^(help|--help|-h)$/i.test(raw)) {
      return bot.sendMessage(
        chatId,
        [
          "The `/money` command does not take arguments.",
          "",
          "Usage:",
          "`/money`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    if (/^(help|--help|-h)$/i.test(raw)) {
      return sendHelp(chatId);
    }

    try {
      const starting = getStartingAssets(ledgerService);
      const bank = starting.bank;
      const debt = getTotalLiabilities(ledgerService);
      const netWorth = getNetWorth(ledgerService);
      const recurring = getRecurringMonthlyNet(db);
      const recurringNet = recurring.net;

      const debtRows = getDebtRows(db);
      const debtMonths = simulateDebtPayoffMonths(
        debtRows,
        "avalanche",
        Math.max(0, recurringNet)
      );

      const monthlyExpenses = getMonthlyExpenses(db);
      const annualExpenses = monthlyExpenses * 12;
      const fiTarget = annualExpenses > 0 ? annualExpenses * 25 : 0;
      const fiMonths = simulateFIMonths(
        bank,
        Math.max(0, recurringNet),
        7,
        fiTarget
      );

      let debtText;
      if (debtRows.length === 0) {
        debtText = "Already debt-free";
      } else if (debtMonths == null) {
        debtText = ">100 years";
      } else {
        debtText = futureMonthLabel(debtMonths);
      }

      let fiText;
      if (fiTarget <= 0 || fiMonths == null) {
        fiText = "unavailable";
      } else {
        fiText = futureMonthLabel(fiMonths);
      }

      const out = [
        "💰 *Money*",
        "",
        codeBlock([
          `Bank           ${formatMoney(bank)}`,
          `Debt           ${formatMoney(debt)}`,
          `Net Worth      ${signedMoney(netWorth)}`,
          `Recurring Net  ${signedMoney(recurringNet, "/mo")}`,
          `Debt Free      ${debtText}`,
          `FI             ${fiText}`
        ].join("\n"))
      ].join("\n");

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("money error:", err);
      return bot.sendMessage(chatId, "Error generating money snapshot.");
    }
  });
};

module.exports.help = {
  command: "money",
  category: "Reporting",
  summary: "Show a compact financial snapshot including bank balance, debt, net worth, recurring net, debt-free estimate, and FI estimate.",
  usage: [
    "/money"
  ],
  examples: [
    "/money"
  ],
  notes: [
    "Balances come from `ledgerService.getBalances()`.",
    "Recurring net is estimated from `recurring_transactions`.",
    "FI estimate uses current month expenses and a 7% annual return assumption."
  ]
};
