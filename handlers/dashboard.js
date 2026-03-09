// handlers/dashboard.js
module.exports = function registerDashboardHandler(bot, deps) {
  const { db, simulateCashflow, ledgerService, format } = deps;
  const { formatMoney, codeBlock } = format;

  function renderHelp() {
    return [
      "*\\/dashboard*",
      "Show a high-level financial dashboard with bank balance, savings, net worth, next income, 30-day low point, danger date, end-of-period balance, and debt total.",
      "",
      "*Usage*",
      "- `/dashboard`",
      "",
      "*Examples*",
      "- `/dashboard`",
      "",
      "*Notes*",
      "- Uses `simulateCashflow` for the 30-day projection.",
      "- Next income is pulled from recurring items that increase `assets:bank`."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  function parseLocalDate(dateStr) {
    const s = String(dateStr || "").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;

    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setHours(12, 0, 0, 0);
    return d;
  }

  bot.onText(/^\/dashboard(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/dashboard` command does not take arguments.",
          "",
          "Usage:",
          "`/dashboard`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

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
        SELECT id
        FROM accounts
        WHERE name='assets:bank'
      `).get();

      if (!checking) {
        return bot.sendMessage(chatId, "Checking account not found.");
      }

      const sim = simulateCashflow(db, bank, checking.id, 30);
      const lowest = Number(sim?.lowestBalance) || 0;

      const endBalance =
        Array.isArray(sim?.timeline) && sim.timeline.length
          ? Number(sim.timeline[sim.timeline.length - 1].balance) || bank
          : bank;

      let dangerDate = null;

      for (const event of sim.timeline || []) {
        if (Number(event.balance) === Number(lowest)) {
          dangerDate = event.date;
          break;
        }
      }

      const income = db.prepare(`
        SELECT description, postings_json, next_due_date
        FROM recurring_transactions
      `).all();

      let nextIncome = null;

      for (const row of income) {
        try {
          const postings = JSON.parse(row.postings_json);
          const bankLine = Array.isArray(postings)
            ? postings.find((p) => p.account === "assets:bank")
            : null;

          if (bankLine && Number(bankLine.amount) > 0) {
            const d = parseLocalDate(row.next_due_date);
            if (!d) continue;

            if (!nextIncome || d < nextIncome.date) {
              nextIncome = {
                date: d,
                dateText: String(row.next_due_date || ""),
                amount: Number(bankLine.amount) || 0,
                description: String(row.description || "")
              };
            }
          }
        } catch (_) {
          // ignore malformed recurring rows
        }
      }

      const lines = [
        "📊 *Financial Dashboard*",
        "",
        codeBlock([
          `Balance        ${formatMoney(bank)}`,
          `Savings        ${formatMoney(savings)}`,
          `Net Worth      ${formatMoney(networth)}`,
          nextIncome
            ? `Next Income    ${formatMoney(nextIncome.amount)} (${nextIncome.dateText})`
            : `Next Income    unavailable`,
          `Lowest Balance ${formatMoney(lowest)}`,
          `Danger Date    ${dangerDate || "none"}`,
          `End 30 Days    ${formatMoney(endBalance)}`,
          `Debt           ${formatMoney(debt)}`
        ].join("\n"))
      ];

      if (nextIncome?.description) {
        lines.push(`Next income source: \`${nextIncome.description}\``);
      }

      return bot.sendMessage(chatId, lines.join("\n"), {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("dashboard error:", err);
      return bot.sendMessage(chatId, "Dashboard error.");
    }
  });
};

module.exports.help = {
  command: "dashboard",
  category: "Reporting",
  summary: "Show a high-level financial dashboard with bank balance, savings, net worth, next income, 30-day low point, danger date, end-of-period balance, and debt total.",
  usage: [
    "/dashboard"
  ],
  examples: [
    "/dashboard"
  ],
  notes: [
    "Uses `simulateCashflow` for the 30-day projection.",
    "Next income is pulled from recurring items that increase `assets:bank`."
  ]
};
