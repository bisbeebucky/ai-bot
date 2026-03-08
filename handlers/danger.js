// handlers/danger.js
module.exports = function registerDangerHandler(bot, deps) {
  const { db, simulateCashflow } = deps;

  function money(n) {
    return `$${(Number(n) || 0).toFixed(2)}`;
  }

  function daysUntil(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);

    return Math.round((d - today) / (1000 * 60 * 60 * 24));
  }

  bot.onText(/^\/danger(@\w+)?$/i, (msg) => {
    const chatId = msg.chat.id;

    try {
      const checking = db.prepare(`
        SELECT id
        FROM accounts
        WHERE name = 'assets:bank'
      `).get();

      if (!checking) {
        return bot.sendMessage(chatId, "Checking account not found.");
      }

      const balanceRow = db.prepare(`
        SELECT IFNULL(SUM(amount), 0) as balance
        FROM postings
        WHERE account_id = ?
      `).get(checking.id);

      const currentBalance = Number(balanceRow?.balance) || 0;
      const result = simulateCashflow(db, currentBalance, checking.id, 30);

      const timeline = Array.isArray(result.timeline) ? result.timeline : [];

      if (!timeline.length) {
        return bot.sendMessage(
          chatId,
          `⚠️ Danger Window\n\nNo recurring events in the next 30 days.\nCurrent Balance: ${money(currentBalance)}`
        );
      }

      let lowestEvent = null;

      for (const event of timeline) {
        if (!lowestEvent || Number(event.balance) < Number(lowestEvent.balance)) {
          lowestEvent = event;
        }
      }

      if (!lowestEvent) {
        return bot.sendMessage(chatId, "Could not determine danger window.");
      }

      const lowBal = Number(lowestEvent.balance) || 0;
      const riskLevel =
        lowBal < 0 ? "❌ Overdraft Risk"
          : lowBal < 100 ? "⚠️ Tight"
            : "✅ Safe";

      let out = "⚠️ Danger Window\n\n";
      out += "```\n";
      out += `Current Balance: ${money(currentBalance)}\n`;
      out += `Lowest Balance:  ${money(lowBal)}\n`;
      out += `Date:            ${lowestEvent.date}\n`;
      out += `Days Away:       ${daysUntil(lowestEvent.date)}\n`;
      out += `Trigger:         ${lowestEvent.description}\n`;
      out += `Status:          ${riskLevel}\n`;
      out += "```";

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("danger error:", err);
      return bot.sendMessage(chatId, "Error calculating danger window.");
    }
  });
};
