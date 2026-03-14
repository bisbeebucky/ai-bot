// handlers/help.js
module.exports = function registerHelpHandler(bot, deps) {
  const { commandRegistry } = deps;

  const PAGE_SIZE = 13;
  const CORE_COMMANDS = [
    "status",
    "untilpayday",
    "why",
    "focus",
    "autopilot",
    "forecast_graph"
  ];

  function normalizeLookup(value) {
    return String(value || "")
      .trim()
      .replace(/^\//, "")
      .toLowerCase();
  }

  function renderFallbackOverview() {
    return [
      "Help",
      "",
      "Help index is not available yet.",
      "Try /<command> help for a specific command."
    ].join("\n");
  }

  function renderFallbackCommand(command) {
    return [
      `No help found for /${command}.`,
      "",
      "Try /help to see available commands."
    ].join("\n");
  }

  function getEntries() {
    if (!commandRegistry || typeof commandRegistry.list !== "function") {
      return [];
    }

    return commandRegistry.list();
  }

  function paginateEntries(entries, pageSize) {
    const pages = [];

    for (let i = 0; i < entries.length; i += pageSize) {
      pages.push(entries.slice(i, i + pageSize));
    }

    return pages;
  }

  function renderOverviewIndex(entries) {
    const pages = paginateEntries(entries, PAGE_SIZE);

    if (!pages.length) {
      return renderFallbackOverview();
    }

    const lines = [
      "Help",
      "",
      `Commands: ${entries.length}`,
      `Pages: ${pages.length}`,
      "",
      "Core commands"
    ];

    for (const command of CORE_COMMANDS) {
      lines.push(`/${command}`);
    }

    lines.push(
      "",
      "Use /help <page>",
      "Examples: /help 1, /help 2",
      "",
      "Use /help <command> for a specific command.",
      "You can also use /<command> help.",
      "",
      "Pages"
    );

    for (let i = 0; i < pages.length; i += 1) {
      const pageNo = i + 1;
      const pageEntries = pages[i];
      const first = pageEntries[0]?.command || "?";
      const last = pageEntries[pageEntries.length - 1]?.command || "?";
      lines.push(`/help ${pageNo}  -  /${first} ... /${last}`);
    }

    return lines.join("\n");
  }

  function renderHelpPage(entries, pageNumber) {
    const pages = paginateEntries(entries, PAGE_SIZE);

    if (!pages.length) {
      return renderFallbackOverview();
    }

    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pages.length) {
      return [
        `Help page ${pageNumber} does not exist.`,
        "",
        `Available pages: 1-${pages.length}`,
        "Try /help"
      ].join("\n");
    }

    const page = pages[pageNumber - 1];
    const lines = [
      `Help (${pageNumber}/${pages.length})`,
      "",
      "Use /help <command> for details.",
      ""
    ];

    for (const entry of page) {
      lines.push(`/${entry.command} - ${entry.summary}`);
    }

    if (pageNumber < pages.length) {
      lines.push("");
      lines.push(`Next: /help ${pageNumber + 1}`);
    }

    if (pageNumber > 1) {
      lines.push(`Prev: /help ${pageNumber - 1}`);
    }

    return lines.join("\n");
  }

  bot.onText(/^\/help(?:@\w+)?(?:\s+(.+))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    try {
      if (!commandRegistry) {
        if (!raw) {
          return bot.sendMessage(chatId, renderFallbackOverview());
        }

        return bot.sendMessage(
          chatId,
          renderFallbackCommand(normalizeLookup(raw))
        );
      }

      const entries = getEntries();

      if (!raw) {
        return bot.sendMessage(chatId, renderOverviewIndex(entries));
      }

      if (/^\d+$/.test(raw)) {
        const pageNumber = Number(raw);

        if (pageNumber === 0) {
          return bot.sendMessage(chatId, renderOverviewIndex(entries));
        }

        return bot.sendMessage(chatId, renderHelpPage(entries, pageNumber));
      }

      const command = normalizeLookup(raw);
      const text = commandRegistry.renderCommandHelp(command);

      if (!text) {
        return bot.sendMessage(chatId, renderFallbackCommand(command));
      }

      return bot.sendMessage(chatId, text, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("help error:", err);
      return bot.sendMessage(chatId, "Error showing help.");
    }
  });
};

module.exports.help = {
  command: "help",
  category: "General",
  summary: "Show help pages or detailed help for one command.",
  usage: [
    "/help",
    "/help 0",
    "/help <page>",
    "/help <command>"
  ],
  args: [
    { name: "<page>", description: "Optional help page number, such as 1 or 2. Use 0 for the overview." },
    { name: "<command>", description: "Optional command name, such as add or recurring_delete." }
  ],
  examples: [
    "/help",
    "/help 0",
    "/help 1",
    "/help 2",
    "/help add",
    "/help budget_set"
  ],
  notes: [
    "The overview page highlights the core cockpit commands.",
    "You can also use /<command> help."
  ]
};
