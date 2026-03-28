// handlers/ocstatus.js
const os = require("os");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

module.exports = function registerOcstatusHandler(bot, deps) {
  const { db } = deps;

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function formatUptime(sec) {
    const s = Math.floor(Number(sec) || 0);
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  function safeExec(cmd) {
    try {
      return execSync(cmd, {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim();
    } catch {
      return "unknown";
    }
  }

  function safePackageVersion() {
    try {
      const pkg = require(path.join(process.cwd(), "package.json"));
      return pkg.version || "unknown";
    } catch {
      return "unknown";
    }
  }

  function safeDbSize() {
    const candidates = [
      path.join(process.cwd(), "data", "ledger.sqlite"),
      path.join(process.cwd(), "data", "bot.sqlite"),
      path.join(process.cwd(), "ledger.sqlite"),
    ];

    for (const p of candidates) {
      try {
        const stat = fs.statSync(p);
        return formatBytes(stat.size);
      } catch {
        // try next candidate
      }
    }

    return "unknown";
  }

  function safeCount(sql) {
    try {
      const row = db.prepare(sql).get();
      return Number(row?.count) || 0;
    } catch {
      return 0;
    }
  }

  function envFirst(...keys) {
    for (const k of keys) {
      const v = process.env[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }

  function maskUrl(raw) {
    if (!raw) return "unknown";

    try {
      const u = new URL(raw);
      return `${u.protocol}//${u.host}${u.pathname}`;
    } catch {
      return raw;
    }
  }

  function detectGateway(baseUrl) {
    const s = String(baseUrl || "").toLowerCase();

    if (!s) return "unknown";
    if (s.includes("openclaw")) return "OpenClaw";
    if (s.includes("openrouter")) return "OpenRouter";
    if (s.includes("localhost") || s.includes("127.0.0.1"))
      return "local gateway";
    return "custom";
  }

  function detectModel() {
    return (
      envFirst("OPENROUTER_MODEL", "MODEL", "DEFAULT_MODEL", "LLM_MODEL") ||
      "unknown"
    );
  }

  function detectBaseUrl() {
    return envFirst(
      "OPENAI_BASE_URL",
      "OPENAI_API_BASE",
      "OPENROUTER_BASE_URL",
      "OPENCLAW_BASE_URL",
      "BASE_URL",
    );
  }

  function detectApiKeyPresence() {
    const key = envFirst(
      "OPENAI_API_KEY",
      "OPENROUTER_API_KEY",
      "OPENCLAW_API_KEY",
      "API_KEY",
    );

    return key ? "set" : "missing";
  }

  function renderHelp() {
    return [
      "*\\/ocstatus*",
      "Show OpenClaw or gateway runtime status, including version, git info, model, base URL, memory, database health, and record counts.",
      "",
      "*Usage*",
      "- `/ocstatus`",
      "",
      "*Examples*",
      "- `/ocstatus`",
      "",
      "*Notes*",
      "- Detects gateway and model from available environment variables.",
      "- Database counts include transactions, recurring items, debts, and budgets.",
    ].join("\n");
  }

  function sendHelp(chatId) {
    return bot.sendMessage(chatId, renderHelp(), {
      parse_mode: "Markdown",
    });
  }

  bot.onText(/^\/ocstatus(?:@\w+)?(?:\s+(.*))?$/i, (msg, match) => {
    const chatId = msg.chat.id;
    const raw = String(match?.[1] || "").trim();

    if (raw) {
      if (/^(help|--help|-h)$/i.test(raw)) {
        return sendHelp(chatId);
      }

      return bot.sendMessage(
        chatId,
        [
          "The `/ocstatus` command does not take arguments.",
          "",
          "Usage:",
          "`/ocstatus`",
        ].join("\n"),
        { parse_mode: "Markdown" },
      );
    }

    try {
      let dbStatus = "OK";

      try {
        db.prepare("SELECT 1 as ok").get();
      } catch {
        dbStatus = "ERROR";
      }

      const version = safePackageVersion();
      const branch = safeExec("git rev-parse --abbrev-ref HEAD");
      const commit = safeExec("git rev-parse --short HEAD");
      const nodeVersion = process.version;
      const uptime = formatUptime(process.uptime());
      const rss = formatBytes(process.memoryUsage().rss);
      const dbSize = safeDbSize();
      const host = os.hostname();

      const txCount = safeCount("SELECT COUNT(*) as count FROM transactions");
      const recurringCount = safeCount(
        "SELECT COUNT(*) as count FROM recurring_transactions",
      );
      const debtCount = safeCount("SELECT COUNT(*) as count FROM debts");
      const budgetCount = safeCount("SELECT COUNT(*) as count FROM budgets");

      const baseUrl = detectBaseUrl();
      const gateway = detectGateway(baseUrl);
      const model = detectModel();
      const apiKeyStatus = detectApiKeyPresence();

      let out = "🧠 OpenClaw Status\n\n";
      out += "```\n";
      out += `Version:      ${version}\n`;
      out += `Branch:       ${branch}\n`;
      out += `Git Commit:   ${commit}\n`;
      out += `Gateway:      ${gateway}\n`;
      out += `Base URL:     ${maskUrl(baseUrl)}\n`;
      out += `Model:        ${model}\n`;
      out += `API Key:      ${apiKeyStatus}\n`;
      out += `Node:         ${nodeVersion}\n`;
      out += `Uptime:       ${uptime}\n`;
      out += `Memory RSS:   ${rss}\n`;
      out += `Database:     ${dbStatus}\n`;
      out += `DB Size:      ${dbSize}\n`;
      out += `Transactions: ${txCount}\n`;
      out += `Recurring:    ${recurringCount}\n`;
      out += `Debts:        ${debtCount}\n`;
      out += `Budgets:      ${budgetCount}\n`;
      out += `Host:         ${host}\n`;
      out += "```";

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown",
      });
    } catch (err) {
      console.error("ocstatus error:", err);
      return bot.sendMessage(chatId, "Error generating OpenClaw status.");
    }
  });
};

module.exports.help = {
  command: "ocstatus",
  category: "Runtime",
  summary:
    "Show OpenClaw or gateway runtime status, including version, model, base URL, memory, database health, and record counts.",
  usage: ["/ocstatus"],
  examples: ["/ocstatus"],
  notes: [
    "Detects gateway and model from available environment variables.",
    "Database counts include transactions, recurring items, debts, and budgets.",
  ],
};
