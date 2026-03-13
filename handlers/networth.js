// handlers/networth.js
module.exports = function registerNetworthHandler(bot, deps) {
  const { ledgerService, format, finance, db } = deps;
  const { formatMoney, codeBlock } = format;
  const { getDebtRows } = finance;

  function renderHelp() {
    return [
      "*\\/networth*",
      "Show assets minus liabilities, including tracked debts.",
      "",
      "*Usage*",
      "- `/networth`",
      "",
      "*Examples*",
      "- `/networth`"
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/networth(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/networth` command does not take arguments.",
          "",
          "Usage:",
          "`/networth`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    try {
      const balances = ledgerService.getBalances();

      let assets = 0;
      let ledgerLiabilities = 0;

      for (const b of balances) {
        const account = String(b.account || "");
        const amount = Number(b.balance) || 0;

        if (account.startsWith("assets:")) {
          assets += amount;
        }

        if (account.startsWith("liabilities:")) {
          ledgerLiabilities += Math.abs(amount);
        }
      }

      const debtRows = getDebtRows(db);
      const debtLiabilities = debtRows.reduce((sum, d) => {
        return sum + (Number(d.balance) || 0);
      }, 0);

      const liabilities = ledgerLiabilities + debtLiabilities;
      const networth = assets - liabilities;

      const out = [
        "📦 *Net Worth*",
        "",
        codeBlock([
          `Assets         ${formatMoney(assets)}`,
          `Liabilities    ${formatMoney(liabilities)}`,
          `Net Worth      ${networth >= 0 ? "+" : "-"}${formatMoney(Math.abs(networth))}`
        ].join("\n"))
      ].join("\n");

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("networth error:", err);
      return bot.sendMessage(chatId, "Error calculating net worth.");
    }
  });
};

module.exports.help = {
  command: "networth",
  category: "Reporting",
  summary: "Show assets minus liabilities, including tracked debts.",
  usage: [
    "/networth"
  ],
  examples: [
    "/networth"
  ]
};
