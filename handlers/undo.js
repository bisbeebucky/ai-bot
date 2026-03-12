// handlers/undo.js
module.exports = function registerUndoHandler(bot, deps) {
  const { ledgerService, db, format } = deps;
  const { formatMoney, codeBlock } = format;

  function renderHelp() {
    return [
      "*\\/undo*",
      "Undo the most recent transaction or a specific transaction by hash prefix.",
      "",
      "*Usage*",
      "- `/undo`",
      "- `/undo <hashprefix>`",
      "",
      "*Examples*",
      "- `/undo`",
      "- `/undo 1c11`",
      "",
      "*Notes*",
      "- This command now asks for confirmation before deleting a transaction.",
      "- You can use a short hash prefix from `/history`."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  function formatSignedMoney(value) {
    const n = Number(value) || 0;
    return `${n >= 0 ? "+" : "-"}${formatMoney(Math.abs(n))}`;
  }

  function getLastTransactionCandidate() {
    return db.prepare(`
      SELECT
        t.id,
        t.hash,
        t.date,
        t.description,
        COALESCE(
          (
            SELECT p.amount
            FROM postings p
            JOIN accounts a ON a.id = p.account_id
            WHERE p.transaction_id = t.id
              AND a.name = 'assets:bank'
            LIMIT 1
          ),
          (
            SELECT p.amount
            FROM postings p
            JOIN accounts a ON a.id = p.account_id
            WHERE p.transaction_id = t.id
              AND a.name = 'assets:savings'
            LIMIT 1
          ),
          (
            SELECT CASE
              WHEN a.name LIKE 'expenses:%' THEN -ABS(p.amount)
              WHEN a.name LIKE 'income:%' THEN ABS(p.amount)
              ELSE p.amount
            END
            FROM postings p
            JOIN accounts a ON a.id = p.account_id
            WHERE p.transaction_id = t.id
            ORDER BY ABS(p.amount) DESC, p.id ASC
            LIMIT 1
          ),
          0
        ) AS amount
      FROM transactions t
      ORDER BY t.id DESC
      LIMIT 1
    `).get();
  }

  function getTransactionCandidateByHashPrefix(prefix) {
    const p = String(prefix || "").trim();
    if (!p) return null;

    return db.prepare(`
      SELECT
        t.id,
        t.hash,
        t.date,
        t.description,
        COALESCE(
          (
            SELECT p.amount
            FROM postings p
            JOIN accounts a ON a.id = p.account_id
            WHERE p.transaction_id = t.id
              AND a.name = 'assets:bank'
            LIMIT 1
          ),
          (
            SELECT p.amount
            FROM postings p
            JOIN accounts a ON a.id = p.account_id
            WHERE p.transaction_id = t.id
              AND a.name = 'assets:savings'
            LIMIT 1
          ),
          (
            SELECT CASE
              WHEN a.name LIKE 'expenses:%' THEN -ABS(p.amount)
              WHEN a.name LIKE 'income:%' THEN ABS(p.amount)
              ELSE p.amount
            END
            FROM postings p
            JOIN accounts a ON a.id = p.account_id
            WHERE p.transaction_id = t.id
            ORDER BY ABS(p.amount) DESC, p.id ASC
            LIMIT 1
          ),
          0
        ) AS amount
      FROM transactions t
      WHERE t.hash LIKE ?
      ORDER BY t.id DESC
      LIMIT 1
    `).get(`${p}%`);
  }

  function buildPreviewText(tx) {
    const shortHash = String(tx.hash || "").slice(0, 8);

    return [
      "↩️ *Confirm Undo*",
      "",
      "Undo this transaction?",
      "",
      codeBlock([
        `Date   ${tx.date}`,
        `Hash   ${shortHash}`,
        `Amt    ${formatSignedMoney(tx.amount)}`,
        "",
        `${tx.description}`
      ].join("\n"))
    ].join("\n");
  }

  bot.onText(/^\/undo(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw && /^(help|--help|-h)$/i.test(raw)) {
      return sendHelp(chatId);
    }

    try {
      const tx = raw
        ? getTransactionCandidateByHashPrefix(raw)
        : getLastTransactionCandidate();

      if (!tx) {
        if (raw) {
          return bot.sendMessage(chatId, `No transaction found for ${raw}`);
        }
        return bot.sendMessage(chatId, "Nothing to undo.");
      }

      const shortHash = String(tx.hash || "").slice(0, 8);
      const preview = buildPreviewText(tx);

      return bot.sendMessage(chatId, preview, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Yes, undo", callback_data: `undo_yes:${shortHash}` },
              { text: "❌ Cancel", callback_data: `undo_no:${shortHash}` }
            ]
          ]
        }
      });
    } catch (err) {
      console.error("Undo error:", err);
      return bot.sendMessage(chatId, "Undo failed.");
    }
  });

  bot.on("callback_query", (query) => {
    const data = String(query?.data || "");
    const message = query?.message;
    const chatId = message?.chat?.id;
    const messageId = message?.message_id;

    if (!data.startsWith("undo_yes:") && !data.startsWith("undo_no:")) {
      return;
    }

    if (!chatId || !messageId) {
      return bot.answerCallbackQuery(query.id).catch(() => { });
    }

    const hashPrefix = data.split(":")[1];

    if (data.startsWith("undo_no:")) {
      bot.answerCallbackQuery(query.id, {
        text: "Undo cancelled."
      }).catch(() => { });

      return bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: messageId }
      ).catch(() => { });
    }

    try {
      const deleted = ledgerService.deleteTransactionByHashPrefix(hashPrefix);

      bot.answerCallbackQuery(query.id, {
        text: deleted ? "Transaction undone." : "Nothing to undo."
      }).catch(() => { });

      if (!deleted) {
        return bot.editMessageText(
          "That transaction was already removed or could not be found.",
          {
            chat_id: chatId,
            message_id: messageId
          }
        ).catch(() => { });
      }

      const shortHash = String(deleted.hash || "").slice(0, 8);

      return bot.editMessageText(
        [
          "↩️ *Transaction Undone*",
          "",
          codeBlock([
            `Date   ${deleted.date}`,
            `Hash   ${shortHash}`,
            "",
            `${deleted.description}`
          ].join("\n"))
        ].join("\n"),
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown"
        }
      ).catch(() => { });
    } catch (err) {
      console.error("Undo confirm error:", err);

      bot.answerCallbackQuery(query.id, {
        text: "Undo failed."
      }).catch(() => { });

      return bot.editMessageText("Undo failed.", {
        chat_id: chatId,
        message_id: messageId
      }).catch(() => { });
    }
  });
};

module.exports.help = {
  command: "undo",
  category: "Entry",
  summary: "Undo the most recent transaction or a transaction by hash prefix.",
  usage: [
    "/undo",
    "/undo <hashprefix>"
  ],
  examples: [
    "/undo",
    "/undo 1c11"
  ],
  notes: [
    "This command asks for confirmation before deleting a transaction.",
    "You can use a short hash prefix from /history."
  ]
};
