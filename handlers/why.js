// handlers/why.js
module.exports = function registerWhyHandler(bot, deps) {
  const { db, simulateCashflow, format } = deps;
  const { formatMoney, codeBlock } = format;

  function renderHelp() {
    return [
      "*\\/why*",
      "Explain which upcoming expenses cause your lowest balance.",
      "",
      "*Usage*",
      "- `/why`"
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  function parseLocalDate(dateStr) {
    const s = String(dateStr || "").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;

    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setHours(12, 0, 0, 0);
    return d;
  }

  bot.onText(/^\/why(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {

    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }
    }

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
        SELECT IFNULL(SUM(amount),0) as balance
        FROM postings
        WHERE account_id = ?
      `).get(checking.id);

      const currentBalance = Number(balanceRow?.balance) || 0;

      const sim = simulateCashflow(db, currentBalance, checking.id, 30);
      const timeline = Array.isArray(sim?.timeline) ? sim.timeline : [];

      if (!timeline.length) {
        return bot.sendMessage(chatId, "No forecast data available.");
      }

      const lowest = Number(sim?.lowestBalance) || currentBalance;

      let lowestDate = null;

      for (const e of timeline) {
        if (Number(e.balance) === lowest) {
          lowestDate = parseLocalDate(e.date);
          break;
        }
      }

      if (!lowestDate) {
        return bot.sendMessage(chatId, "Could not determine lowest balance date.");
      }

      const causes = [];

      for (const e of timeline) {

        const d = parseLocalDate(e.date);
        const amt = Number(e.amount) || 0;

        if (d && d <= lowestDate && amt < 0) {
          causes.push({
            description: e.description || "expense",
            amount: Math.abs(amt)
          });
        }
      }

      causes.sort((a, b) => b.amount - a.amount);

      const top = causes.slice(0, 5);

      const lines = top.map((c, i) =>
        `${String(i + 1).padEnd(2)} ${c.description.padEnd(12)} ${formatMoney(c.amount)}`
      );
      const out = [
        "🧠 *Why Your Balance Drops*",
        "",
        codeBlock([
          `Lowest Balance   ${formatMoney(lowest)}`,
          `Date             ${lowestDate.toISOString().slice(0, 10)}`,
          "",
          "Main Causes",
          ...lines
        ].join("\n"))
      ].join("\n");

      return bot.sendMessage(chatId, out, { parse_mode: "Markdown" });

    } catch (err) {

      console.error("why error:", err);
      return bot.sendMessage(chatId, "Error explaining forecast.");

    }

  });

};

module.exports.help = {
  command: "why",
  category: "Forecasting",
  summary: "Explain what causes your lowest projected balance.",
  usage: [
    "/why"
  ],
  examples: [
    "/why"
  ]
};
