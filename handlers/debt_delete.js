// handlers/debt_delete.js
module.exports = function registerDebtDeleteHandler(bot, deps) {
  const { db, format } = deps;
  const { formatMoney, codeBlock } = format;

  function renderHelp() {
    return [
      "*\\/debt_delete*",
      "Delete a debt after confirmation.",
      "",
      "*Usage*",
      "- `/debt_delete <id>`",
      "- `/debt_delete <name>`",
      "",
      "*Examples*",
      "- `/debt_delete 3`",
      "- `/debt_delete Capital One`",
      "",
      "*Notes*",
      "- This command asks for confirmation before deleting a debt.",
      "- Use `/debts` first if you need to check the debt id or exact name."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  function getDebtById(id) {
    return db.prepare(`
      SELECT
        id,
        name,
        balance,
        apr,
        minimum
      FROM debts
      WHERE id = ?
    `).get(id);
  }

  function getDebtByName(name) {
    const exact = db.prepare(`
      SELECT
        id,
        name,
        balance,
        apr,
        minimum
      FROM debts
      WHERE lower(name) = lower(?)
      ORDER BY id ASC
      LIMIT 1
    `).get(name);

    if (exact) return exact;

    return db.prepare(`
      SELECT
        id,
        name,
        balance,
        apr,
        minimum
      FROM debts
      WHERE lower(name) LIKE lower(?)
      ORDER BY id ASC
      LIMIT 1
    `).get(`%${name}%`);
  }

  function findDebt(raw) {
    const value = String(raw || "").trim();
    if (!value) return null;

    if (/^\d+$/.test(value)) {
      return getDebtById(Number(value));
    }

    return getDebtByName(value);
  }

  function buildPreviewText(debt) {
    return [
      "🗑️ *Confirm Debt Delete*",
      "",
      "Delete this debt?",
      "",
      codeBlock([
        `ID       ${debt.id}`,
        `Name     ${debt.name}`,
        `Balance  ${formatMoney(debt.balance)}`,
        `APR      ${Number(debt.apr || 0)}%`,
        `Minimum  ${formatMoney(debt.minimum || 0)}`
      ].join("\n"))
    ].join("\n");
  }

  bot.onText(/^\/debt_delete(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (!raw || /^(help|--help|-h)$/i.test(raw)) {
      return sendHelp(chatId);
    }

    try {
      const debt = findDebt(raw);

      if (!debt) {
        return bot.sendMessage(
          chatId,
          [
            "Debt not found.",
            "",
            "Usage:",
            "`/debt_delete <id>`",
            "or",
            "`/debt_delete <name>`",
            "",
            "Tip:",
            "Use `/debts` to see the available debts."
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      return bot.sendMessage(chatId, buildPreviewText(debt), {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Yes, delete", callback_data: `debt_delete_yes:${debt.id}` },
              { text: "❌ Cancel", callback_data: `debt_delete_no:${debt.id}` }
            ]
          ]
        }
      });
    } catch (err) {
      console.error("debt_delete error:", err);
      return bot.sendMessage(chatId, "Debt delete failed.");
    }
  });

  bot.on("callback_query", (query) => {
    const data = String(query?.data || "");
    const message = query?.message;
    const chatId = message?.chat?.id;
    const messageId = message?.message_id;

    if (!data.startsWith("debt_delete_yes:") && !data.startsWith("debt_delete_no:")) {
      return;
    }

    if (!chatId || !messageId) {
      return bot.answerCallbackQuery(query.id).catch(() => { });
    }

    const debtId = Number(data.split(":")[1]);

    if (data.startsWith("debt_delete_no:")) {
      bot.answerCallbackQuery(query.id, {
        text: "Delete cancelled."
      }).catch(() => { });

      return bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: messageId }
      ).catch(() => { });
    }

    try {
      const debt = getDebtById(debtId);

      if (!debt) {
        bot.answerCallbackQuery(query.id, {
          text: "Debt not found."
        }).catch(() => { });

        return bot.editMessageText(
          "That debt was already removed or could not be found.",
          {
            chat_id: chatId,
            message_id: messageId
          }
        ).catch(() => { });
      }

      db.prepare(`
        DELETE FROM debts
        WHERE id = ?
      `).run(debtId);

      bot.answerCallbackQuery(query.id, {
        text: "Debt deleted."
      }).catch(() => { });

      return bot.editMessageText(
        [
          "🗑️ *Debt Deleted*",
          "",
          codeBlock([
            `ID       ${debt.id}`,
            `Name     ${debt.name}`,
            `Balance  ${formatMoney(debt.balance)}`,
            `APR      ${Number(debt.apr || 0)}%`,
            `Minimum  ${formatMoney(debt.minimum || 0)}`
          ].join("\n"))
        ].join("\n"),
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown"
        }
      ).catch(() => { });
    } catch (err) {
      console.error("debt_delete confirm error:", err);

      bot.answerCallbackQuery(query.id, {
        text: "Delete failed."
      }).catch(() => { });

      return bot.editMessageText("Debt delete failed.", {
        chat_id: chatId,
        message_id: messageId
      }).catch(() => { });
    }
  });
};

module.exports.help = {
  command: "debt_delete",
  category: "Debt",
  summary: "Delete a debt after confirmation.",
  usage: [
    "/debt_delete <id>",
    "/debt_delete <name>"
  ],
  examples: [
    "/debt_delete 3",
    "/debt_delete Capital One"
  ],
  notes: [
    "This command asks for confirmation before deleting a debt.",
    "Use /debts first if you need to check the debt id or exact name."
  ]
};
