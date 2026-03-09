// handlers/debt_sim.js
module.exports = function registerDebtSimHandler(bot, deps) {
  const { db, format } = deps;
  const { formatMoney, renderTable, codeBlock } = format;

  function cloneDebts(rows) {
    return rows.map((row) => ({
      name: String(row.name || ""),
      balance: Number(row.balance) || 0,
      apr: Number(row.apr) || 0,
      minimum: Number(row.minimum) || 0,
      interestPaid: 0
    }));
  }

  function sortDebts(debts, mode) {
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
  }

  function activeDebts(debts) {
    return debts.filter((debt) => debt.balance > 0.005);
  }

  function renderHelp() {
    return [
      "*\\/debt_sim*",
      "Simulate debt payoff over time using snowball or avalanche with an extra monthly payment.",
      "",
      "*Usage*",
      "- `/debt_sim <snowball|avalanche> <extra>`",
      "",
      "*Arguments*",
      "- `<snowball|avalanche>` — Strategy to simulate.",
      "- `<extra>` — Extra monthly payment on top of minimums. Must be zero or greater.",
      "",
      "*Examples*",
      "- `/debt_sim snowball 200`",
      "- `/debt_sim avalanche 400`",
      "",
      "*Notes*",
      "- Interest accrues monthly using each debt APR.",
      "- Simulation stops after payoff or a 100-year safety cap."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/debt_sim(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
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
            "Missing or invalid arguments for `/debt_sim`.",
            "",
            "Usage:",
            "`/debt_sim <snowball|avalanche> <extra>`",
            "",
            "Example:",
            "`/debt_sim avalanche 250`"
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
            "`/debt_sim <snowball|avalanche> <extra>`"
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

      const debts = cloneDebts(rows);
      const originalTotalDebt = debts.reduce((sum, debt) => sum + debt.balance, 0);
      const totalMinimums = debts.reduce((sum, debt) => sum + debt.minimum, 0);
      const monthlyBudget = totalMinimums + extra;

      if (monthlyBudget <= 0) {
        return bot.sendMessage(chatId, "Monthly debt budget must be greater than 0.");
      }

      let months = 0;
      let totalInterest = 0;
      const payoffMoments = [];

      while (activeDebts(debts).length > 0 && months < 1200) {
        months += 1;

        for (const debt of debts) {
          if (debt.balance <= 0.005) continue;

          const monthlyRate = debt.apr / 100 / 12;
          const interest = debt.balance * monthlyRate;
          debt.balance += interest;
          debt.interestPaid += interest;
          totalInterest += interest;
        }

        const remaining = activeDebts(debts);
        sortDebts(remaining, mode);

        let paymentPool = monthlyBudget;

        for (const debt of remaining) {
          if (paymentPool <= 0) break;

          const minPay = Math.min(debt.minimum, debt.balance, paymentPool);
          debt.balance -= minPay;
          paymentPool -= minPay;
        }

        let targets = activeDebts(debts);
        sortDebts(targets, mode);

        while (paymentPool > 0 && targets.length > 0) {
          const target = targets[0];
          const payment = Math.min(target.balance, paymentPool);
          target.balance -= payment;
          paymentPool -= payment;

          targets = activeDebts(debts);
          sortDebts(targets, mode);
        }

        for (const debt of debts) {
          if (debt.balance <= 0.005 && !payoffMoments.some((p) => p.name === debt.name)) {
            debt.balance = 0;
            payoffMoments.push({ name: debt.name, month: months });
          }
        }
      }

      if (months >= 1200) {
        return bot.sendMessage(
          chatId,
          "Simulation exceeded safe limit. Budget may be too low to pay off debts."
        );
      }

      const payoffRows = payoffMoments.map((item, index) => [
        String(index + 1),
        item.name,
        `month ${item.month}`
      ]);

      const lines = [
        `💳 *Debt Simulation (${mode})*`,
        "",
        codeBlock([
          `Starting Debt      ${formatMoney(originalTotalDebt)}`,
          `Minimum Payments   ${formatMoney(totalMinimums)}`,
          `Extra Payment      ${formatMoney(extra)}`,
          `Monthly Budget     ${formatMoney(monthlyBudget)}`,
          `Months to Payoff   ${months}`,
          `Interest Paid      ${formatMoney(totalInterest)}`
        ].join("\n"))
      ];

      if (payoffRows.length) {
        lines.push(
          renderTable(
            ["#", "Debt", "Paid Off"],
            payoffRows,
            { aligns: ["right", "left", "right"] }
          )
        );
      }

      if (mode === "snowball") {
        lines.push("Snowball favors momentum: smallest balance first.");
      } else {
        lines.push("Avalanche favors math: highest APR first.");
      }

      return bot.sendMessage(chatId, lines.join("\n"), {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("debt_sim error:", err);
      return bot.sendMessage(chatId, "Error running debt simulation.");
    }
  });
};

module.exports.help = {
  command: "debt_sim",
  category: "Debt",
  summary: "Simulate debt payoff over time using snowball or avalanche with an extra monthly payment.",
  usage: [
    "/debt_sim <snowball|avalanche> <extra>"
  ],
  args: [
    { name: "<snowball|avalanche>", description: "Strategy to simulate." },
    { name: "<extra>", description: "Extra monthly payment on top of minimums. Must be zero or greater." }
  ],
  examples: [
    "/debt_sim snowball 200",
    "/debt_sim avalanche 400"
  ],
  notes: [
    "Interest accrues monthly using each debt APR.",
    "Simulation stops after payoff or a 100-year safety cap."
  ]
};
