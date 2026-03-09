// handlers/focus.js
module.exports = function registerFocusHandler(bot, deps) {
  const { db, simulateCashflow, ledgerService, format } = deps;
  const { formatMoney, codeBlock } = format;

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

  function getRecurringMonthlyNet() {
    const rows = db.prepare(`
      SELECT postings_json, frequency
      FROM recurring_transactions
    `).all();

    let income = 0;
    let bills = 0;

    for (const row of rows) {
      try {
        const postings = JSON.parse(row.postings_json);
        const bankLine = Array.isArray(postings)
          ? postings.find((p) => p.account === "assets:bank")
          : null;

        if (!bankLine) continue;

        const amt = Number(bankLine.amount) || 0;
        const monthly = Math.abs(amt) * monthlyMultiplier(row.frequency);

        if (amt > 0) income += monthly;
        if (amt < 0) bills += monthly;
      } catch {
        // ignore malformed recurring rows
      }
    }

    return income - bills;
  }

  function getDebtRows() {
    return db.prepare(`
      SELECT name, balance, apr, minimum
      FROM debts
    `).all().map((row) => ({
      name: String(row.name || ""),
      balance: Number(row.balance) || 0,
      apr: Number(row.apr) || 0,
      minimum: Number(row.minimum) || 0
    }));
  }

  function findTargetDebt(debtRows) {
    if (!debtRows.length) return null;

    const sorted = [...debtRows].sort((a, b) => {
      const aprDiff = b.apr - a.apr;
      if (aprDiff !== 0) return aprDiff;
      return a.balance - b.balance;
    });

    return sorted[0];
  }

  function renderHelp() {
    return [
      "*\\/focus*",
      "Show the most important financial priority right now, based on cash risk, debt, savings, and recurring surplus.",
      "",
      "*Usage*",
      "- `/focus`",
      "",
      "*Examples*",
      "- `/focus`",
      "",
      "*Notes*",
      "- Protects cash first if the 30-day forecast gets low or negative.",
      "- Otherwise prioritizes high-APR debt, emergency savings, or wealth building."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/focus(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/focus` command does not take arguments.",
          "",
          "Usage:",
          "`/focus`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    try {
      const balances = ledgerService.getBalances();

      let bank = 0;
      let savings = 0;

      for (const balance of balances) {
        if (balance.account === "assets:bank") bank = Number(balance.balance) || 0;
        if (balance.account === "assets:savings") savings = Number(balance.balance) || 0;
      }

      const checking = db.prepare(`
        SELECT id
        FROM accounts
        WHERE name = 'assets:bank'
      `).get();

      if (!checking) {
        return bot.sendMessage(chatId, "Checking account not found.");
      }

      const sim = simulateCashflow(db, bank, checking.id, 30);
      const lowest = Number(sim?.lowestBalance) || 0;

      const debtRows = getDebtRows();
      const targetDebt = findTargetDebt(debtRows);
      const totalDebt = debtRows.reduce((sum, debt) => sum + debt.balance, 0);
      const monthlyNet = getRecurringMonthlyNet();

      let focus;
      let tip;

      if (lowest < 0) {
        focus = "Protect cash immediately and avoid overdraft.";
        tip = "Pause extra debt payments and delay discretionary spending.";
      } else if (lowest < 100) {
        focus = "Protect cash until payday.";
        tip = "Keep spending minimal until your next income lands.";
      } else if (totalDebt > 0 && monthlyNet > 0 && targetDebt) {
        focus = `Attack ${targetDebt.name} first (${targetDebt.apr}% APR).`;
        tip = "Every extra dollar paid toward high APR debt reduces future interest.";
      } else if (savings < 1000) {
        focus = "Build emergency savings to $1,000.";
        tip = "A small cash buffer protects you from unexpected expenses.";
      } else if (monthlyNet > 0) {
        focus = "Keep growing wealth with your monthly surplus.";
        tip = "Consistency matters more than timing when building wealth.";
      } else {
        focus = "Stabilize cashflow before making bigger moves.";
        tip = "Review recurring expenses and reduce unnecessary spending.";
      }

      const lines = [
        "🎯 *Focus*",
        "",
        focus
      ];

      if (tip) {
        lines.push("");
        lines.push(`Tip: ${tip}`);
      }

      lines.push("");
      lines.push(codeBlock([
        `Bank Balance     ${formatMoney(bank)}`,
        `Savings          ${formatMoney(savings)}`,
        `30d Low Point    ${formatMoney(lowest)}`,
        `Monthly Net      ${monthlyNet >= 0 ? "+" : "-"}${formatMoney(Math.abs(monthlyNet))}`,
        `Total Debt       ${formatMoney(totalDebt)}`
      ].join("\n")));

      if (targetDebt && totalDebt > 0 && lowest >= 100) {
        lines.push("");
        lines.push(
          `Top debt target: \`${targetDebt.name}\` • \`${formatMoney(targetDebt.balance)}\` • \`${targetDebt.apr}% APR\``
        );
      }

      return bot.sendMessage(chatId, lines.join("\n"), {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("focus error:", err);
      return bot.sendMessage(chatId, "Error generating focus.");
    }
  });
};

module.exports.help = {
  command: "focus",
  category: "Reporting",
  summary: "Show the most important financial priority right now, based on cash risk, debt, savings, and recurring surplus.",
  usage: [
    "/focus"
  ],
  examples: [
    "/focus"
  ],
  notes: [
    "Protects cash first if the 30-day forecast gets low or negative.",
    "Otherwise prioritizes high-APR debt, emergency savings, or wealth building."
  ]
};
