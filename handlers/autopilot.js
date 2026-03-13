// handlers/autopilot.js
module.exports = function registerAutopilotHandler(bot, deps) {
  const { db, simulateCashflow, format, finance, debt } = deps;
  const { formatMoney, codeBlock } = format;
  const {
    getStartingAssets,
    getRecurringMonthlyNet,
    getDebtRows
  } = finance;
  const { runDebtSimulation } = debt;

  function chooseBestExtra(debtRows, monthlyNet, lowestAhead, savings) {
    if (!debtRows.length || monthlyNet <= 0) return null;

    let safeCap = monthlyNet;

    if (lowestAhead < 100) {
      safeCap = Math.min(safeCap, 0);
    } else if (lowestAhead < 250) {
      safeCap = Math.min(safeCap, 100);
    } else if (lowestAhead < 500) {
      safeCap = Math.min(safeCap, 200);
    } else if (savings < 250) {
      safeCap = Math.min(safeCap, 200);
    } else {
      safeCap = Math.min(safeCap, 500);
    }

    if (safeCap < 50) return null;

    const start = 50;
    const step = 50;
    const end = Math.max(start, Math.floor(safeCap / step) * step);

    const points = [];
    for (let extra = start; extra <= end; extra += step) {
      const ava = runDebtSimulation(debtRows, "avalanche", extra);
      if (ava.months == null || ava.interest == null) continue;

      points.push({
        extra,
        months: ava.months,
        interest: ava.interest
      });
    }

    if (points.length === 0) return null;
    if (points.length === 1) return points[0].extra;

    let bestJump = null;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      const monthsSaved = prev.months - curr.months;
      const interestSaved = prev.interest - curr.interest;
      const score = (monthsSaved * 100) + (interestSaved / 10);

      const jump = {
        from: prev.extra,
        to: curr.extra,
        monthsSaved,
        interestSaved,
        score
      };

      if (!bestJump || jump.score > bestJump.score) {
        bestJump = jump;
      }
    }

    return bestJump ? bestJump.to : points[0].extra;
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
      "*\\/autopilot*",
      "AI financial recommendation engine.",
      "",
      "*Usage*",
      "- `/autopilot`",
      "",
      "*Examples*",
      "- `/autopilot`",
      "",
      "*Notes*",
      "- Prioritizes cash defense first, then debt payoff, then emergency savings, then long-term growth.",
      "- Explains why the recommendation was chosen and what to do next."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/autopilot(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/autopilot` command does not take arguments.",
          "",
          "Usage:",
          "`/autopilot`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    try {
      const starting = getStartingAssets(deps.ledgerService);
      const bank = starting.bank;
      const savings = starting.savings;

      const checking = db.prepare(`
        SELECT id
        FROM accounts
        WHERE name = 'assets:bank'
      `).get();

      if (!checking) {
        return bot.sendMessage(chatId, "Checking account not found.");
      }

      const sim = simulateCashflow(db, bank, checking.id, 30);
      const lowest = Number(sim.lowestBalance) || 0;

      const debtRows = getDebtRows(db);
      const targetDebt = findTargetDebt(debtRows);
      const debtTotal = debtRows.reduce((sum, d) => sum + d.balance, 0);

      const recurring = getRecurringMonthlyNet(db);
      const monthlyNet = recurring.net;

      const recommendedExtra = chooseBestExtra(
        debtRows,
        monthlyNet,
        lowest,
        savings
      );

      let mode;
      let confidence;
      let headline;
      let why;
      let doNow;
      let watchNext;
      let nextCommands = [];

      if (lowest < 0) {
        mode = "Emergency Cash Defense";
        confidence = "High";
        headline = "🧠 You need to protect cash immediately.";
        why = `Your projected lowest balance is ${formatMoney(lowest)}, which means your current plan is likely to go negative before the next income arrives.`;
        doNow = "Pause extra debt payments, cut discretionary spending, and keep as much cash as possible in checking.";
        watchNext = "The danger window before your next income is the main risk. Focus on staying above zero until payday.";
        nextCommands = ["/danger", "/untilpayday", "/caniafford"];
      } else if (lowest < 100) {
        mode = "Preserve Cash";
        confidence = "Medium";
        headline = "🧠 You are okay, but your cash buffer is thin.";
        why = `Your forecast stays positive, but the projected lowest balance is only ${formatMoney(lowest)} before the next income.`;
        doNow = "Avoid extra discretionary spending and keep cash in checking until your next income lands.";
        watchNext = "A small unexpected expense could turn this into a risk window. Recheck after the next paycheck.";
        nextCommands = ["/untilpayday", "/danger", "/caniafford"];
      } else if (debtTotal > 0 && monthlyNet > 0) {
        mode = "Attack Debt";
        confidence = recommendedExtra ? "High" : "Medium";

        if (targetDebt && recommendedExtra) {
          headline = "🧠 Your cashflow is strong enough to make real progress on debt.";
          why = `You have ${formatMoney(debtTotal)} in debt, positive recurring cashflow, and enough short-term buffer to safely accelerate payoff. The best current target is ${targetDebt.name} at ${targetDebt.apr}% APR.`;
          doNow = `Direct extra money toward ${targetDebt.name}. A good next step is about ${formatMoney(recommendedExtra)} per month in additional payment.`;
        } else if (targetDebt) {
          headline = "🧠 You can safely focus on debt reduction right now.";
          why = `You have ${formatMoney(debtTotal)} in debt and positive recurring cashflow. Your highest-priority target is ${targetDebt.name} at ${targetDebt.apr}% APR.`;
          doNow = `Direct available surplus toward ${targetDebt.name} and keep monitoring your short-term cash buffer.`;
        } else {
          headline = "🧠 You can safely focus on debt reduction right now.";
          why = `You have debt and positive recurring cashflow, and your short-term forecast is stable enough to support extra payoff.`;
          doNow = "Direct available surplus toward your highest APR debt.";
        }

        watchNext = "Keep an eye on your 30-day minimum balance. If your buffer starts shrinking, reduce the extra payment temporarily.";
        nextCommands = ["/best_extra", "/debt_compare_range_graph", "/forecast_graph"];
      } else if (savings < 1000) {
        mode = "Build Emergency Fund";
        confidence = "Medium";
        headline = "🧠 Build a little more safety before getting aggressive.";
        why = `Your short-term risk is controlled, but savings are only ${formatMoney(savings)}, which is still a thin emergency buffer.`;
        doNow = "Build your starter emergency fund before making aggressive long-term moves.";
        watchNext = "The main thing to watch is whether you can keep savings growing without creating new checking stress.";
        nextCommands = ["/emergency_fund", "/status", "/forecast_graph"];
      } else {
        mode = "Grow Wealth";
        confidence = "Medium";
        headline = "🧠 Your near-term picture looks stable enough to think beyond survival mode.";
        why = "Cashflow is positive, short-term risk is controlled, and debt pressure appears low enough to shift attention toward longer-term growth.";
        doNow = "Keep saving or investing your monthly surplus toward long-term goals.";
        watchNext = "Monitor whether your monthly net stays positive and whether your short-term forecast remains stable.";
        nextCommands = ["/rich", "/future_graph", "/forecast_graph"];
      }

      const lines = [
        "🤖 *Autopilot*",
        "",
        headline,
        "",
        codeBlock([
          `Mode         ${mode}`,
          `Confidence   ${confidence}`,
          `Bank         ${formatMoney(bank)}`,
          `Savings      ${formatMoney(savings)}`,
          `Debt         ${formatMoney(debtTotal)}`,
          `Monthly Net  ${monthlyNet >= 0 ? "+" : "-"}${formatMoney(Math.abs(monthlyNet))}`,
          `Lowest Ahead ${formatMoney(lowest)}`,
          ...(recommendedExtra ? [`Best Extra   ${formatMoney(recommendedExtra)}`] : [])
        ].join("\n")),
        `*Why*`,
        why,
        "",
        `*Do now*`,
        doNow,
        "",
        `*Watch next*`,
        watchNext
      ];

      if (nextCommands.length) {
        lines.push(
          "",
          `*Next commands*`,
          nextCommands.join("  ")
        );
      }

      lines.push(
        "",
        `*Next review*`,
        "Re-run `/autopilot` after your next income lands or if your balance changes."
      );

      return bot.sendMessage(chatId, lines.join("\n"), {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("autopilot error:", err);
      return bot.sendMessage(chatId, "Autopilot error.");
    }
  });
};

module.exports.help = {
  command: "autopilot",
  category: "General",
  summary: "AI financial recommendation engine.",
  usage: [
    "/autopilot"
  ],
  examples: [
    "/autopilot"
  ],
  notes: [
    "Prioritizes cash defense first, then debt payoff, then emergency savings, then long-term growth.",
    "Explains why the recommendation was chosen and what to do next."
  ]
};
