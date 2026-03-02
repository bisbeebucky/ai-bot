const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");
const cron = require("node-cron");
const { addTransaction, deleteLastTransaction } = require("./services/ledgerService");
const { addRecurring, processRecurring } = require("./services/recurringService");
const {
  getBalances,
  getIncomeStatement,
  getNetWorthData,
  getLast30DayIncomeAndExpenses,
  getRecurringTransactions
} = require("./services/reportService");


/* =====================================================
   ENV CHECKS
===================================================== */

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN not set");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY not set");
  process.exit(1);
}

/* =====================================================
   CLIENTS
===================================================== */

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://openrouter.ai/api/v1" // remove if not using OpenRouter
});

/* ==============================
   UNDO
============================== */

bot.onText(/\/undo/, (msg) => {
  try {
    const last = deleteLastTransaction();

    if (!last) {
      return bot.sendMessage(msg.chat.id, "Nothing to undo.");
    }

    return bot.sendMessage(
      msg.chat.id,
      `↩️ Undid: ${last.description} (${last.date})`
    );

  } catch (err) {
    console.error(err);
    return bot.sendMessage(msg.chat.id, "Error undoing transaction.");
  }
});

/* =====================================================
   SYSTEM PROMPT – STRICT DOUBLE ENTRY
===================================================== */

const systemPrompt = `
You are a finance assistant.

You have TWO MODES:

1) CHAT MODE
If the message is conversational, greeting, question, or not clearly a financial transaction:
Respond in normal plain text.

2) ACCOUNTING MODE
If the message clearly describes money being earned, spent, transferred, or paid:
Return ONLY valid JSON.
No markdown.
No explanation.
No extra text.

STRICT RULES:
- Only return JSON if it is DEFINITELY a financial transaction.
- If unsure, use CHAT MODE.
- Transactions MUST have at least two postings.
- Postings MUST balance to zero.

ACCOUNTING SIGN RULES:
- Assets increase = positive
- Assets decrease = negative
- Expenses increase = positive
- Income increase = negative
- Liability increase = negative
- Liability decrease = positive

DEFAULT ACCOUNTS:
- Bank: assets:bank
- Salary: income:salary
- Food: expenses:food
- Rent: expenses:rent

DATE RULE:
- Always use today's real date.
- Do NOT use example dates like 2023-10-04.
- The date must reflect the current real date.

FORMAT:

{
  "date": "YYYY-MM-DD",
  "description": "short description",
  "postings": [
    { "account": "assets:bank", "amount": 1000 },
    { "account": "income:salary", "amount": -1000 }
  ]
}
`;

/* =====================================================
   DAILY RECURRING SCHEDULER
===================================================== */

cron.schedule("0 0 * * *", () => {
  try {
    const count = processRecurring();
    console.log(`Processed ${count} recurring transactions.`);
  } catch (err) {
    console.error("Recurring processing error:", err);
  }
});

/* =====================================================
   COMMANDS
===================================================== */

bot.onText(/\/income/, (msg) => {
  try {
    const rows = getIncomeStatement();
    if (!rows.length) {
      return bot.sendMessage(msg.chat.id, "No income or expenses recorded.");
    }

    let output = "📄 Profit & Loss Statement\n\n";

    rows.forEach(r => {
      output += `${r.account} : ${r.balance}\n`;
    });

    bot.sendMessage(msg.chat.id, output);
  } catch (err) {
    console.error(err);
    bot.sendMessage(msg.chat.id, "Error generating income statement.");
  }
});

bot.onText(/\/networth/, (msg) => {
  try {
    const rows = getNetWorthData();
    if (!rows.length) {
      return bot.sendMessage(msg.chat.id, "No assets or liabilities recorded.");
    }

    let output = "💰 Net Worth Statement\n\n";

    rows.forEach(r => {
      output += `${r.account} : ${r.balance}\n`;
    });

    bot.sendMessage(msg.chat.id, output);
  } catch (err) {
    console.error(err);
    bot.sendMessage(msg.chat.id, "Error generating net worth.");
  }
});

