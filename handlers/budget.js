// handlers/budget.js
module.exports = function registerBudgetHandler(bot, deps) {
  const { db } = deps;

  function money(n) {
    return `$${(Number(n) || 0).toFixed(2)}`;
  }

  function normalizeCategory(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (!s) return "";
    return s.startsWith("expenses:") ? s : `expenses:${s}`;
  }

  // /budget
  bot.onText(/^\/budget(@\w+)?$/i, (msg) => {
    const chatId = msg.chat.id;

    try {
      const budgetRows = db.prepare(`
        SELECT category, amount
        FROM budgets
        ORDER BY category
      `).all();

      const budgetMap = new Map();
      for (const r of budgetRows) {
        budgetMap.set(String(r.category), Number(r.amount) || 0);
      }

      const spendRows = db.prepare(`
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

      const allCategories = new Set();
      for (const r of spendRows) allCategories.add(String(r.account));
      for (const c of budgetMap.keys()) allCategories.add(c);

      if (allCategories.size === 0) {
        return bot.sendMessage(chatId, "📒 Budget\n\nNo expense categories or budgets found.");
      }

      const spentMap = new Map();
      for (const r of spendRows) {
        spentMap.set(String(r.account), Number(r.spent) || 0);
      }

      const categories = Array.from(allCategories).sort();

      let totalBudget = 0;
      let totalSpent = 0;

      let out = "📒 Budget vs Actual (30 Days)\n\n";
      out += "```\n";
      out += "Category       Budget    Spent     Left\n";
      out += "---------------------------------------\n";

      for (const acct of categories) {
        const budget = Number(budgetMap.get(acct) || 0);
        const spent = Number(spentMap.get(acct) || 0);
        const left = budget - spent;
        const label = acct.replace("expenses:", "");

        totalBudget += budget;
        totalSpent += spent;

        out += `${label.padEnd(13)} ${money(budget).padStart(8)} ${money(spent).padStart(8)} ${money(left).padStart(8)}\n`;
      }

      out += "---------------------------------------\n";
      out += `${"total".padEnd(13)} ${money(totalBudget).padStart(8)} ${money(totalSpent).padStart(8)} ${money(totalBudget - totalSpent).padStart(8)}\n`;
      out += "```";
      out += "\nSet: /budget_set <category> <amount>";
      out += "\nList: /budget_list";
      out += "\nDelete: /budget_delete <category>";

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("budget error:", err);
      return bot.sendMessage(chatId, "Error generating budget.");
    }
  });

  // /budget_set food 1200
  bot.onText(/^\/budget_set(@\w+)?\s+([a-zA-Z:_-]+)\s+(\d+(\.\d+)?)$/i, (msg, match) => {
    const chatId = msg.chat.id;

    try {
      const category = normalizeCategory(match[2]);
      const amount = Number(match[3]);

      if (!category || !Number.isFinite(amount) || amount < 0) {
        return bot.sendMessage(chatId, "Usage: /budget_set <category> <amount>\nExample: /budget_set food 1200");
      }

      db.prepare(`
        INSERT INTO budgets (category, amount)
        VALUES (?, ?)
        ON CONFLICT(category) DO UPDATE SET amount = excluded.amount
      `).run(category, amount);

      return bot.sendMessage(
        chatId,
        `✅ Budget set\n\n${category}\nAmount: ${money(amount)}`
      );
    } catch (err) {
      console.error("budget_set error:", err);
      return bot.sendMessage(chatId, "Error saving budget.");
    }
  });

  // /budget_list
  bot.onText(/^\/budget_list(@\w+)?$/i, (msg) => {
    const chatId = msg.chat.id;

    try {
      const rows = db.prepare(`
        SELECT category, amount
        FROM budgets
        ORDER BY category
      `).all();

      if (!rows.length) {
        return bot.sendMessage(chatId, "No budgets saved.");
      }

      let out = "📒 Saved Budgets\n\n";
      out += "```\n";
      for (const r of rows) {
        out += `${String(r.category).replace("expenses:", "").padEnd(14)} ${money(r.amount)}\n`;
      }
      out += "```";

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("budget_list error:", err);
      return bot.sendMessage(chatId, "Error listing budgets.");
    }
  });

  // /budget_delete food
  bot.onText(/^\/budget_delete(@\w+)?\s+([a-zA-Z:_-]+)$/i, (msg, match) => {
    const chatId = msg.chat.id;

    try {
      const category = normalizeCategory(match[2]);

      const row = db.prepare(`
        SELECT category, amount
        FROM budgets
        WHERE category = ?
      `).get(category);

      if (!row) {
        return bot.sendMessage(chatId, `Budget not found: ${category}`);
      }

      db.prepare(`
        DELETE FROM budgets
        WHERE category = ?
      `).run(category);

      return bot.sendMessage(
        chatId,
        `🗑️ Budget deleted\n\n${category}\nAmount: ${money(row.amount)}`
      );
    } catch (err) {
      console.error("budget_delete error:", err);
      return bot.sendMessage(chatId, "Error deleting budget.");
    }
  });
};
