// handlers/debt_strategy.js
module.exports = function registerDebtStrategyHandler(bot, deps) {
  const { db, format } = deps;
  const { formatMoney, renderTable } = format;

  function renderHelp() {
    return [
      "*\\/debt_strategy*",
      "Show the attack order for your debts using either snowball or avalanche.",
      "",
      "*Usage*",
      "- `/debt_strategy <snowball|avalanche>`",
      "",
      "*Arguments*",
      "- `<snowball|avalanche>` — Strategy to use for ordering debts.",
      "",
      "*Examples*",
      "- `/debt_strategy snowball`",
      "- `/debt_strategy avalanche`",
      "",
      "*Notes*",
      "- Snowball sorts by smallest balance first.",
      "- Avalanche sorts by highest APR first."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/debt_strategy(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (!raw || /^(help|--help|-h)$/i.test(raw)) {
      return sendHelp(chatId);
    }

    try {
      const mode = raw.toLowerCase();

      if (mode !== "snowball" && mode !== "avalanche") {
        return bot.sendMessage(
          chatId,
          [
            "Strategy must be `snowball` or `avalanche`.",
            "",
            "Usage:",
            "`/debt_strategy <snowball|avalanche>`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const rows = db.prepare(`
        SELECT name, balance, apr, minimum
        FROM debts
      `).all();

      if (!rows.length) {
        return bot.sendMessage(chatId, "No debts recorded.");
      }

      const debts = [...rows].map((row) => ({
        name: String(row.name || ""),
        balance: Number(row.balance) || 0,
        apr: Number(row.apr) || 0,
        minimum: Number(row.minimum) || 0
      }));

      if (mode === "snowball") {
        debts.sort((a, b) => {
          const balanceDiff = a.balance - b.balance;
          if (balanceDiff !== 0) return balanceDiff;
          return b.apr - a.apr;
        });
      } else {
        debts.sort((a, b) => {
          const aprDiff = b.apr - a.apr;
          if (aprDiff !== 0) return aprDiff;
          return a.balance - b.balance;
        });
      }

      const tableRows = debts.map((debt, index) => [
        String(index + 1),
        debt.name,
        formatMoney(debt.balance),
        `${debt.apr.toFixed(2)}%`,
        formatMoney(debt.minimum)
      ]);

      const lines = [
        `💳 *Debt Strategy (${mode})*`,
        "",
        renderTable(
          ["#", "Name", "Balance", "APR", "Minimum"],
          tableRows,
          { aligns: ["right", "left", "right", "right", "right"] }
        )
      ];

      if (mode === "snowball") {
        lines.push("Snowball: smallest balance first for quick wins.");
      } else {
        lines.push("Avalanche: highest APR first to minimize interest.");
      }

      return bot.sendMessage(chatId, lines.join("\n"), {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("debt_strategy error:", err);
      return bot.sendMessage(chatId, "Error calculating strategy.");
    }
  });
};

module.exports.help = {
  command: "debt_strategy",
  category: "Debt",
  summary: "Show the attack order for your debts using either snowball or avalanche.",
  usage: [
    "/debt_strategy <snowball|avalanche>"
  ],
  args: [
    { name: "<snowball|avalanche>", description: "Strategy to use for ordering debts." }
  ],
  examples: [
    "/debt_strategy snowball",
    "/debt_strategy avalanche"
  ],
  notes: [
    "Snowball sorts by smallest balance first.",
    "Avalanche sorts by highest APR first."
  ]
};