/* ==================================================
 * RUNWAY
 =================================================== */

bot.onText(/\/runway/, (msg) => {
  try {
    const balances = getBalances();
    const totals = getLast30DayIncomeAndExpenses();

    // 1️⃣ Liquid assets only (bank accounts)
    let liquidAssets = 0;

    balances.forEach(b => {
      if (b.account.startsWith("assets:bank")) {
        liquidAssets += b.balance;
      }
    });

    let income = 0;
    let expenses = 0;

    totals.forEach(r => {
      if (r.type === "income") income += r.total;
      if (r.type === "expenses") expenses += r.total;
    });

    // income is negative in your system
    const operatingIncome = -income;
    const operatingExpenses = expenses;

    const trueBurn = operatingExpenses - operatingIncome;

    // ✅ PROFIT CASE
    if (trueBurn <= 0) {
      return bot.sendMessage(
        msg.chat.id,
        `🚀 You are profitable.\n\n` +
        `Income (30d): ${operatingIncome}\n` +
        `Expenses (30d): ${operatingExpenses}\n` +
        `Liquid Assets: ${liquidAssets}\n\n` +
        `Runway: ∞`
      );
    }

    // 🔥 Burn calculations
    const burnPerMonth = trueBurn;
    const burnPerDay = burnPerMonth / 30;

    const runwayMonths = liquidAssets / burnPerMonth;
    const runwayDays = liquidAssets / burnPerDay;

    // ⚠️ Smart warning system
    let warning = "";

    if (runwayMonths < 3) {
      warning = "\n⚠️ CRITICAL: Less than 3 months runway!";
    } else if (runwayMonths < 6) {
      warning = "\n⚠️ Warning: Less than 6 months runway.";
    }

    return bot.sendMessage(
      msg.chat.id,
      `🔥 Operating Burn: ${burnPerMonth.toFixed(2)}/month\n` +
      `💧 Daily Burn: ${burnPerDay.toFixed(2)}/day\n` +
      `🏦 Liquid Assets: ${liquidAssets}\n\n` +
      `⏳ Runway: ${runwayMonths.toFixed(1)} months (${runwayDays.toFixed(0)} days)` +
      warning
    );

  } catch (err) {
    console.error(err);
    bot.sendMessage(msg.chat.id, "Error calculating runway.");
  }
});

/* ================================================
 * FORCAST
   =============================================== */ 
bot.onText(/\/forecast/, async (msg) => {
  try {
    const balances = await getBalances();
    const recurring = await getRecurringTransactions();

    let liquidAssets = 0;

    for (const b of balances) {
      if (b.account.startsWith("assets:bank")) {
        liquidAssets += Number(b.balance) || 0;
      }
    }

    let monthlyImpact = 0;

    for (const r of recurring) {
      const multiplier = {
        daily: 30,
        weekly: 4.33,
        monthly: 1,
        yearly: 1 / 12
      }[r.frequency] || 1;

      const amount = (Number(r.amount) || 0) * multiplier;

      // Debit to asset = increase
      if (r.debit_account?.startsWith("assets:bank")) {
        monthlyImpact += amount;
      }

      // Credit to asset = decrease
      if (r.credit_account?.startsWith("assets:bank")) {
        monthlyImpact -= amount;
      }
    }

    liquidAssets = Number(liquidAssets.toFixed(2));
    monthlyImpact = Number(monthlyImpact.toFixed(2));

    if (monthlyImpact >= 0) {
      return bot.sendMessage(
        msg.chat.id,
        `🔮 Predictive Runway\n\n` +
        `Monthly Net: +${monthlyImpact}\n` +
        `Liquid Assets: ${liquidAssets}\n\n` +
        `Runway: ∞`
      );
    }

    const burn = Math.abs(monthlyImpact);
    const months = liquidAssets / burn;

    const depletionDate = new Date();
    depletionDate.setMonth(depletionDate.getMonth() + Math.floor(months));

    return bot.sendMessage(
      msg.chat.id,
      `🔮 Predictive Runway\n\n` +
        `Monthly Net: -${burn}\n` +
        `Liquid Assets: ${liquidAssets}\n\n` +
        `⏳ ${months.toFixed(1)} months remaining\n` +
        `📅 ${depletionDate.toISOString().slice(0, 10)}`
    );

  } catch (err) {
    console.error("Forecast error:", err);
    return bot.sendMessage(msg.chat.id, "Error calculating forecast.");
  }
});

