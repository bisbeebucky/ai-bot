// handlers/botstatus.js
const os = require("os");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

module.exports = function registerBotStatusHandler(bot, deps) {
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

  function safeGitCommit() {
    try {
      return execSync("git rev-parse --short HEAD", {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "ignore"]
      }).toString().trim();
    } catch {
      return "unknown";
    }
  }

  function safeGitBranch() {
    try {
      return execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "ignore"]
      }).toString().trim();
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
    try {
      const dbPath = path.join(process.cwd(), "data", "ledger.sqlite");
      const stat = fs.statSync(dbPath);
      return formatBytes(stat.size);
    } catch {
      return "unknown";
    }
  }

  function safeCount(sql) {
    try {
      const row = db.prepare(sql).get();
      return Number(row?.count) || 0;
    } catch {
      return 0;
    }
  }

  bot.onText(/^\/botstatus(@\w+)?$/i, (msg) => {
    const chatId = msg.chat.id;

    try {
      let dbStatus = "OK";
      try {
        db.prepare("SELECT 1 as ok").get();
      } catch {
        dbStatus = "ERROR";
      }

      const version = safePackageVersion();
      const branch = safeGitBranch();
      const commit = safeGitCommit();
      const nodeVersion = process.version;
      const uptime = formatUptime(process.uptime());
      const rss = formatBytes(process.memoryUsage().rss);
      const dbSize = safeDbSize();
      const host = os.hostname();

      const txCount = safeCount("SELECT COUNT(*) as count FROM transactions");
      const recurringCount = safeCount("SELECT COUNT(*) as count FROM recurring_transactions");
      const debtCount = safeCount("SELECT COUNT(*) as count FROM debts");

      let out = "🤖 Bot Status\n\n";
      out += "```\n";
      out += `Version:      ${version}\n`;
      out += `Branch:       ${branch}\n`;
      out += `Git Commit:   ${commit}\n`;
      out += `Node:         ${nodeVersion}\n`;
      out += `Uptime:       ${uptime}\n`;
      out += `Memory RSS:   ${rss}\n`;
      out += `Database:     ${dbStatus}\n`;
      out += `DB Size:      ${dbSize}\n`;
      out += `Transactions: ${txCount}\n`;
      out += `Recurring:    ${recurringCount}\n`;
      out += `Debts:        ${debtCount}\n`;
      out += `Host:         ${host}\n`;
      out += "```";

      return bot.sendMessage(chatId, out, {
        parse_mode: "Markdown"
      });
    } catch (err) {
      console.error("botstatus error:", err);
      return bot.sendMessage(chatId, "Error generating bot status.");
    }
  });
};
