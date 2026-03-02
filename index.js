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

bot.onText(/\/balance/, (msg) => {
  try {
    const balances = getBalances();
    if (!balances.length) {
      return bot.sendMessage(msg.chat.id, "No transactions yet.");
    }

    let output = "📊 Account Balances\n\n";
    let currentType = null;

    balances.forEach(b => {
      if (b.type !== currentType) {
        currentType = b.type;
        output += `\n${currentType.toUpperCase()}\n`;
      }
      output += `  ${b.account} : ${b.balance}\n`;
    });

    bot.sendMessage(msg.chat.id, output);
  } catch (err) {
    console.error(err);
    bot.sendMessage(msg.chat.id, "Error retrieving balances.");
  }
});

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

/* ==================================================
 * FORECAST
   ================================================== */
bot.onText(/\/forecast/, (msg) => {
  try {
    const balances = getBalances();
    const recurring = getRecurringTransactions();

    // 1️⃣ Get liquid assets
    let liquidAssets = 0;

    balances.forEach(b => {
      if (b.account.startsWith("assets:bank")) {
        liquidAssets += b.balance;
      }
    });

    // 2️⃣ Calculate monthly recurring impact on liquid assets
    let monthlyImpact = 0;

    recurring.forEach(r => {
      let multiplier = 1;

      if (r.frequency === "daily") multiplier = 30;
      if (r.frequency === "weekly") multiplier = 4.33;
      if (r.frequency === "monthly") multiplier = 1;
      if (r.frequency === "yearly") multiplier = 1 / 12;

      const amount = r.amount * multiplier;

      // ✅ CORRECT ACCOUNTING LOGIC

      // Debit to bank = money IN (asset increases)
      if (r.debit_account.startsWith("assets:bank")) {
        monthlyImpact += amount;
      }

      // Credit to bank = money OUT (asset decreases)
      if (r.credit_account.startsWith("assets:bank")) {
        monthlyImpact -= amount;
      }
    });

    // 3️⃣ If positive or zero → infinite runway
    if (monthlyImpact >= 0) {
      return bot.sendMessage(
        msg.chat.id,
        `🔮 Predictive Runway\n\n` +
        `Monthly Recurring Net: +${monthlyImpact.toFixed(2)}\n` +
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
      `Monthly Recurring Net: -${burn.toFixed(2)}\n` +
      `Liquid Assets: ${liquidAssets}\n\n` +
      `⏳ Funds depleted in: ${months.toFixed(1)} months\n` +
      `📅 Estimated date: ${depletionDate.toISOString().split("T")[0]}`
    );

  } catch (err) {
    console.error(err);
    bot.sendMessage(msg.chat.id, "Error calculating forecast.");
  }
});

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
      let multiplier = {
        daily: 30,
        weekly: 4.33,
        monthly: 1,
        yearly: 1 / 12
      }[r.frequency] || 1;

      const amount = (Number(r.amount) || 0) * multiplier;

      if (r.debit_account?.startsWith("assets:bank")) {
        monthlyImpact -= amount;
      }

      if (r.credit_account?.startsWith("assets:bank")) {
        monthlyImpact += amount;
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

/* ==================================================
 * HYBRID FORECAST (Recurring + Real Burn)
   ================================================== */
bot.onText(/\/hybrid/, (msg) => {
  try {
    const balances = getBalances();
    const recurring = getRecurringTransactions();
    const totals = getLast30DayIncomeAndExpenses();

    // 1️⃣ Liquid assets
    let liquidAssets = 0;

    balances.forEach(b => {
      if (b.account.startsWith("assets:bank")) {
        liquidAssets += b.balance;
      }
    });

    // 2️⃣ Recent 30-day operating burn
    let income = 0;
    let expenses = 0;

    totals.forEach(r => {
      if (r.type === "income") income += r.total;
      if (r.type === "expenses") expenses += r.total;
    });

    const operatingIncome = -income;
    const operatingExpenses = expenses;
    const recentBurn = operatingExpenses - operatingIncome;

    // 3️⃣ Recurring monthly impact
    let recurringImpact = 0;

    recurring.forEach(r => {
      let multiplier = 1;

      if (r.frequency === "daily") multiplier = 30;
      if (r.frequency === "weekly") multiplier = 4.33;
      if (r.frequency === "monthly") multiplier = 1;
      if (r.frequency === "yearly") multiplier = 1 / 12;

      const amount = r.amount * multiplier;

      // Debit to bank = money IN
      if (r.debit_account.startsWith("assets:bank")) {
        recurringImpact += amount;
      }

      // Credit to bank = money OUT
      if (r.credit_account.startsWith("assets:bank")) {
        recurringImpact -= amount;
      }
    });

    // 4️⃣ Combine both
    const projectedMonthlyNet = recurringImpact - recentBurn;

    // PROFIT CASE
    if (projectedMonthlyNet >= 0) {
      return bot.sendMessage(
        msg.chat.id,
        `🔮 Hybrid Forecast\n\n` +
        `Recurring Net: ${recurringImpact.toFixed(2)}\n` +
        `Recent Burn: ${recentBurn.toFixed(2)}\n\n` +
        `📈 Projected Monthly Net: +${projectedMonthlyNet.toFixed(2)}\n` +
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
      `Recurring Net: ${recurringImpact.toFixed(2)}\n` +
      `Recent Burn: ${recentBurn.toFixed(2)}\n\n` +
      `📉 Projected Monthly Net: -${burn.toFixed(2)}\n` +
      `🏦 Liquid Assets: ${liquidAssets}\n\n` +
      `⏳ Funds depleted in: ${months.toFixed(1)} months\n` +
      `📅 Estimated date: ${depletionDate.toISOString().split("T")[0]}`
    );

  } catch (err) {
    console.error(err);
    bot.sendMessage(msg.chat.id, "Error calculating hybrid forecast.");
  }
});