/*  ===================================================
 *  HYBRID
    ================================================== */  

bot.onText(/\/hybrid/, async (msg) => {
  try {
    const balances = await getBalances();
    const recurring = await getRecurringTransactions();
    const totals = await getLast30DayIncomeAndExpenses();

    let liquidAssets = 0;

    for (const b of balances) {
      if (b.account.startsWith("assets:bank")) {
        liquidAssets += Number(b.balance) || 0;
      }
    }

    let income = 0;
    let expenses = 0;

    for (const r of totals) {
      if (r.type === "income") income += Number(r.total) || 0;
      if (r.type === "expenses") expenses += Number(r.total) || 0;
    }

    // Let ledger sign define polarity
    const recentBurn = expenses - income;

    let recurringImpact = 0;

    for (const r of recurring) {
      const multiplier = {
        daily: 30,
        weekly: 4.33,
        monthly: 1,
        yearly: 1 / 12
      }[r.frequency] || 1;

      const amount = (Number(r.amount) || 0) * multiplier;

      if (r.debit_account?.startsWith("assets:bank")) {
        recurringImpact += amount;
      }

      if (r.credit_account?.startsWith("assets:bank")) {
        recurringImpact -= amount;
      }
    }

    liquidAssets = Number(liquidAssets.toFixed(2));
    recurringImpact = Number(recurringImpact.toFixed(2));
    const projectedMonthlyNet = Number((recurringImpact - recentBurn).toFixed(2));

    if (projectedMonthlyNet >= 0) {
      return bot.sendMessage(
        msg.chat.id,
        `🔮 Hybrid Forecast\n\n` +
        `Recurring Net: ${recurringImpact}\n` +
        `Recent Burn: ${recentBurn.toFixed(2)}\n\n` +
        `📈 Projected Monthly Net: +${projectedMonthlyNet}\n` +
        `🏦 Liquid Assets: ${liquidAssets}\n\n` +
        `Runway: ∞`
      );
    }

    const burn = Math.abs(projectedMonthlyNet);
    const months = liquidAssets / burn;

    const depletionDate = new Date();
    depletionDate.setMonth(depletionDate.getMonth() + Math.floor(months));

    return bot.sendMessage(
      msg.chat.id,
      `🔮 Hybrid Forecast\n\n` +
      `Recurring Net: ${recurringImpact}\n` +
      `Recent Burn: ${recentBurn.toFixed(2)}\n\n` +
      `📉 Projected Monthly Net: -${burn.toFixed(2)}\n` +
      `🏦 Liquid Assets: ${liquidAssets}\n\n` +
      `⏳ ${months.toFixed(1)} months remaining\n` +
      `📅 ${depletionDate.toISOString().slice(0, 10)}`
    );

  } catch (err) {
    console.error("Hybrid error:", err);
    return bot.sendMessage(msg.chat.id, "Error calculating hybrid forecast.");
  }
});

/* =====================================================
   STRESS TEST
   Usage: /stress 100
===================================================== */

