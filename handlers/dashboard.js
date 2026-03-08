// handlers/dashboard.js
module.exports = function registerDashboardHandler(bot, deps) {
  const { db, simulateCashflow, ledgerService } = deps;

  function money(n) {
    return `$${(Number(n) || 0).toFixed(2)}`;
  }

  bot.onText(/^\/dashboard(@\w+)?$/, (msg) => {
    const chatId = msg.chat.id;

    try {

      const balances = ledgerService.getBalances();

      let bank = 0;
      let savings = 0;

      for (const b of balances) {
        if (b.account === "assets:bank") bank = Number(b.balance) || 0;
        if (b.account === "assets:savings") savings = Number(b.balance) || 0;
      }

      const debtRow = db.prepare(`
        SELECT IFNULL(SUM(balance),0) as total
        FROM debts
      `).get();

      const debt = Number(debtRow?.total) || 0;
      const networth = bank + savings - debt;

      const checking = db.prepare(`
        SELECT id FROM accounts
        WHERE name='assets:bank'
      `).get();

      const sim = simulateCashflow(db, bank, checking.id, 30);

      const lowest = sim.lowestBalance;

      const endBalance =
        sim.timeline.length
          ? sim.timeline[sim.timeline.length - 1].balance
          : bank;

      let dangerDate = null;

      for (const e of sim.timeline) {
        if (Number(e.balance) === Number(lowest)) {
          dangerDate = e.date;
          break;
        }
      }

      const income = db.prepare(`
        SELECT description, postings_json, next_due_date
        FROM recurring_transactions
      `).all();

      let nextIncome = null;

      for (const r of income) {
        try {
          const postings = JSON.parse(r.postings_json);
          const bankLine = postings.find(p => p.account === "assets:bank");

          if (bankLine && Number(bankLine.amount) > 0) {
            const d = new Date(r.next_due_date);

            if (!nextIncome || d < nextIncome.date) {
              nextIncome = {
                date: d,
                amount: Number(bankLine.amount)
              };
            }
          }
        } catch { }
      }

      let out = "📊 Financial Dashboard\n\n";
      out += "```\n";

      out += `Balance:        ${money(bank)}\n`;
      out += `Savings:        ${money(savings)}\n`;
      out += `Net Worth:      ${money(networth)}\n\n`;

      if (nextIncome) {
        out += `Next Income:    ${money(nextIncome.amount)} (${nextIncome.date.toISOString().slice(0, 10)})\n\n`;
      }

      out += `Lowest Balance: ${money(lowest)}\n`;
      if (dangerDate) {
        out += `Danger Date:    ${dangerDate}\n`;
      }

      out += `End 30 Days:    ${money(endBalance)}\n\n`;

      out += `Debt:           ${money(debt)}\n`;

      out += "```";

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });

    } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, "Dashboard error.");
    }
  });
};
