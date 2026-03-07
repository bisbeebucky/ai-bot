// handlers/best_extra.js
module.exports = function registerBestExtraHandler(bot, deps) {
  const { db } = deps;

  function cloneDebts(rows) {
    return rows.map((r) => ({
      name: r.name,
      balance: Number(r.balance) || 0,
      apr: Number(r.apr) || 0,
      minimum: Number(r.minimum) || 0
    }));
  }

  function sortDebts(debts, mode) {
    if (mode === "snowball") {
      debts.sort((a, b) => {
        const balDiff = a.balance - b.balance;
        if (balDiff !== 0) return balDiff;
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
    return debts.filter((d) => d.balance > 0.005);
  }

  function runSimulation(rows, mode, extra) {
    const debts = cloneDebts(rows);

    const totalMinimums = debts.reduce((sum, d) => sum + d.minimum, 0);
    const monthlyBudget = totalMinimums + extra;

    if (monthlyBudget <= 0) {
      return { months: null, interest: null };
    }

    let months = 0;
    let totalInterest = 0;

    while (activeDebts(debts).length > 0 && months < 1200) {
      months += 1;

      for (const d of debts) {
        if (d.balance <= 0.005) continue;

        const monthlyRate = d.apr / 100 / 12;
        const interest = d.balance * monthlyRate;
        d.balance += interest;
        totalInterest += interest;
      }

      const remaining = activeDebts(debts);
      sortDebts(remaining, mode);

      let paymentPool = monthlyBudget;

      for (const d of remaining) {
        if (paymentPool <= 0) break;

        const minPay = Math.min(d.minimum, d.balance, paymentPool);
        d.balance -= minPay;
        paymentPool -= minPay;
      }

      let targets = activeDebts(debts);
      sortDebts(targets, mode);

      while (paymentPool > 0 && targets.length > 0) {
        const target = targets[0];
        const pay = Math.min(target.balance, paymentPool);
        target.balance -= pay;
        paymentPool -= pay;

        targets = activeDebts(debts);
        sortDebts(targets, mode);
      }

      for (const d of debts) {
        if (d.balance < 0.005) d.balance = 0;
      }
    }

    if (months >= 1200) {
      return { months: null, interest: null };
    }

    return {
      months,
      interest: totalInterest
    };
  }

  bot.onText(
    /^\/best_extra(?:\s+(\d+(\.\d+)?)\s+(\d+(\.\d+)?)\s+(\d+(\.\d+)?))?$/i,
    (msg, match) => {
      const chatId = msg.chat.id;

      try {
        const start = match[1] ? Number(match[1]) : 100;
        const end = match[3] ? Number(match[3]) : 500;
        const step = match[5] ? Number(match[5]) : 100;

        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          !Number.isFinite(step) ||
          start < 0 ||
          end < start ||
          step <= 0
        ) {
          return bot.sendMessage(
            chatId,
            "Usage: /best_extra [start end step]\nExample: /best_extra 100 500 100"
          );
        }

        const rows = db.prepare(`
          SELECT name, balance, apr, minimum
          FROM debts
        `).all();

        if (!rows.length) {
          return bot.sendMessage(chatId, "No debts recorded.");
        }

        const points = [];

        for (let extra = start; extra <= end + 0.0001; extra += step) {
          const snow = runSimulation(rows, "snowball", extra);
          const ava = runSimulation(rows, "avalanche", extra);

          if (
            snow.months == null || snow.interest == null ||
            ava.months == null || ava.interest == null
          ) {
            continue;
          }

          points.push({
            extra,
            snowMonths: snow.months,
            snowInterest: snow.interest,
            avaMonths: ava.months,
            avaInterest: ava.interest,
            avgMonths: (snow.months + ava.months) / 2,
            avgInterest: (snow.interest + ava.interest) / 2
          });
        }

        if (points.length < 2) {
          return bot.sendMessage(chatId, "Need at least two valid extra-payment points to compare.");
        }

        let bestTimeJump = null;
        let bestInterestJump = null;

        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1];
          const curr = points[i];

          const extraDelta = curr.extra - prev.extra;
          const monthsSaved = prev.avgMonths - curr.avgMonths;
          const interestSaved = prev.avgInterest - curr.avgInterest;

          const monthsPerDollar = extraDelta > 0 ? monthsSaved / extraDelta : 0;
          const interestPerDollar = extraDelta > 0 ? interestSaved / extraDelta : 0;

          const jump = {
            from: prev.extra,
            to: curr.extra,
            extraDelta,
            monthsSaved,
            interestSaved,
            monthsPerDollar,
            interestPerDollar
          };

          if (!bestTimeJump || jump.monthsSaved > bestTimeJump.monthsSaved) {
            bestTimeJump = jump;
          }

          if (!bestInterestJump || jump.interestPerDollar > bestInterestJump.interestPerDollar) {
            bestInterestJump = jump;
          }
        }

        // diminishing returns:
        // first interval where months saved drops below half of the best interval
        let diminishingAt = null;
        if (bestTimeJump && bestTimeJump.monthsSaved > 0) {
          const threshold = bestTimeJump.monthsSaved * 0.5;

          for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const monthsSaved = prev.avgMonths - curr.avgMonths;

            if (monthsSaved < threshold) {
              diminishingAt = curr.extra;
              break;
            }
          }
        }

        let out = "🎯 Best Extra Payment\n\n";
        out += "```\n";
        out += `Range:                $${start.toFixed(0)} → $${end.toFixed(0)} step $${step.toFixed(0)}\n`;

        if (bestTimeJump) {
          out += `Best Time Jump:       $${bestTimeJump.from.toFixed(0)} → $${bestTimeJump.to.toFixed(0)}\n`;
          out += `Months Saved:         ${bestTimeJump.monthsSaved.toFixed(1)}\n`;
        }

        if (bestInterestJump) {
          out += `Best Interest Value:  $${bestInterestJump.from.toFixed(0)} → $${bestInterestJump.to.toFixed(0)}\n`;
          out += `Interest Saved:       $${bestInterestJump.interestSaved.toFixed(2)}\n`;
          out += `Interest/$100 Extra:  $${(bestInterestJump.interestPerDollar * 100).toFixed(2)}\n`;
        }

        if (diminishingAt != null) {
          out += `Diminishing Returns:  around $${diminishingAt.toFixed(0)} extra\n`;
        } else {
          out += `Diminishing Returns:  not reached in tested range\n`;
        }

        out += "```";

        let summary = "";
        if (bestTimeJump) {
          summary += `Biggest payoff-time improvement is from $${bestTimeJump.from.toFixed(0)} to $${bestTimeJump.to.toFixed(0)}. `;
        }
        if (diminishingAt != null) {
          summary += `Returns start flattening around $${diminishingAt.toFixed(0)} extra.`;
        }

        return bot.sendMessage(chatId, out + "\n" + summary, {
          parse_mode: "Markdown"
        });
      } catch (err) {
        console.error("best_extra error:", err);
        return bot.sendMessage(chatId, "Error analyzing best extra payment.");
      }
    }
  );
};