bot.onText(/\/stress (.+)/, async (msg, match) => {
  try {
    const stressAmount = Number(match[1]);

    if (isNaN(stressAmount) || stressAmount <= 0) {
      return bot.sendMessage(msg.chat.id, "Usage: /stress 100");
    }

    const balances = await getBalances();
    const recurring = await getRecurringTransactions();
    const totals = await getLast30DayIncomeAndExpenses();

    // 1️⃣ Liquid assets
    let liquidAssets = 0;

    for (const b of balances) {
      if (b.account.startsWith("assets:bank")) {
        liquidAssets += Number(b.balance) || 0;
      }
    }

    // 2️⃣ Recent burn
    let income = 0;
    let expenses = 0;

    for (const r of totals) {
      if (r.type === "income") income += Number(r.total) || 0;
      if (r.type === "expenses") expenses += Number(r.total) || 0;
    }

    const recentBurn = expenses - income;

    // 3️⃣ Recurring impact
    let recurringImpact = 0;

    for (const r of recurring) {
      const multiplier = {
        daily: 30,
        weekly: 4.33,
        monthly: 1,
        yearly: 1 / 12
      }[r.frequency] || 1;

      const amount = (Number(r.amount) || 0) * multiplier;

      if (r.debit_account?.startsWith("assets:bank")) {
        recurringImpact += amount;
      }

      if (r.credit_account?.startsWith("assets:bank")) {
        recurringImpact -= amount;
      }
    }

    // 4️⃣ Apply stress
    const stressedNet = recurringImpact - recentBurn - stressAmount;

    liquidAssets = Number(liquidAssets.toFixed(2));

    // PROFIT CASE
    if (stressedNet >= 0) {
      return bot.sendMessage(
        msg.chat.id,
        `🧪 Stress Test (+${stressAmount}/month)\n\n` +
        `Projected Monthly Net After Stress: +${stressedNet.toFixed(2)}\n` +
        `🏦 Liquid Assets: ${liquidAssets}\n\n` +
        `Runway: ∞`
      );
    }

    const burn = Math.abs(stressedNet);
    const months = liquidAssets / burn;

    const depletionDate = new Date();
    depletionDate.setMonth(depletionDate.getMonth() + Math.floor(months));

    return bot.sendMessage(
      msg.chat.id,
      `🧪 Stress Test (+${stressAmount}/month)\n\n` +
      `Projected Monthly Net After Stress: -${burn.toFixed(2)}\n` +
      `🏦 Liquid Assets: ${liquidAssets}\n\n` +
      `⏳ ${months.toFixed(1)} months remaining\n` +
      `📅 ${depletionDate.toISOString().slice(0, 10)}`
    );

  } catch (err) {
    console.error("Stress error:", err);
    return bot.sendMessage(msg.chat.id, "Error running stress test.");
  }
});

/* =====================================================
   RAISE SIMULATION
   Usage: /raise 500
===================================================== */

