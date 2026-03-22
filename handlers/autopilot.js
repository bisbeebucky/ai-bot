// handlers/autopilot.js
module.exports = function registerAutopilotHandler(bot, deps) {
  const { db, simulateCashflow, format, finance, debt } = deps;
  const { formatMoney } = format;
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
      "Give a plain-English recommendation for what to focus on next.",
      "",
      "*Usage*",
      "- `/autopilot`",
      "",
      "*Examples*",
      "- `/autopilot`",
      "",
      "*Notes*",
      "- Prioritizes cash defense first, then debt payoff, then emergency savings, then long-term growth.",
      "- Keeps the answer short and action-oriented."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  function formatNextCommands(commands) {
    if (!commands.length) return [];
    return [
      "",
      "*Try next*",
      commands.map((cmd) => `• \`${cmd}\``).join("\n")
    ];
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
      const bank = Number(starting.bank) || 0;
      const savings = Number(starting.savings) || 0;

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

      const debtRows = getDebtRows(db);
      const targetDebt = findTargetDebt(debtRows);
      const debtTotal = debtRows.reduce((sum, d) => sum + (Number(d.balance) || 0), 0);

      const recurring = getRecurringMonthlyNet(db);
      const monthlyNet = Number(recurring?.net) || 0;

      const recommendedExtra = chooseBestExtra(
        debtRows,
        monthlyNet,
        lowest,
        savings
      );

      let lines = ["🤖 *Autopilot*", ""];

      if (lowest < 0) {
        lines.push(
          "You need to protect cash right now.",
          "",
          `Your projected low point is \`${formatMoney(lowest)}\`, so your current plan could go negative before the next income lands.`,
          "",
          "*Best move*",
          "Pause extra debt payments, cut optional spending, and keep as much cash as possible in checking.",
          "",
          "*Watch for*",
          "The stretch before your next income is the danger zone. Focus on staying above zero."
        );

        lines.push(...formatNextCommands(["/untilpayday", "/why", "/whatif"]));
      } else if (lowest < 100) {
        lines.push(
          "You are still okay, but your buffer is thin.",
          "",
          `Your forecast stays positive, but your projected low point is only \`${formatMoney(lowest)}\`.`,
          "",
          "*Best move*",
          "Keep cash in checking and avoid extra discretionary spending until your next income lands.",
          "",
          "*Watch for*",
          "One surprise expense could turn this into an overdraft risk."
        );

        lines.push(...formatNextCommands(["/untilpayday", "/why", "/whatif"]));
      } else if (debtTotal > 0 && monthlyNet > 0) {
        if (targetDebt && recommendedExtra) {
          lines.push(
            "You can safely push harder on debt right now.",
            "",
            `You have \`${formatMoney(debtTotal)}\` in debt, your monthly cashflow is positive at \`${monthlyNet >= 0 ? "+" : "-"}${formatMoney(Math.abs(monthlyNet))}\`, and your 30-day low stays around \`${formatMoney(lowest)}\`.`,
            "",
            `Right now, *${targetDebt.name}* looks like the best debt to target because it has the highest APR at *${targetDebt.apr}%*.`,
            "",
            "*Best move*",
            `Put about \`${formatMoney(recommendedExtra)}\` extra per month toward *${targetDebt.name}*.`,
            "",
            "*Watch for*",
            "If your projected low balance starts shrinking, scale that extra payment back for a while."
          );
        } else if (targetDebt) {
          lines.push(
            "You can safely focus on debt reduction right now.",
            "",
            `Your cashflow is positive and your short-term buffer looks stable enough to keep pushing.`,
            "",
            `Right now, *${targetDebt.name}* looks like the best debt to target because it has the highest APR at *${targetDebt.apr}%*.`,
            "",
            "*Best move*",
            `Direct extra money toward *${targetDebt.name}* while keeping an eye on your checking buffer.`,
            "",
            "*Watch for*",
            "If your 30-day low starts slipping, ease off the extra payment."
          );
        } else {
          lines.push(
            "You can safely focus on debt reduction right now.",
            "",
            `You have debt, positive recurring cashflow, and enough short-term buffer to start making progress.`,
            "",
            "*Best move*",
            "Direct your available surplus toward your highest-APR debt.",
            "",
            "*Watch for*",
            "If your projected low balance gets tight, slow down and protect cash first."
          );
        }

        lines.push(...formatNextCommands(["/best_extra", "/debt_compare_range_graph", "/forecast_graph"]));
      } else if (savings < 1000) {
        lines.push(
          "Build a little more safety before getting aggressive.",
          "",
          `Your short-term risk looks controlled, but savings are still only \`${formatMoney(savings)}\`, which is a thin emergency buffer.`,
          "",
          "*Best move*",
          "Build your starter emergency fund before making bigger long-term moves.",
          "",
          "*Watch for*",
          "The goal now is steady savings growth without creating stress in checking."
        );

        lines.push(...formatNextCommands(["/emergency_fund", "/status", "/forecast_graph"]));
      } else {
        lines.push(
          "Your near-term picture looks stable enough to think beyond survival mode.",
          "",
          `Cashflow is positive, short-term risk looks controlled, and debt pressure appears low enough to shift attention toward longer-term growth.`,
          "",
          "*Best move*",
          "Keep saving or investing your monthly surplus toward longer-term goals.",
          "",
          "*Watch for*",
          "Make sure your monthly net stays positive and your forecast remains stable."
        );

        lines.push(...formatNextCommands(["/rich", "/future_graph", "/forecast_graph"]));
      }

      lines.push(
        "",
        "*Recheck*",
        "Run `/autopilot` again after your next income lands or if your balance changes."
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
  summary: "Give a plain-English recommendation for what to focus on next.",
  usage: [
    "/autopilot"
  ],
  examples: [
    "/autopilot"
  ],
  notes: [
    "Prioritizes cash defense first, then debt payoff, then emergency savings, then long-term growth.",
    "Keeps the answer short and action-oriented."
  ]
};
