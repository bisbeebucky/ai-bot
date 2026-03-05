// bootstrap/singleInstance.js
const fs = require("fs");
const path = require("path");

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

module.exports = function ensureSingleInstance(appName = "ai-bot") {
  const dataDir = path.join(__dirname, "..", "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const lockPath = path.join(dataDir, `${appName}.pid`);

  // If lock exists, check if that PID is still running
  if (fs.existsSync(lockPath)) {
    const raw = fs.readFileSync(lockPath, "utf8").trim();
    const pid = Number(raw);

    if (Number.isInteger(pid) && pid > 0 && isProcessAlive(pid)) {
      console.error(
        `[lock] Another instance is already running (pid ${pid}). Exiting.`
      );
      process.exit(1);
    }

    // stale lock
    try {
      fs.unlinkSync(lockPath);
    } catch {}
  }

  // write our PID
  fs.writeFileSync(lockPath, String(process.pid), "utf8");

  // remove lock on exit
  const cleanup = () => {
    try {
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    } catch {}
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  console.log(`[lock] Acquired single-instance lock (${lockPath})`);
};
