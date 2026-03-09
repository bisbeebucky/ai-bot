// handlers/danger.js
module.exports = function registerDangerHandler(bot, deps) {
  const { db, simulateCashflow, format } = deps;
  const { formatMoney, codeBlock } = format;

  function daysUntil(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);

    return Math.round((d - today) / (1000 * 60 * 60 * 24));
  }

  function renderHelp() {
    return [
      "*\\/danger*",
      "Shows the date and event where your balance is lowest.",
      "",
      "*Usage*",
      "- `/danger`",
      "",
      "*Examples*",
      "- `/danger`"
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/danger(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/danger` command does not take arguments.",
          "",
          "Usage:",
          "`/danger`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
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
          [
            "⚠️ *Danger Window*",
            "",
            `No recurring events in the next 30 days.`,
            `Current Balance: ${formatMoney(currentBalance)}`
          ].join("\n"),
          { parse_mode: "Markdown" }
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

      const out = [
        "⚠️ *Danger Window*",
        "",
        codeBlock([
          `Current Balance  ${formatMoney(currentBalance)}`,
          `Lowest Balance   ${formatMoney(lowBal)}`,
          `Date             ${lowestEvent.date}`,
          `Days Away        ${daysUntil(lowestEvent.date)}`,
          `Trigger          ${lowestEvent.description}`,
          `Status           ${riskLevel}`
        ].join("\n"))
      ].join("\n");

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("danger error:", err);
      return bot.sendMessage(chatId, "Error calculating danger window.");
    }
  });
};

module.exports.help = {
  command: "danger",
  category: "General",
  summary: "Shows the date and event where your balance is lowest.",
  usage: [
    "/danger"
  ],
  examples: [
    "/danger"
  ]
};
