// handlers/savings.js
module.exports = function registerSavingsHandler(bot, deps) {
  const { ledgerService, format } = deps;
  const { formatMoney, codeBlock } = format;

  function renderHelp() {
    return [
      "*\\/savings*",
      "Show bank savings balance.",
      "",
      "*Usage*",
      "- `/savings`",
      "",
      "*Examples*",
      "- `/savings`"
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/savings(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/savings` command does not take arguments.",
          "",
          "Usage:",
          "`/savings`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    try {
      const balances = ledgerService.getBalances();
      const savings = balances.find((b) => b.account === "assets:savings");
      const amount = Number(savings?.balance) || 0;

      const out = [
        "💾 *Savings Balance*",
        "",
        codeBlock(`assets:savings  ${formatMoney(amount)}`)
      ].join("\n");

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("savings error:", err);
      return bot.sendMessage(chatId, "Error retrieving savings balance.");
    }
  });
};

module.exports.help = {
  command: "savings",
  category: "Reporting",
  summary: "Show bank savings balance.",
  usage: [
    "/savings"
  ],
  examples: [
    "/savings"
  ]
};
