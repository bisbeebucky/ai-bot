// handlers/balance_on.js
module.exports = function registerBalanceOnHandler(bot, deps) {
  const { db, simulateCashflow, format } = deps;
  const { formatMoney } = format;

  function renderHelp() {
    return [
      "*\\/balance_on*",
      "Estimate your `assets:bank` balance on a future date based on recurring items.",
      "",
      "*Usage*",
      "- `/balance_on <YYYY-MM-DD>`",
      "",
      "*Arguments*",
      "- `<YYYY-MM-DD>` — Future date to estimate.",
      "",
      "*Examples*",
      "- `/balance_on 2026-04-03`",
      "- `/balance_on 2026-06-01`",
      "",
      "*Notes*",
      "- Uses the current `assets:bank` balance as the starting point.",
      "- Uses recurring transactions from the forecast engine.",
      "- Only future dates are supported."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  function parseYMD(value) {
    const s = String(value || "").trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;

    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);

    const dt = new Date(y, mo - 1, d);
    dt.setHours(0, 0, 0, 0);

    if (
      dt.getFullYear() !== y ||
      dt.getMonth() !== mo - 1 ||
      dt.getDate() !== d
    ) {
      return null;
    }

    return dt;
  }

  function ymd(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function diffDays(fromDate, toDate) {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((toDate.getTime() - fromDate.getTime()) / msPerDay);
  }

  bot.onText(/^\/balance_on(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (!raw || /^(help|--help|-h)$/i.test(raw)) {
      return sendHelp(chatId);
    }

    try {
      const targetDate = parseYMD(raw);

      if (!targetDate) {
        return bot.sendMessage(
          chatId,
          [
            "Invalid date.",
            "",
            "Usage:",
            "`/balance_on <YYYY-MM-DD>`",
            "",
            "Example:",
            "`/balance_on 2026-04-03`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const days = diffDays(today, targetDate);

      if (days < 0) {
        return bot.sendMessage(
          chatId,
          [
            "Only future dates are supported.",
            "",
            "Usage:",
            "`/balance_on <YYYY-MM-DD>`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const checking = db.prepare(`
        SELECT id
        FROM accounts
        WHERE name = 'assets:bank'
      `).get();

      if (!checking) {
        return bot.sendMessage(chatId, "Checking account `assets:bank` not found.", {
          parse_mode: "Markdown"
        });
      }

      const row = db.prepare(`
        SELECT IFNULL(SUM(amount), 0) as balance
        FROM postings
        WHERE account_id = ?
      `).get(checking.id);

      const currentBalance = Number(row?.balance) || 0;

      if (days === 0) {
        return bot.sendMessage(
          chatId,
          [
            "💰 *Balance On Date*",
            "",
            `Date: \`${ymd(targetDate)}\``,
            `Estimated Balance: \`${formatMoney(currentBalance)}\``
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const result = simulateCashflow(db, currentBalance, checking.id, days);
      const timeline = Array.isArray(result?.timeline) ? result.timeline : [];

      let estimatedBalance = currentBalance;
      for (const evt of timeline) {
        if (String(evt.date || "") <= ymd(targetDate)) {
          estimatedBalance = Number(evt.balance) || 0;
        }
      }

      return bot.sendMessage(
        chatId,
        [
          "💰 *Balance On Date*",
          "",
          `Date: \`${ymd(targetDate)}\``,
          `Current Balance: \`${formatMoney(currentBalance)}\``,
          `Estimated Balance: \`${formatMoney(estimatedBalance)}\``
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      console.error("balance_on error:", err);
      return bot.sendMessage(chatId, "Error estimating future balance.");
    }
  });
};

module.exports.help = {
  command: "balance_on",
  category: "Forecasting",
  summary: "Estimate your assets:bank balance on a future date.",
  usage: [
    "/balance_on <YYYY-MM-DD>"
  ],
  args: [
    { name: "<YYYY-MM-DD>", description: "Future date to estimate." }
  ],
  examples: [
    "/balance_on 2026-04-03",
    "/balance_on 2026-06-01"
  ],
  notes: [
    "Uses the current assets:bank balance as the starting point.",
    "Uses recurring transactions from the forecast engine.",
    "Only future dates are supported."
  ]
};
