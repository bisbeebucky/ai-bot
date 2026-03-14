module.exports = function registerReconcileHandler(bot, deps) {
  const { format, reconciliationService } = deps;
  const { formatMoney, codeBlock } = format;

  function renderHelp() {
    return [
      "*\\/reconcile*",
      "Reconcile a ledger-backed account to its real-world balance by posting an adjustment entry.",
      "",
      "*Usage*",
      "- `/reconcile bank <actualBalance>`",
      "- `/reconcile savings <actualBalance>`",
      "",
      "*Examples*",
      "- `/reconcile bank 1234.56`",
      "- `/reconcile savings 800`",
      "",
      "*Notes*",
      "- Supports `bank` and `savings` only.",
      "- Posts a reconciliation entry instead of directly overwriting balances.",
      "- Uses `equity:reconciliation` as the offset account."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/reconcile(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (!raw || /^(help|--help|-h)$/i.test(raw)) {
      return sendHelp(chatId);
    }

    const parsed = raw.match(/^(\w+)\s+(-?\d+(?:\.\d+)?)$/i);
    if (!parsed) {
      return bot.sendMessage(
        chatId,
        [
          "Usage:",
          "`/reconcile bank <actualBalance>`",
          "`/reconcile savings <actualBalance>`"
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    }

    const accountInput = parsed[1].toLowerCase();
    const actualBalance = Number(parsed[2]);

    try {
      const preview = reconciliationService.buildPreview(accountInput, actualBalance);

      if (Math.abs(preview.delta) < 0.000001) {
        return bot.sendMessage(
          chatId,
          [
            "✅ *Reconcile*",
            "",
            "This account is already aligned.",
            "",
            codeBlock([
              `Account          ${preview.account}`,
              `Ledger Balance   ${formatMoney(preview.currentBalance)}`,
              `Actual Balance   ${formatMoney(preview.actualBalance)}`,
              `Adjustment       ${formatMoney(0)}`
            ].join("\n"))
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const callbackData = `reconcile|${chatId}|${accountInput}|${preview.actualBalance}`;

      return bot.sendMessage(
        chatId,
        [
          "🧾 *Reconcile Account*",
          "",
          codeBlock([
            `Account          ${preview.account}`,
            `Ledger Balance   ${formatMoney(preview.currentBalance)}`,
            `Actual Balance   ${formatMoney(preview.actualBalance)}`,
            `Adjustment       ${preview.delta >= 0 ? "+" : "-"}${formatMoney(Math.abs(preview.delta))}`
          ].join("\n")),
          "This will post a reconciliation entry to align the ledger with your real balance."
        ].join("\n"),
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "Confirm", callback_data: callbackData },
              { text: "Cancel", callback_data: `reconcile_cancel|${chatId}` }
            ]]
          }
        }
      );
    } catch (err) {
      return bot.sendMessage(chatId, err.message || "Error preparing reconciliation.", {
        parse_mode: "Markdown"
      });
    }
  });

  bot.on("callback_query", async (query) => {
    const data = String(query?.data || "");
    const chatId = query?.message?.chat?.id;
    const messageId = query?.message?.message_id;

    try {
      if (data.startsWith("reconcile_cancel|")) {
        const [, expectedChatId] = data.split("|");

        if (String(chatId) !== String(expectedChatId)) {
          return bot.answerCallbackQuery(query.id, {
            text: "This confirmation belongs to another chat."
          });
        }

        await bot.answerCallbackQuery(query.id, { text: "Cancelled." });

        return bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: chatId, message_id: messageId }
        );
      }

      if (!data.startsWith("reconcile|")) return;

      const [, expectedChatId, accountInput, actualBalanceRaw] = data.split("|");

      if (String(chatId) !== String(expectedChatId)) {
        return bot.answerCallbackQuery(query.id, {
          text: "This confirmation belongs to another chat."
        });
      }

      const result = reconciliationService.applyReconciliation(
        accountInput,
        Number(actualBalanceRaw)
      );

      await bot.answerCallbackQuery(query.id, { text: "Reconciled." });

      return bot.editMessageText(
        [
          "✅ *Reconciliation Applied*",
          "",
          codeBlock([
            `Account          ${result.account}`,
            `Ledger Balance   ${formatMoney(result.currentBalance)}`,
            `Actual Balance   ${formatMoney(result.actualBalance)}`,
            `Adjustment       ${result.delta >= 0 ? "+" : "-"}${formatMoney(Math.abs(result.delta))}`
          ].join("\n")),
          result.hash ? `Ref: \`${String(result.hash).slice(0, 8)}\`` : null
        ].filter(Boolean).join("\n"),
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown"
        }
      );
    } catch (err) {
      console.error("reconcile callback error:", err);

      try {
        await bot.answerCallbackQuery(query.id, {
          text: "Reconciliation failed."
        });
      } catch { }
    }
  });
};

module.exports.help = {
  command: "reconcile",
  category: "Accounting",
  summary: "Reconcile a real account balance by posting an adjustment entry.",
  usage: [
    "/reconcile bank <actualBalance>",
    "/reconcile savings <actualBalance>"
  ],
  examples: [
    "/reconcile bank 1234.56",
    "/reconcile savings 800"
  ],
  notes: [
    "Supports bank and savings only.",
    "Posts a reconciliation entry instead of directly overwriting balances.",
    "Uses equity:reconciliation as the offset account."
  ]
};
