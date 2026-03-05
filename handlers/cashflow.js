// handlers/cashflow.js

module.exports = function registerCashflowHandler(bot, deps) {
  const { db } = deps;

  function monthlyMultiplier(freq) {
    switch ((freq || "").toLowerCase()) {
      case "daily":
        return 30;
      case "weekly":
        return 4.33;
      case "monthly":
        return 1;
      case "yearly":
        return 1 / 12;
      default:
        return 0;
    }
  }

  bot.onText(/^\/cashflow(@\w+)?$/, (msg) => {
    const chatId = msg.chat.id;

    try {
      const rows = db.prepare(`
        SELECT id, description, postings_json, frequency
        FROM recurring_transactions
        ORDER BY id ASC
      `).all();

      if (!rows.length) {
        return bot.sendMessage(chatId, "No recurring items saved yet.");
      }

      let incomeMonthly = 0;
      let billsMonthly = 0;

      for (const r of rows) {
        const mult = monthlyMultiplier(r.frequency);
        if (!mult) continue;

        let bankAmt = 0;
        try {
          const postings = JSON.parse(r.postings_json);
          const bankLine = Array.isArray(postings)
            ? postings.find((p) => p.account === "assets:bank")
            : null;

          bankAmt = Number(bankLine?.amount) || 0;
        } catch {
          bankAmt = 0;
        }

        const monthlyAmt = Math.abs(bankAmt) * mult;

        if (bankAmt > 0) incomeMonthly += monthlyAmt; // money into bank
        if (bankAmt < 0) billsMonthly += monthlyAmt;  // money out of bank
      }

      const net = incomeMonthly - billsMonthly;

      const sign = net >= 0 ? "+" : "-";
      const netAbs = Math.abs(net);

      return bot.sendMessage(
        chatId,
        `📊 Monthly Cashflow (Recurring)\n\n` +
        `Recurring Income: $${incomeMonthly.toFixed(2)}\n` +
        `Recurring Bills:  $${billsMonthly.toFixed(2)}\n\n` +
        `Net Monthly:      ${sign}$${netAbs.toFixed(2)}`
      );
    } catch (err) {
      console.error("Cashflow error:", err);
      return bot.sendMessage(chatId, "Error calculating cashflow.");
    }
  });
};
