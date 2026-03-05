// ai/messageHandler.js
module.exports = function registerAiMessageHandler({
  bot,
  openai,
  systemPrompt,
  ledgerService
}) {
  bot.on("message", async (msg) => {
    try {
      if (!msg.text) return;
      if (msg.text.startsWith("/")) return; // ignore commands

      const completion = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: msg.text }
        ],
        temperature: 0.2
      });

      const reply = completion.choices[0].message.content.trim();

      // Accounting Mode (JSON)
      try {
        const parsed = JSON.parse(reply);
        if (parsed.postings && Array.isArray(parsed.postings)) {
          ledgerService.addTransaction(parsed);
          return bot.sendMessage(msg.chat.id, `✅ Transaction recorded:\n${parsed.description}`);
        }
      } catch (_) {
        // Chat mode fallback
      }

      return bot.sendMessage(msg.chat.id, reply);
    } catch (err) {
      console.error("AI error:", err);
      return bot.sendMessage(msg.chat.id, "AI error.");
    }
  });
};
