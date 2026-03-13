// handlers/burn.js
module.exports = function registerBurnHandler(bot, deps) {

  const { finance, format } = deps;
  const { codeBlock, formatMoney } = format;

  const {
    getStartingAssets,
    getRecurringMonthlyNet
  } = finance;

  function renderHelp() {
    return [
      "*\\/burn*",
      "Calculate monthly burn rate and runway.",
      "",
      "*Usage*",
      "- `/burn`",
      "",
      "*Notes*",
      "- Burn rate is based on recurring income and expenses."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/burn(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {

    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }
    }

    try {

      const starting = getStartingAssets(deps.ledgerService);
      const bank = starting.bank;
      const savings = starting.savings;

      const totalCash = bank + savings;

      const recurring = getRecurringMonthlyNet(deps.db);

      const monthlyNet = Number(recurring?.net) || 0;
      const monthlyIncome = Number(recurring?.income) || 0;
      const monthlyExpenses = Math.abs(Number(recurring?.expenses) || 0);

      let runwayMonths = null;

      if (monthlyNet < 0) {
        runwayMonths = totalCash / Math.abs(monthlyNet);
      }

      const runwayText =
        runwayMonths == null
          ? "∞ (cashflow positive)"
          : `${runwayMonths.toFixed(1)} months`;

      const out = [
        "🔥 *Cash Burn Rate*",
        "",
        codeBlock([
          `Monthly Income   ${formatMoney(monthlyIncome)}`,
          `Monthly Expenses ${formatMoney(monthlyExpenses)}`,
          `Net Burn         ${monthlyNet >= 0 ? "+" : "-"}${formatMoney(Math.abs(monthlyNet))}`,
          "",
          `Cash Available   ${formatMoney(totalCash)}`,
          `Runway           ${runwayText}`
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
  summary: "Calculate monthly burn rate and runway.",
  usage: [
    "/burn"
  ],
  examples: [
    "/burn"
  ],
  notes: [
    "Uses recurring income and expenses to estimate burn."
  ]
};
