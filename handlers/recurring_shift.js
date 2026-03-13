// handlers/recurring_shift.js
module.exports = function registerRecurringShiftHandler(bot, deps) {

  const { db, format } = deps;
  const { codeBlock } = format;

  function renderHelp() {
    return [
      "*\\/recurring_shift*",
      "Shift the next due date of a recurring item.",
      "",
      "*Usage*",
      "- `/recurring_shift <id> <YYYY-MM-DD>`",
      "",
      "*Examples*",
      "- `/recurring_shift 17 2026-04-06`"
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown"
    });
  }

  bot.onText(/^\/recurring_shift(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {

    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (!raw || /^(help|--help|-h)$/i.test(raw)) {
      return sendHelp(chatId);
    }

    try {

      const parsed = raw.match(/^(\d+)\s+(\d{4}-\d{2}-\d{2})$/);

      if (!parsed) {
        return bot.sendMessage(
          chatId,
          [
            "Invalid arguments.",
            "",
            "Usage:",
            "`/recurring_shift <id> <YYYY-MM-DD>`",
            "",
            "Example:",
            "`/recurring_shift 17 2026-04-06`"
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      }

      const id = Number(parsed[1]);
      const newDate = parsed[2];

      const row = db.prepare(`
        SELECT id, description, next_due_date
        FROM recurring_transactions
        WHERE id = ?
      `).get(id);

      if (!row) {
        return bot.sendMessage(chatId, "Recurring item not found.");
      }

      db.prepare(`
        UPDATE recurring_transactions
        SET next_due_date = ?
        WHERE id = ?
      `).run(newDate, id);

      const out = [
        "🔁 *Recurring date updated*",
        "",
        codeBlock([
          `ID          ${row.id}`,
          `Description ${row.description}`,
          `Old Date    ${row.next_due_date}`,
          `New Date    ${newDate}`
        ].join("\n"))
      ].join("\n");

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });

    } catch (err) {

      console.error("recurring_shift error:", err);
      return bot.sendMessage(chatId, "Error updating recurring item.");

    }

  });

};

module.exports.help = {
  command: "recurring_shift",
  category: "Recurring",
  summary: "Shift the next due date of a recurring item.",
  usage: [
    "/recurring_shift <id> <YYYY-MM-DD>"
  ],
  examples: [
    "/recurring_shift 17 2026-04-06"
  ]
};
