function recurringNetNext30Days(db, accountName = "assets:bank") {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + 30);

  const rows = db.prepare(`
    SELECT description, postings_json, frequency, next_due_date
    FROM recurring_transactions
  `).all();

  function nextDueDate(dateObj, frequency) {
    const d = new Date(dateObj);
    d.setHours(0, 0, 0, 0);
    switch ((frequency || "").toLowerCase()) {
      case "daily": d.setDate(d.getDate() + 1); return d;
      case "weekly": d.setDate(d.getDate() + 7); return d;
      case "monthly": {
        const day = d.getDate();
        d.setMonth(d.getMonth() + 1);
        if (d.getDate() !== day) d.setDate(0);
        return d;
      }
      case "yearly": d.setFullYear(d.getFullYear() + 1); return d;
      default: return null;
    }
  }

  let net = 0;
  for (const r of rows) {
    let due = new Date(r.next_due_date);
    due.setHours(0, 0, 0, 0);
    if (isNaN(due.getTime())) continue;

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
  return net;
}

module.exports = function registerRunwayHandler(bot, deps) {
  const { db, ledgerService } = deps;

  bot.onText(/^\/runway(@\w+)?$/, (msg) => {
    const chatId = msg.chat.id;

    try {
      const balances = ledgerService.getBalances();
      const bank = balances.find(b => b.account === "assets:bank");
      const liquid = Number(bank?.balance) || 0;

      const totals = ledgerService.getLast30DayTotals();
      const income30 = Number(totals.find(t => t.type === "INCOME")?.total) || 0;
      const exp30 = Number(totals.find(t => t.type === "EXPENSES")?.total) || 0;
      const net30 = income30 - exp30;

      const recurringNet30 = recurringNetNext30Days(db, "assets:bank");
      const projectedNet30 = net30 + recurringNet30;

      let out = "📊 Financial Runway\n\n";
      out += `Balance: $${liquid.toFixed(2)}\n\n`;
      out += `Monthly Income (30d): $${income30.toFixed(2)}\n`;
      out += `Monthly Expenses (30d): $${exp30.toFixed(2)}\n`;
      out += `Recurring Net (next 30d): $${recurringNet30.toFixed(2)}\n`;
      out += `Net Monthly (est): $${projectedNet30.toFixed(2)}\n\n`;

      if (projectedNet30 >= 0) {
        out += "✅ You are cashflow positive.\nRunway: ∞";
        return bot.sendMessage(chatId, out);
      }

      const burn = Math.abs(projectedNet30);
      const runwayMonths = liquid / burn;
      const runwayDays = runwayMonths * 30;

      out += `🔥 Burn/month: $${burn.toFixed(2)}\n`;
      out += `⏳ Runway: ${runwayMonths.toFixed(1)} months (${runwayDays.toFixed(0)} days)`;

      if (runwayMonths < 3) out += "\n⚠️ CRITICAL: < 3 months runway!";
      else if (runwayMonths < 6) out += "\n⚠️ Warning: < 6 months runway.";

      return bot.sendMessage(chatId, out);
    } catch (err) {
      console.error("Runway error:", err);
      return bot.sendMessage(chatId, "Runway error.");
    }
  });
};
