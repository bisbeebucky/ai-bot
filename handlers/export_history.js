const fs = require("fs");
const os = require("os");
const path = require("path");

module.exports = function registerExportHistoryHandler(bot, deps) {
  const { db } = deps;

  const DEFAULT_DAYS = 90;
  const MIN_DAYS = 1;
  const MAX_DAYS = 365;

  function renderHelp() {
    return [
      "*\\/export_history*",
      "Export recent transaction history as a CSV file for Google Sheets or spreadsheets.",
      "",
      "*Usage*",
      "- `/export_history`",
      "- `/export_history <days>`",
      "",
      "*Examples*",
      "- `/export_history`",
      "- `/export_history 30`",
      "- `/export_history 90`",
      "- `/export_history 180`",
      "",
      "*Notes*",
      `- Defaults to the last ${DEFAULT_DAYS} days.`,
      `- Supports ${MIN_DAYS}-${MAX_DAYS} days.`,
      "- Sends a CSV file that can be imported into Google Sheets.",
      "- Includes a short transaction reference that matches `/history` and `/undo` style.",
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown",
    });
  }

  function csvEscape(value) {
    const s = String(value ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  function rowsToCsv(headers, rows) {
    return [
      headers.map(csvEscape).join(","),
      ...rows.map((row) => row.map(csvEscape).join(",")),
    ].join("\n");
  }

  function detectTransactionType(accountName) {
    const name = String(accountName || "");
    if (name === "assets:bank") return "bank";
    if (name === "assets:savings") return "savings";
    if (name.startsWith("income:")) return "income";
    if (name.startsWith("expenses:")) return "expense";
    if (name.startsWith("liabilities:")) return "liability";
    if (name.startsWith("equity:")) return "equity";
    return "other";
  }

  bot.onText(/^\/export_history(?:@\w+)?(?:\s+(.*))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    let days = DEFAULT_DAYS;

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      if (!/^\d+$/.test(raw)) {
        return bot.sendMessage(
          chatId,
          [
            "Usage:",
            "`/export_history`",
            "`/export_history <days>`",
            "",
            `Examples: \`/export_history 30\`, \`/export_history ${DEFAULT_DAYS}\``,
          ].join("\n"),
          { parse_mode: "Markdown" },
        );
      }

      days = Number(raw);

      if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS) {
        return bot.sendMessage(
          chatId,
          [
            `Days must be between ${MIN_DAYS} and ${MAX_DAYS}.`,
            "",
            "Usage:",
            "`/export_history <days>`",
          ].join("\n"),
          { parse_mode: "Markdown" },
        );
      }
    }

    try {
      const rows = db
        .prepare(
          `
        SELECT
          t.id,
          t.date,
          t.description,
          t.hash,

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
              SELECT
                CASE
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
          ) AS amount,

          COALESCE(
            (
              SELECT a.name
              FROM postings p
              JOIN accounts a ON a.id = p.account_id
              WHERE p.transaction_id = t.id
                AND a.name LIKE 'expenses:%'
              ORDER BY ABS(p.amount) DESC, p.id ASC
              LIMIT 1
            ),
            (
              SELECT a.name
              FROM postings p
              JOIN accounts a ON a.id = p.account_id
              WHERE p.transaction_id = t.id
                AND a.name LIKE 'income:%'
              ORDER BY ABS(p.amount) DESC, p.id ASC
              LIMIT 1
            ),
            (
              SELECT a.name
              FROM postings p
              JOIN accounts a ON a.id = p.account_id
              WHERE p.transaction_id = t.id
              ORDER BY ABS(p.amount) DESC, p.id ASC
              LIMIT 1
            ),
            ''
          ) AS primary_account,

          COALESCE(
            (
              SELECT p.amount
              FROM postings p
              JOIN accounts a ON a.id = p.account_id
              WHERE p.transaction_id = t.id
                AND a.name = 'assets:bank'
              LIMIT 1
            ),
            0
          ) AS bank_amount,

          COALESCE(
            (
              SELECT p.amount
              FROM postings p
              JOIN accounts a ON a.id = p.account_id
              WHERE p.transaction_id = t.id
                AND a.name = 'assets:savings'
              LIMIT 1
            ),
            0
          ) AS savings_amount

        FROM transactions t
        WHERE date(t.date) >= date('now', ?)
        ORDER BY date(t.date) DESC, t.id DESC
      `,
        )
        .all(`-${days} days`);

      if (!rows.length) {
        return bot.sendMessage(
          chatId,
          `No transactions found in the last ${days} days.`,
        );
      }

      const csvRows = rows.map((r) => {
        const account = String(r.primary_account || "");
        const amount = Number(r.amount) || 0;
        const bankAmount = Number(r.bank_amount) || 0;
        const savingsAmount = Number(r.savings_amount) || 0;
        const transactionType = detectTransactionType(account);
        const ref = `tx-${String(r.hash || "").slice(0, 8)}`;

        return [
          r.date,
          r.description,
          ref,
          amount,
          account,
          bankAmount,
          savingsAmount,
          transactionType,
        ];
      });

      const csv = rowsToCsv(
        [
          "date",
          "description",
          "ref",
          "amount",
          "account",
          "bank_amount",
          "savings_amount",
          "transaction_type",
        ],
        csvRows,
      );

      const stamp = new Date().toISOString().slice(0, 10);
      const filePath = path.join(
        os.tmpdir(),
        `kalverion_history_${days}d_${stamp}.csv`,
      );

      fs.writeFileSync(filePath, csv, "utf8");

      await bot.sendDocument(chatId, filePath, {
        caption: `Last ${days} days of transaction history (CSV)`,
      });

      try {
        fs.unlinkSync(filePath);
      } catch (_) {
        // ignore cleanup failure
      }
    } catch (err) {
      console.error("export_history error:", err);
      return bot.sendMessage(chatId, "Error exporting history.");
    }
  });
};

module.exports.help = {
  command: "export_history",
  category: "Reporting",
  summary: "Export recent transaction history as CSV.",
  usage: ["/export_history", "/export_history <days>"],
  examples: [
    "/export_history",
    "/export_history 30",
    "/export_history 90",
    "/export_history 180",
  ],
  notes: [
    "Defaults to the last 90 days.",
    "Supports 1-365 days.",
    "Sends a CSV file that can be imported into Google Sheets.",
    "Includes a short transaction reference that matches `/history` and `/undo` style.",
  ],
};
