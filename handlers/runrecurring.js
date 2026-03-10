// handlers/runrecurring.js
module.exports = function registerRunrecurringHandler(bot, deps) {
  const { recurringProcessor } = deps;

  function renderHelp() {
    return [
      "*\\/runrecurring*",
      "Run the recurring transaction processor now.",
      "",
      "*Usage*",
      "- `/runrecurring`",
      "",
      "*Examples*",
      "- `/runrecurring`",
      "",
      "*Notes*",
      "- Processes any recurring items that are due now.",
      "- Useful for testing or manually forcing a recurring run."
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

    if (!recurringProcessor || typeof recurringProcessor.processDueRecurring !== "function") {
      return bot.sendMessage(chatId, "Recurring processor is not available.");
    }

    try {
      const posted = Number(await recurringProcessor.processDueRecurring()) || 0;

      let out = "🔁 Recurring Run\n\n";
      out += "```\n";
      out += `Posted: ${posted}\n`;
      out += "```";

      if (posted === 0) {
        out += "\nNo recurring items were due.";
      }

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("runrecurring error:", err);
      return bot.sendMessage(chatId, "Error running recurring processor.");
    }
  });
};

module.exports.help = {
  command: "runrecurring",
  category: "Recurring",
  summary: "Run the recurring transaction processor now.",
  usage: [
    "/runrecurring"
  ],
  examples: [
    "/runrecurring"
  ],
  notes: [
    "Processes any recurring items that are due now.",
    "Useful for testing or manually forcing a recurring run."
  ]
};
