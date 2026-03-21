// handlers/balance.js
module.exports = function registerBalanceHandler(bot, deps) {
  const { format, queryService } = deps;
  const { formatMoney } = format;

  function renderHelp() {
    return [
      "*\\/balance*",
      "Show the current balance of assets:bank.",
      "",
      "*Usage*",
      "- `/balance`",
      "",
      "*Examples*",
      "- `/balance`",
      "",
      "*Notes*",
      "- Reads the balance for `assets:bank` directly from the database."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/balance(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw && !/^(help|--help|-h)$/i.test(raw)) {
      return bot.sendMessage(
        chatId,
        [
          "The `/balance` command does not take arguments.",
          "",
          "Usage:",
          "`/balance`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    if (/^(help|--help|-h)$/i.test(raw)) {
      return sendHelp(chatId);
    }

    try {
      const result = queryService.getCurrentBankBalance(deps.db);

      if (!result.ok) {
        return bot.sendMessage(chatId, result.error);
      }

      return bot.sendMessage(
        chatId,
        [
          "💰 <b>Current Balance</b>",
          "",
          "<pre>" + [
            `Account  ${result.account.name}`,
            `Balance  ${formatMoney(result.balance)}`
          ].join("\n") + "</pre>"
        ].join("\n"),
        { parse_mode: "HTML" }
      );
    } catch (err) {
      console.error("Balance error:", err);
      return bot.sendMessage(chatId, "Balance error.");
    }
  });
};

module.exports.help = {
  command: "balance",
  category: "Reporting",
  summary: "Show the current balance of assets:bank.",
  usage: [
    "/balance"
  ],
  examples: [
    "/balance"
  ],
  notes: [
    "Reads the balance for `assets:bank` directly from the database."
  ]
};
