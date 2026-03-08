// handlers/summary.js
module.exports = function registerSummaryHandler(bot, deps) {
  const { db } = deps;

  function money(n) {
    return `$${(Number(n) || 0).toFixed(2)}`;
  }

  bot.onText(/^\/summary(@\w+)?$/, (msg) => {
    const chatId = msg.chat.id;

    try {
      const rows = db.prepare(`
        SELECT a.name as account,
               SUM(p.amount) as total
        FROM postings p
        JOIN accounts a ON p.account_id = a.id
        JOIN transactions t ON p.transaction_id = t.id
        WHERE a.name LIKE 'expenses:%'
          AND date(t.date) >= date('now','-30 day')
        GROUP BY a.name
        ORDER BY total DESC
      `).all();

      if (!rows.length) {
        return bot.sendMessage(chatId,
          "📊 30-Day Spending Summary\n\nNo expenses recorded."
        );
      }

      let total = 0;

      let out = "📊 30-Day Spending Summary\n\n";
      out += "```\n";

      for (const r of rows) {
        const amt = Math.abs(Number(r.total) || 0);
        total += amt;

        const name = r.account.replace("expenses:", "");
        out += `${name.padEnd(14)} ${money(amt)}\n`;
      }

      out += "---------------------\n";
      out += `Total          ${money(total)}\n`;
      out += "```";

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });

    } catch (err) {
      console.error("summary error:", err);
      return bot.sendMessage(chatId, "Error generating summary.");
    }
  });
};
