function ymd(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function addDays(dateObj, days) {
  const d = new Date(dateObj);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function nextDueDate(dateObj, frequency) {
  const d = new Date(dateObj);
  d.setHours(0, 0, 0, 0);

  switch ((frequency || "").toLowerCase()) {
    case "daily":
      d.setDate(d.getDate() + 1);
      return d;
    case "weekly":
      d.setDate(d.getDate() + 7);
      return d;
    case "monthly": {
      const day = d.getDate();
      d.setMonth(d.getMonth() + 1);
      if (d.getDate() !== day) d.setDate(0);
      return d;
    }
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      return d;
    default:
      return null;
  }
}

function recurringNetNext30Days(db, accountName = "assets:bank") {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = addDays(today, 30);

  const rows = db.prepare(`
    SELECT id, description, postings_json, frequency, next_due_date
    FROM recurring_transactions
  `).all();

  let net = 0;

  for (const r of rows) {
    let due = new Date(r.next_due_date);
    due.setHours(0, 0, 0, 0);
    if (isNaN(due.getTime())) continue;

    // walk occurrences until end
    while (due <= end) {
      if (due >= today) {
        let postings;
        try { postings = JSON.parse(r.postings_json); } catch { postings = null; }

        if (Array.isArray(postings)) {
          const bankLine = postings.find(p => p.account === accountName);
          if (bankLine) net += Number(bankLine.amount) || 0;
        }
      }
      const next = nextDueDate(due, r.frequency);
      if (!next) break;
      due = next;
    }
  }

  return net; // net change to bank over next 30d (positive = inflow)
}

module.exports = function registerStatusHandler(bot, deps) {
  const { db, ledgerService } = deps;

  bot.onText(/^\/status(@\w+)?$/, (msg) => {
    const chatId = msg.chat.id;

    try {
      // Balance from ledgerService (or fallback to SQL)
      const balances = ledgerService.getBalances();
      const bank = balances.find(b => b.account === "assets:bank");
      const bankBalance = Number(bank?.balance) || 0;

      // last 30d totals
      const totals = ledgerService.getLast30DayTotals();
      const income30 = Number(totals.find(t => t.type === "INCOME")?.total) || 0;
      const exp30 = Number(totals.find(t => t.type === "EXPENSES")?.total) || 0;

      const net30 = income30 - exp30;

      // recurring impact next 30 days
      const recurringNet30 = recurringNetNext30Days(db, "assets:bank");

      const projectedNet30 = net30 + recurringNet30;

      let out = "📊 Status\n\n";
      out += `🏦 Balance (assets:bank): $${bankBalance.toFixed(2)}\n\n`;
      out += `Last 30d income:   $${income30.toFixed(2)}\n`;
      out += `Last 30d expenses: $${exp30.toFixed(2)}\n`;
      out += `Last 30d net:      $${net30.toFixed(2)}\n\n`;
      out += `Recurring next 30d (bank): $${recurringNet30.toFixed(2)}\n`;
      out += `Projected net next 30d:    $${projectedNet30.toFixed(2)}\n`;

      return bot.sendMessage(chatId, out);
    } catch (err) {
      console.error("Status error:", err);
      return bot.sendMessage(chatId, "Status error.");
    }
  });
};
