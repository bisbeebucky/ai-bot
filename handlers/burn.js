// handlers/burn.js
module.exports = function registerBurnHandler(bot, deps) {
  const { db, finance, format } = deps;
  const { codeBlock, formatMoney } = format;

  const {
    getStartingAssets,
    getRecurringMonthlyNet
  } = finance;

  function renderHelp() {
    return [
      "*\\/burn*",
      "Calculate monthly burn rate and runway using recurring cashflow plus recent 30-day trends.",
      "",
      "*Usage*",
      "- `/burn`",
      "",
      "*Notes*",
      "- Income uses recurring income when available, otherwise recent 30-day income.",
      "- Expenses use the higher of recurring expenses and recent 30-day expenses.",
      "- Runway is shown only when net burn is negative."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  function getActual30DayTotals() {
    const row = db.prepare(`
      SELECT
        IFNULL(SUM(CASE WHEN a.name LIKE 'income:%' THEN ABS(p.amount) ELSE 0 END), 0) AS income,
        IFNULL(SUM(CASE WHEN a.name LIKE 'expenses:%' THEN ABS(p.amount) ELSE 0 END), 0) AS expenses
      FROM postings p
      JOIN accounts a ON a.id = p.account_id
      JOIN transactions t ON t.id = p.transaction_id
      WHERE t.date >= date('now', '-30 days')
    `).get();

    return {
      income: Number(row?.income) || 0,
      expenses: Number(row?.expenses) || 0
    };
  }

  bot.onText(/^\/burn(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/burn` command does not take arguments.",
          "",
          "Usage:",
          "`/burn`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    try {
      const starting = getStartingAssets(deps.ledgerService);
      const bank = Number(starting.bank) || 0;
      const savings = Number(starting.savings) || 0;
      const totalCash = bank + savings;

      const recurring = getRecurringMonthlyNet(db);
      const recurringIncome = Number(recurring?.income) || 0;
      const recurringExpenses = Math.abs(Number(recurring?.expenses) || 0);

      const actual30 = getActual30DayTotals();
      const actualIncome = actual30.income;
      const actualExpenses = actual30.expenses;

      const projectedIncome =
        recurringIncome > 0 ? recurringIncome : actualIncome;

      const projectedExpenses = Math.max(
        recurringExpenses,
        actualExpenses
      );

      const netBurn = projectedIncome - projectedExpenses;

      let runwayMonths = null;
      if (netBurn < 0) {
        runwayMonths = totalCash / Math.abs(netBurn);
      }

      const runwayText =
        runwayMonths == null
          ? "∞ (cashflow positive)"
          : `${runwayMonths.toFixed(1)} months`;

      let statusLine;
      let summaryLine;

      if (netBurn < 0 && runwayMonths !== null && runwayMonths < 3) {
        statusLine = "🔴 *Status: High Burn*";
        summaryLine = "Your current burn rate is negative and your runway is short.";
      } else if (netBurn < 0) {
        statusLine = "🟡 *Status: Burning Cash*";
        summaryLine = "You are spending faster than you are bringing money in.";
      } else {
        statusLine = "🟢 *Status: Cashflow Positive*";
        summaryLine = "Your projected monthly cashflow is positive.";
      }

      const out = [
        "🔥 *Cash Burn Rate*",
        "",
        statusLine,
        summaryLine,
        "",
        codeBlock([
          `Recurring Income   ${formatMoney(recurringIncome)}`,
          `Recurring Expense  ${formatMoney(recurringExpenses)}`,
          `30d Income         ${formatMoney(actualIncome)}`,
          `30d Expense        ${formatMoney(actualExpenses)}`,
          "",
          `Proj Income        ${formatMoney(projectedIncome)}`,
          `Proj Expense       ${formatMoney(projectedExpenses)}`,
          `Net Burn           ${netBurn >= 0 ? "+" : "-"}${formatMoney(Math.abs(netBurn))}`,
          "",
          `Cash Available     ${formatMoney(totalCash)}`,
          `Runway             ${runwayText}`
        ].join("\n"))
      ].join("\n");

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("burn error:", err);
      return bot.sendMessage(chatId, "Error calculating burn rate.");
    }
  });
};

module.exports.help = {
  command: "burn",
  category: "Finance",
  summary: "Calculate monthly burn rate and runway using recurring cashflow plus recent 30-day trends.",
  usage: [
    "/burn"
  ],
  examples: [
    "/burn"
  ],
  notes: [
    "Income uses recurring income when available, otherwise recent 30-day income.",
    "Expenses use the higher of recurring expenses and recent 30-day expenses.",
    "Runway is shown only when net burn is negative."
  ]
};
