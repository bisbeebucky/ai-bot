// handlers/today.js
module.exports = function registerTodayHandler(bot, deps) {
  const { ledgerService, format } = deps;
  const { formatMoney, codeBlock } = format;

  function renderHelp() {
    return [
      "*\\/today*",
      "Daily money snapshot.",
      "",
      "*Usage*",
      "- `/today`",
      "",
      "*Examples*",
      "- `/today`"
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/today(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/today` command does not take arguments.",
          "",
          "Usage:",
          "`/today`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    try {
      const balances = ledgerService.getBalances();

      let bank = 0;
      let savings = 0;
      let liabilities = 0;

      for (const b of balances) {
        const account = String(b.account || "");
        const amount = Number(b.balance) || 0;

        if (account === "assets:bank") bank = amount;
        if (account === "assets:savings") savings = amount;
        if (account.startsWith("liabilities:")) liabilities += Math.abs(amount);
      }

      const networth = bank + savings - liabilities;

      const out = [
        "📅 *Today*",
        "",
        codeBlock([
          `Bank        ${formatMoney(bank)}`,
          `Savings     ${formatMoney(savings)}`,
          `Debt        ${formatMoney(liabilities)}`,
          `Net Worth   ${networth >= 0 ? "+" : "-"}${formatMoney(Math.abs(networth))}`
        ].join("\n"))
      ].join("\n");

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("today error:", err);
      return bot.sendMessage(chatId, "Error generating daily snapshot.");
    }
  });
};

module.exports.help = {
  command: "today",
  category: "Reporting",
  summary: "Daily money snapshot.",
  usage: [
    "/today"
  ],
  examples: [
    "/today"
  ]
};
