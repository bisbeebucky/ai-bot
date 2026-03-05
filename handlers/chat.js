// handlers/chat.js
module.exports = function registerChatHandler(bot, deps) {
  const { openai, ledgerService } = deps;

  const systemPrompt = `
You are a finance assistant.

You have TWO MODES:

1) CHAT MODE
If the message is conversational, greeting, question, or not clearly a financial transaction:
Respond in normal plain text.

2) ACCOUNTING MODE
If the message clearly describes money being earned, spent, transferred, paid, deposited, withdrawn, or moved between accounts:
Return ONLY valid JSON.
No markdown.
No explanation.
No extra text.

STRICT RULES:
- Only return JSON if it is DEFINITELY a financial transaction.
- If unsure, use CHAT MODE.
- Transactions MUST have:
  - date (YYYY-MM-DD)
  - description (short text)
  - postings (array of >= 2)
- Postings MUST balance to zero (sum amounts == 0).

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
- Windfall/Other income: income:other
- Food: expenses:food
- Rent: expenses:rent

DATE RULE:
- Always use TODAY'S real date.
- The date MUST be exactly today's date in YYYY-MM-DD format.
`;

  function todayYMD() {
    return new Date().toISOString().slice(0, 10);
  }

  function isProbablyJson(str) {
    const s = (str || "").trim();
    return s.startsWith("{") && s.endsWith("}");
  }

  function normalizeTransaction(raw, originalText) {
    const tx = raw && typeof raw === "object" ? raw : {};

    // Force today's date no matter what the model says
    tx.date = todayYMD();

    // Ensure description exists
    if (typeof tx.description !== "string" || !tx.description.trim()) {
      tx.description = originalText?.slice(0, 80) || "Transaction";
    } else {
      tx.description = tx.description.trim();
    }

    // postings must be array
    if (!Array.isArray(tx.postings)) {
      throw new Error("Missing postings array.");
    }
    if (tx.postings.length < 2) {
      throw new Error("Transaction must contain at least two postings.");
    }

    // Normalize postings
    tx.postings = tx.postings.map((p) => ({
      account: String(p.account || "").trim(),
      amount: Number(p.amount)
    }));

    for (const p of tx.postings) {
      if (!p.account) throw new Error("Posting missing account name.");
      if (!Number.isFinite(p.amount)) throw new Error("Posting has invalid amount.");
    }

    // Balance check (ledgerService also checks, but this gives a nicer error)
    const total = tx.postings.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(total) > 0.00001) {
      throw new Error(`Postings do not balance (sum = ${total}).`);
    }

    return tx;
  }

  bot.on("message", async (msg) => {
    try {
      if (!msg?.text) return;

      // ignore commands + ignore bots
      if (msg.text.startsWith("/")) return;
      if (msg.from?.is_bot) return;

      const completion = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: msg.text }
        ],
        temperature: 0.2
      });

      const reply = completion?.choices?.[0]?.message?.content?.trim() || "";
      if (!reply) return bot.sendMessage(msg.chat.id, "No response from AI.");

      // If it looks like JSON, try to post it
      if (isProbablyJson(reply)) {
        try {
          const parsed = JSON.parse(reply);
          const tx = normalizeTransaction(parsed, msg.text);

          ledgerService.addTransaction(tx);

          return bot.sendMessage(
            msg.chat.id,
            `✅ Posted: ${tx.description}\n${tx.date}`
          );
        } catch (e) {
          console.error("AI JSON parse/post error:", e);
          return bot.sendMessage(
            msg.chat.id,
            `I tried to post that as a transaction but it failed:\n${e.message}\n\nTry /deposit or /add for now.`
          );
        }
      }

      // Otherwise, just chat
      return bot.sendMessage(msg.chat.id, reply);
    } catch (err) {
      console.error("Chat handler error:", err);
      return bot.sendMessage(msg.chat.id, "AI error.");
    }
  });
};