bot.onText(/\/raise (.+)/, async (msg, match) => {
  try {
    const raiseAmount = Number(match[1]);

    if (isNaN(raiseAmount) || raiseAmount <= 0) {
      return bot.sendMessage(msg.chat.id, "Usage: /raise 500");
    }

    const balances = await getBalances();
    const recurring = await getRecurringTransactions();
    const totals = await getLast30DayIncomeAndExpenses();

    let liquidAssets = 0;

    for (const b of balances) {
      if (b.account.startsWith("assets:bank")) {
        liquidAssets += Number(b.balance) || 0;
      }
    }

    let income = 0;
    let expenses = 0;

    for (const r of totals) {
      if (r.type === "income") income += Number(r.total) || 0;
      if (r.type === "expenses") expenses += Number(r.total) || 0;
    }

    const recentBurn = expenses - income;

    let recurringImpact = 0;

    for (const r of recurring) {
      const multiplier = {
        daily: 30,
        weekly: 4.33,
        monthly: 1,
        yearly: 1 / 12
      }[r.frequency] || 1;

      const amount = (Number(r.amount) || 0) * multiplier;

      if (r.debit_account?.startsWith("assets:bank")) {
        recurringImpact += amount;
      }

      if (r.credit_account?.startsWith("assets:bank")) {
        recurringImpact -= amount;
      }
    }

    const improvedNet = recurringImpact - recentBurn + raiseAmount;

    if (improvedNet >= 0) {
      return bot.sendMessage(
        msg.chat.id,
        `📈 Raise Simulation (+${raiseAmount}/month)\n\n` +
        `New Projected Monthly Net: +${improvedNet.toFixed(2)}\n` +
        `🏦 Liquid Assets: ${liquidAssets}\n\n` +
        `Runway: ∞`
      );
    }

    const burn = Math.abs(improvedNet);
    const months = liquidAssets / burn;

    const depletionDate = new Date();
    depletionDate.setMonth(depletionDate.getMonth() + Math.floor(months));

    return bot.sendMessage(
      msg.chat.id,
      `📈 Raise Simulation (+${raiseAmount}/month)\n\n` +
      `New Projected Monthly Net: -${burn.toFixed(2)}\n` +
      `🏦 Liquid Assets: ${liquidAssets}\n\n` +
      `⏳ ${months.toFixed(1)} months remaining\n` +
      `📅 ${depletionDate.toISOString().slice(0, 10)}`
    );

  } catch (err) {
    console.error("Raise error:", err);
    return bot.sendMessage(msg.chat.id, "Error running raise simulation.");
  }
});

/* =====================================================
   SHOCK SIMULATION (With Impact Delta)
   Usage: /shock 1200
===================================================== */

bot.onText(/\/shock (.+)/, async (msg, match) => {
  try {
    const shockAmount = Number(match[1]);

    if (isNaN(shockAmount) || shockAmount <= 0) {
      return bot.sendMessage(msg.chat.id, "Usage: /shock 1200");
    }

    const balances = await getBalances();
    const totals = await getLast30DayIncomeAndExpenses();

    let liquidAssets = 0;

    for (const b of balances) {
      if (b.account.startsWith("assets:bank")) {
        liquidAssets += Number(b.balance) || 0;
      }
    }

    let income = 0;
    let expenses = 0;

    for (const r of totals) {
      if (r.type === "income") income += Number(r.total) || 0;
      if (r.type === "expenses") expenses += Number(r.total) || 0;
    }

    const monthlyBurn = expenses - income;

    // BEFORE runway
    let beforeRunway = Infinity;

    if (monthlyBurn > 0) {
      beforeRunway = liquidAssets / monthlyBurn;
    }

    // Apply shock
    const newLiquidAssets = liquidAssets - shockAmount;

    if (newLiquidAssets <= 0) {
      return bot.sendMessage(
        msg.chat.id,
        `💥 Shock Event (-${shockAmount})\n\n` +
        `Liquidity exhausted immediately.\n` +
        `Impact: -${beforeRunway.toFixed(1)} months of runway`
      );
    }

    // AFTER runway
    let afterRunway = Infinity;

    if (monthlyBurn > 0) {
      afterRunway = newLiquidAssets / monthlyBurn;
    }

    const impactMonths =
      beforeRunway === Infinity
        ? 0
        : beforeRunway - afterRunway;

    if (monthlyBurn <= 0) {
      return bot.sendMessage(
        msg.chat.id,
        `💥 Shock Event (-${shockAmount})\n\n` +
        `Before Shock: Profitable (∞ runway)\n` +
        `After Shock: Profitable (∞ runway)\n\n` +
        `🏦 New Liquid Assets: ${newLiquidAssets.toFixed(2)}`
      );
    }

    return bot.sendMessage(
      msg.chat.id,
      `💥 Shock Event (-${shockAmount})\n\n` +
      `Before Shock:\n` +
      `  Liquid Assets: ${liquidAssets.toFixed(2)}\n` +
      `  Runway: ${beforeRunway.toFixed(1)} months\n\n` +
      `After Shock:\n` +
      `  Liquid Assets: ${newLiquidAssets.toFixed(2)}\n` +
      `  Runway: ${afterRunway.toFixed(1)} months\n\n` +
      `📉 Impact: -${impactMonths.toFixed(1)} months`
    );

  } catch (err) {
    console.error("Shock error:", err);
    return bot.sendMessage(msg.chat.id, "Error running shock simulation.");
  }
});

