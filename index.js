const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");

const { getBalances } = require("./services/reportService");
const { addTransaction } = require("./services/ledgerService");

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN not set");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
});

/* =====================================================
   SYSTEM PROMPT – STRICT DOUBLE ENTRY ACCOUNTING
===================================================== */

const systemPrompt = `
You convert user messages into STRICT double-entry accounting transactions.

CRITICAL RULES:
- Return ONLY valid JSON.
- No explanations.
- No markdown.
- No text outside JSON.
- Always create at least TWO postings.
- Postings MUST balance to zero.
- Sum of all amounts must equal 0.

ACCOUNTING SIGN RULES:
- Asset increase = positive
- Asset decrease = negative
- Expense = negative
- Income = negative
- Liability increase = negative
- Liability decrease = positive
- Equity increase = negative

DEFAULT BEHAVIOR:
- If user receives money and no asset specified → use "assets:bank"
- If user spends money and no payment source specified → use "assets:bank"
- If user says "cash" → use "assets:cash"
- If user says "card" → use "assets:bank"
- Salary → "income:salary"
- Food/restaurant → "expenses:food"
- Rent → "expenses:rent"

DATE RULES:
- If user says "today" → use today's date.
- Format must be YYYY-MM-DD.

ACCOUNT NAMING:
- Always lowercase.
- Use colon format like:
  assets:bank
  assets:cash
  expenses:food
  income:salary

OUTPUT FORMAT:

{
  "date": "YYYY-MM-DD",
  "description": "short description",
  "postings": [
    { "account": "assets:bank", "type": "assets", "amount": 1000 },
    { "account": "income:salary", "type": "income", "amount": -1000 }
  ]
}
`;

/* =====================================================
   /balance command
===================================================== */

bot.onText(/\/balance/, (msg) => {
  try {
    const balances = getBalances();

    if (!balances.length) {
      return bot.sendMessage(msg.chat.id, "No transactions yet.");
    }

    const formatForDisplay = (type, balance) => {
      switch (type) {
        case "income":
          return -balance;       // income shown positive
        case "expenses":
          return -balance;       // expenses shown negative
        case "liabilities":
          return -balance;       // liabilities shown positive
        case "equity":
          return -balance;       // equity shown positive
        default:
          return balance;        // assets unchanged
      }
    };

    let output = "📊 Account Balances\n\n";
    let currentType = null;

    balances.forEach(b => {

      const displayBalance = formatForDisplay(b.type, b.balance);

      if (b.type !== currentType) {
        currentType = b.type;
        output += `\n${currentType.toUpperCase()}\n`;
      }

      output += `  ${b.account} : ${displayBalance}\n`;
    });

    bot.sendMessage(msg.chat.id, output);

  } catch (err) {
    console.error(err);
    bot.sendMessage(msg.chat.id, "Error retrieving balances.");
  }
});

/* =====================================================
   NATURAL LANGUAGE → TRANSACTION
===================================================== */

bot.on("message", async (msg) => {
  if (!msg.text) return;

  // Ignore bot commands like /balance
  if (msg.text.startsWith("/")) return;

  try {
    const response = await openai.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: msg.text }
      ],
      temperature: 0.1
    });

    const content = response.choices[0].message.content;

    let data;

    try {
      data = JSON.parse(content);
    } catch (err) {
      console.error("JSON Parse Error:", content);
      return bot.sendMessage(msg.chat.id, "Could not understand transaction.");
    }

    if (!data.date || !data.description || !Array.isArray(data.postings)) {
      return bot.sendMessage(msg.chat.id, "Invalid transaction format.");
    }

    if (data.postings.length < 2) {
      return bot.sendMessage(msg.chat.id, "Transaction must contain at least two postings.");
    }

    // Ensure balancing
    const total = data.postings.reduce((sum, p) => sum + Number(p.amount), 0);

    if (Math.abs(total) > 0.001) {
      console.error("Unbalanced transaction:", data);
      return bot.sendMessage(msg.chat.id, "Transaction not balanced.");
    }

    // Save transaction
    addTransaction(data.date, data.description, data.postings);

    bot.sendMessage(
      msg.chat.id,
      `✅ Recorded: ${data.description} (${data.date})`
    );

  } catch (err) {
    console.error(err);
    bot.sendMessage(msg.chat.id, "Transaction processing failed.");
  }
});
