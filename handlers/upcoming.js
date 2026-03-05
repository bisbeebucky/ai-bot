// handlers/upcoming.js

module.exports = function registerUpcomingHandler(bot, deps) {
  const { db } = deps;

  bot.onText(/^\/upcoming(?:\s+(\d+))?$/, (msg, match) => {
    const chatId = msg.chat.id;

    try {

      const days = Number(match?.[1]) || 30;

      const rows = db.prepare(`
        SELECT
          description,
          postings_json,
          frequency,
          next_due_date
        FROM recurring_transactions
        WHERE date(next_due_date) <= date('now', ?)
        ORDER BY date(next_due_date) ASC
      `).all(`+${days} days`);

      if (!rows.length) {
        return bot.sendMessage(chatId, `No recurring items in next ${days} days.`);
      }

      let output = `📅 Upcoming (next ${days} days)\n\n`;

      let total = 0;

      for (const r of rows) {

        let amount = 0;

        try {
          const postings = JSON.parse(r.postings_json);

          const bankLine = postings.find(p => p.account === "assets:bank");

          if (bankLine) {
            amount = Math.abs(Number(bankLine.amount));
          }

        } catch { }

        total += amount;

        output += `${r.next_due_date}  ${r.description.padEnd(14)}  $${amount.toFixed(2)}\n`;

      }

      output += `\nTotal outgoing: $${total.toFixed(2)}`;

      return bot.sendMessage(chatId, output);

    } catch (err) {

      console.error("Upcoming error:", err);

      return bot.sendMessage(chatId, "Error retrieving upcoming bills.");

    }

  });

};