/* ==================================================
 * STATUS
   ================================================== */

bot.onText(/^\/status(@\w+)?$/, async (msg) => {
  try {
    const balances = await getBalances();
    const totals = await getLast30DayIncomeAndExpenses();

    let liquidAssets = 0;

    for (const b of balances) {
      if (b.account.startsWith("assets:bank")) {
        liquidAssets += Number(b.balance) || 0;
      }
    }

    let income = 0;
    let expenses = 0;

    for (const r of totals) {
      if (r.type === "income") income += Number(r.total) || 0;
      if (r.type === "expenses") expenses += Number(r.total) || 0;
    }

    const monthlyNet = income - expenses;

    let runway = Infinity;

    if (monthlyNet < 0) {
      runway = liquidAssets / Math.abs(monthlyNet);
    }

    const runwayText =
      runway === Infinity
        ? "∞ (Profitable)"
        : `${runway.toFixed(1)} months`;

    return bot.sendMessage(
      msg.chat.id,
      `📊 Financial Status\n\n` +
      `🏦 Liquid Assets: ${liquidAssets.toFixed(2)}\n` +
      `📈 Monthly Income: ${income.toFixed(2)}\n` +
      `📉 Monthly Expenses: ${expenses.toFixed(2)}\n` +
      `💰 Monthly Net: ${monthlyNet.toFixed(2)}\n\n` +
      `⏳ Runway: ${runwayText}`
    );

  } catch (err) {
    console.error("Status error:", err);
    return bot.sendMessage(msg.chat.id, "Error retrieving status.");
  }
});

/* =====================================================
   BALANCE (INTERNAL)
===================================================== */

bot.onText(/^\/balance(@\w+)?$/, async (msg) => {
  try {
    const balances = await getBalances();

    if (!balances.length) {
      return bot.sendMessage(msg.chat.id, "No balances found.");
    }

    let output = "📊 Account Balances\n\n";

    let total = 0;

    for (const b of balances) {
      const amount = Number(b.balance) || 0;
      total += amount;

      output += `${b.account}: ${amount.toFixed(2)}\n`;
    }

    output += `\nNet Total: ${total.toFixed(2)}`;

    return bot.sendMessage(msg.chat.id, output);

  } catch (err) {
    console.error("Balance error:", err);
    return bot.sendMessage(msg.chat.id, "Error retrieving balances.");
  }
});

/* =====================================================
   AI MESSAGE HANDLER (CHAT + ACCOUNTING MODE)
===================================================== */

bot.on("message", async (msg) => {
  try {
    if (!msg.text) return;

    // Ignore slash commands (they are handled above)
    if (msg.text.startsWith("/")) return;

    const completion = await openai.chat.completions.create({
      model: "openai/gpt-4o-mini", // change if needed
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: msg.text }
      ],
      temperature: 0.2
    });

    const reply = completion.choices[0].message.content.trim();

    // Try to parse JSON (Accounting Mode)
    try {
      const parsed = JSON.parse(reply);

      if (parsed.postings && Array.isArray(parsed.postings)) {
        addTransaction(parsed);
        return bot.sendMessage(
          msg.chat.id,
          `✅ Transaction recorded:\n${parsed.description}`
        );
      }

    } catch (jsonErr) {
      // Not JSON → Chat mode
    }

    // Chat mode fallback
    return bot.sendMessage(msg.chat.id, reply);

  } catch (err) {
    console.error("AI error:", err);
    return bot.sendMessage(msg.chat.id, "AI error.");
  }
});
