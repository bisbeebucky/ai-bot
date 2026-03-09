// handlers/debt_plan.js
module.exports = function registerDebtPlanHandler(bot, deps) {
  const { db, format } = deps;
  const { formatMoney, renderTable, codeBlock } = format;

  function renderHelp() {
    return [
      "*\\/debt_plan*",
      "Show a debt payoff plan using snowball or avalanche with an extra monthly payment.",
      "",
      "*Usage*",
      "- `/debt_plan <snowball|avalanche> <extra>`",
      "",
      "*Arguments*",
      "- `<snowball|avalanche>` — Strategy to use.",
      "- `<extra>` — Extra monthly payment on top of minimums. Must be zero or greater.",
      "",
      "*Examples*",
      "- `/debt_plan snowball 200`",
      "- `/debt_plan avalanche 350.50`",
      "",
      "*Notes*",
      "- Minimum payments are applied to all debts.",
      "- Extra goes to the first debt in the ordered list."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/debt_plan(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (!raw || /^(help|--help|-h)$/i.test(raw)) {
      return sendHelp(chatId);
    }

    try {
      const parsed = raw.match(/^(snowball|avalanche)\s+(-?\d+(?:\.\d+)?)$/i);

      if (!parsed) {
        return bot.sendMessage(
          chatId,
          [
            "Missing or invalid arguments for `/debt_plan`.",
            "",
            "Usage:",
            "`/debt_plan <snowball|avalanche> <extra>`",
            "",
            "Example:",
            "`/debt_plan avalanche 200`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const mode = String(parsed[1] || "").toLowerCase();
      const extra = Number(parsed[2]);

      if (!Number.isFinite(extra) || extra < 0) {
        return bot.sendMessage(
          chatId,
          [
            "Extra payment must be zero or greater.",
            "",
            "Usage:",
            "`/debt_plan <snowball|avalanche> <extra>`"
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

      const debts = rows.map((row) => ({
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

      let totalDebt = 0;
      let totalMinimum = 0;

      for (const debt of debts) {
        totalDebt += debt.balance;
        totalMinimum += debt.minimum;
      }

      const totalMonthlyPayment = totalMinimum + extra;
      const target = debts[0];

      const tableRows = debts.map((debt, index) => [
        String(index + 1),
        debt.name,
        formatMoney(debt.balance),
        `${debt.apr.toFixed(2)}%`,
        formatMoney(debt.minimum),
        index === 0 ? "<= extra first" : ""
      ]);

      const lines = [
        `💳 *Debt Plan (${mode})*`,
        "",
        codeBlock([
          `Total Debt            ${formatMoney(totalDebt)}`,
          `Total Minimums        ${formatMoney(totalMinimum)}`,
          `Extra Payment         ${formatMoney(extra)}`,
          `Monthly Debt Budget   ${formatMoney(totalMonthlyPayment)}`,
          `Attack First          ${target.name}`
        ].join("\n")),
        renderTable(
          ["#", "Name", "Balance", "APR", "Minimum", "Note"],
          tableRows,
          { aligns: ["right", "left", "right", "right", "right", "left"] }
        )
      ];

      if (mode === "snowball") {
        lines.push("Pay minimums on all debts, then put all extra toward the smallest balance first.");
      } else {
        lines.push("Pay minimums on all debts, then put all extra toward the highest APR first.");
      }

      return bot.sendMessage(chatId, lines.join("\n"), {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("debt_plan error:", err);
      return bot.sendMessage(chatId, "Error calculating debt plan.");
    }
  });
};

module.exports.help = {
  command: "debt_plan",
  category: "Debt",
  summary: "Show a debt payoff plan using snowball or avalanche with an extra monthly payment.",
  usage: [
    "/debt_plan <snowball|avalanche> <extra>"
  ],
  args: [
    { name: "<snowball|avalanche>", description: "Strategy to use." },
    { name: "<extra>", description: "Extra monthly payment on top of minimums. Must be zero or greater." }
  ],
  examples: [
    "/debt_plan snowball 200",
    "/debt_plan avalanche 350.50"
  ],
  notes: [
    "Minimum payments are applied to all debts.",
    "Extra goes to the first debt in the ordered list."
  ]
};
