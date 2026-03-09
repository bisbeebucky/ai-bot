// handlers/runrecurring.js
module.exports = function registerRunRecurringHandler(bot, deps) {
  const { recurringProcessor } = deps;

  function renderHelp() {
    return [
      "*\\/runrecurring*",
      "Run recurring transactions now.",
      "",
      "*Usage*",
      "- `/runrecurring`",
      "",
      "*Examples*",
      "- `/runrecurring`",
      "",
      "*Notes*",
      "- Intended for manual triggering of the recurring processor."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/runrecurring(?:@\w+)?(?:\s+(.*))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/runrecurring` command does not take arguments.",
          "",
          "Usage:",
          "`/runrecurring`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    try {
      if (!recurringProcessor || typeof recurringProcessor.runDueTransactions !== "function") {
        return bot.sendMessage(chatId, "Recurring processor is not available.");
      }

      const result = await recurringProcessor.runDueTransactions();
      const message =
        result && typeof result === "object" && "processed" in result
          ? `✅ Recurring run complete. Processed: ${result.processed}`
          : "✅ Recurring run complete.";

      return bot.sendMessage(chatId, message);
    } catch (err) {
      console.error("runrecurring error:", err);
      return bot.sendMessage(chatId, "Error running recurring transactions.");
    }
  });
};

module.exports.help = {
  command: "runrecurring",
  category: "Recurring",
  summary: "Run recurring transactions now.",
  usage: [
    "/runrecurring"
  ],
  examples: [
    "/runrecurring"
  ],
  notes: [
    "Intended for manual triggering of the recurring processor."
  ]
};
