// handlers/risk.js
module.exports = function registerRiskHandler(bot, deps) {

  const { db, simulateCashflow, format, finance } = deps;
  const { formatMoney, codeBlock } = format;
  const { getStartingAssets, getDebtRows } = finance;

  function renderHelp() {
    return [
      "*\\/risk*",
      "Calculate a simple financial risk score based on cashflow, savings, and debt.",
      "",
      "*Usage*",
      "- `/risk`"
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/risk(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {

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

      const checking = db.prepare(`
        SELECT id
        FROM accounts
        WHERE name = 'assets:bank'
      `).get();

      if (!checking) {
        return bot.sendMessage(chatId, "Checking account not found.");
      }

      const sim = simulateCashflow(db, bank, checking.id, 30);

      const lowest = Number(sim?.lowestBalance) || bank;

      const debtRows = getDebtRows(db);
      const debtTotal = debtRows.reduce((sum, d) => sum + d.balance, 0);

      let score = 100;

      if (lowest < 0) score -= 40;
      else if (lowest < 100) score -= 20;

      if (savings < 250) score -= 20;
      else if (savings < 1000) score -= 10;

      if (debtTotal > 5000) score -= 20;
      else if (debtTotal > 1000) score -= 10;

      score = Math.max(0, score);

      let status;

      if (score >= 80) status = "🟢 Stable";
      else if (score >= 50) status = "🟡 Caution";
      else status = "🔴 Risky";

      const out = [
        "📊 *Financial Risk Score*",
        "",
        codeBlock([
          `Score        ${score} / 100`,
          `Status       ${status}`,
          "",
          `Lowest Dip   ${formatMoney(lowest)}`,
          `Savings      ${formatMoney(savings)}`,
          `Debt Load    ${formatMoney(debtTotal)}`
        ].join("\n"))
      ].join("\n");

      return bot.sendMessage(chatId, out, { parse_mode: "Markdown" });

    }
    catch (err) {

      console.error("risk error:", err);
      return bot.sendMessage(chatId, "Error calculating risk score.");

    }

  });

};

module.exports.help = {
  command: "risk",
  category: "Forecasting",
  summary: "Calculate a financial risk score.",
  usage: [
    "/risk"
  ],
  examples: [
    "/risk"
  ]
};
