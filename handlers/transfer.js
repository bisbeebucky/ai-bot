// handlers/transfer.js
module.exports = function registerTransferHandler(bot, deps) {
  const { ledgerService, format } = deps;
  const { formatMoney, codeBlock } = format;

  function normalizeAccountName(value) {
    const raw = String(value || "").trim().toLowerCase();

    if (raw === "bank" || raw === "assets:bank") {
      return "assets:bank";
    }

    if (raw === "savings" || raw === "assets:savings") {
      return "assets:savings";
    }

    return "";
  }

  function shortAccountName(account) {
    if (account === "assets:bank") return "bank";
    if (account === "assets:savings") return "savings";
    return account;
  }

  function renderHelp() {
    return [
      "*\\/transfer*",
      "Move money between assets:bank and assets:savings.",
      "",
      "*Usage*",
      "- `/transfer <amount> <from> <to>`",
      "",
      "*Arguments*",
      "- `<amount>` — Positive amount to transfer.",
      "- `<from>` — Source account: `bank` or `savings`.",
      "- `<to>` — Destination account: `bank` or `savings`.",
      "",
      "*Examples*",
      "- `/transfer 89 savings bank`",
      "- `/transfer 25 bank savings`",
      "",
      "*Notes*",
      "- Only supports transfers between bank and savings.",
      "- Description is recorded as `Transfer: <from> -> <to>`."
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/transfer(?:@\w+)?(?:\s+(.*))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (!raw || /^(help|--help|-h)$/i.test(raw)) {
      return sendHelp(chatId);
    }

    try {
      const parsed = raw.match(/^(-?\d+(?:\.\d+)?)\s+(\S+)\s+(\S+)$/);

      if (!parsed) {
        return bot.sendMessage(
          chatId,
          [
            "Missing or invalid arguments for `/transfer`.",
            "",
            "Usage:",
            "`/transfer <amount> <from> <to>`",
            "",
            "Example:",
            "`/transfer 89 savings bank`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const amount = Number(parsed[1]);
      const from = normalizeAccountName(parsed[2]);
      const to = normalizeAccountName(parsed[3]);

      if (!Number.isFinite(amount) || amount <= 0) {
        return bot.sendMessage(
          chatId,
          [
            "Amount must be a positive number.",
            "",
            "Usage:",
            "`/transfer <amount> <from> <to>`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      if (!from || !to) {
        return bot.sendMessage(
          chatId,
          [
            "Accounts must be `bank` or `savings`.",
            "",
            "Usage:",
            "`/transfer <amount> <from> <to>`",
            "",
            "Example:",
            "`/transfer 89 savings bank`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      if (from === to) {
        return bot.sendMessage(
          chatId,
          "Source and destination accounts must be different."
        );
      }

      const description = `Transfer: ${shortAccountName(from)} -> ${shortAccountName(to)}`;

      await Promise.resolve(
        ledgerService.addTransaction({
          date: new Date().toISOString().slice(0, 10),
          description,
          postings: [
            { account: from, amount: -amount },
            { account: to, amount: amount }
          ]
        })
      );

      return bot.sendMessage(
        chatId,
        [
          "🔁 *Transfer recorded*",
          "",
          codeBlock([
            `Amount   ${formatMoney(amount)}`,
            `From     ${from}`,
            `To       ${to}`
          ].join("\n"))
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      console.error("transfer error:", err);
      return bot.sendMessage(chatId, "Error recording transfer.");
    }
  });
};

module.exports.help = {
  command: "transfer",
  category: "Entry",
  summary: "Move money between assets:bank and assets:savings.",
  usage: [
    "/transfer <amount> <from> <to>"
  ],
  args: [
    { name: "<amount>", description: "Positive amount to transfer." },
    { name: "<from>", description: "Source account: bank or savings." },
    { name: "<to>", description: "Destination account: bank or savings." }
  ],
  examples: [
    "/transfer 89 savings bank",
    "/transfer 25 bank savings"
  ],
  notes: [
    "Only supports transfers between bank and savings.",
    "Description is recorded as `Transfer: <from> -> <to>`."
  ]
};
