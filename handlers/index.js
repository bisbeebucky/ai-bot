const fs = require("fs");
const path = require("path");

module.exports = function registerAllHandlers(bot, deps) {
  const files = fs.readdirSync(__dirname);

  for (const file of files) {
    if (file === "index.js") continue;
    if (!file.endsWith(".js")) continue;

    const handlerPath = path.join(__dirname, file);
    const handler = require(handlerPath);

    if (typeof handler === "function") {
      console.log(`Loading handler: ${file}`);
      handler(bot, deps);
    } else {
      console.warn(`Skipping ${file} — not a function export`);
    }
  }
};
