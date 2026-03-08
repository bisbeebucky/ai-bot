// handlers/budget.js
module.exports = function registerBudgetHandler(bot, deps) {
  const { db } = deps;

  // Edit these to match your life
  const BUDGETS = {
    "expenses:food": 1000,
    "expenses:misc": 100,
    "expenses:recurring": 100,
    "expenses:rent": 427
  };

  function money(n) {
    return `$${(Number(n) || 0).toFixed(2)}`;
  }

  bot.onText(/^\/budget(@\w+)?$/i, (msg) => {
    const chatId = msg.chat.id;

    try {
      const rows = db.prepare(`
        SELECT a.name as account,
               ABS(IFNULL(SUM(p.amount), 0)) as spent
        FROM accounts a
        LEFT JOIN postings p ON p.account_id = a.id
        LEFT JOIN transactions t ON p.transaction_id = t.id
        WHERE a.name LIKE 'expenses:%'
          AND (
            t.date IS NULL OR
            date(t.date) >= date('now','-30 day')
          )
        GROUP BY a.name
        ORDER BY a.name
      `).all();

      const seen = new Set();
      let out = "📒 Budget vs Actual (30 Days)\n\n";
      out += "```\n";
      out += "Category       Budget    Spent    Left\n";
      out += "--------------------------------------\n";

      let totalBudget = 0;
      let totalSpent = 0;

      for (const r of rows) {
        const acct = String(r.account || "");
        const spent = Number(r.spent) || 0;
        const budget = Number(BUDGETS[acct] || 0);
        const left = budget - spent;
        const label = acct.replace("expenses:", "");

        seen.add(acct);
        totalBudget += budget;
        totalSpent += spent;

        out += `${label.padEnd(13)} ${money(budget).padStart(8)} ${money(spent).padStart(8)} ${money(left).padStart(8)}\n`;
      }

      // Include budget categories that have no spending yet
      for (const acct of Object.keys(BUDGETS)) {
        if (seen.has(acct)) continue;

        const budget = Number(BUDGETS[acct] || 0);
        const spent = 0;
        const left = budget;
        const label = acct.replace("expenses:", "");

        totalBudget += budget;

        out += `${label.padEnd(13)} ${money(budget).padStart(8)} ${money(spent).padStart(8)} ${money(left).padStart(8)}\n`;
      }

      out += "--------------------------------------\n";
      out += `${"total".padEnd(13)} ${money(totalBudget).padStart(8)} ${money(totalSpent).padStart(8)} ${money(totalBudget - totalSpent).padStart(8)}\n`;
      out += "```";

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("budget error:", err);
      return bot.sendMessage(chatId, "Error generating budget.");
    }
  });
};
