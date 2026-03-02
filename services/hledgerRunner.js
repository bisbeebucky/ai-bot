const { execSync } = require("child_process");
const { generateJournalFile } = require("./journalGenerator");

function runHledger(command) {
  const file = generateJournalFile();
  return execSync(`hledger -f ${file} ${command}`).toString();
}

module.exports = { runHledger };
