const fs = require("fs");
const path = require("path");
const { getAllTransactions } = require("./ledgerService");

const tempJournalPath = path.join(__dirname, "..", "db", "generated.journal");

function generateJournalFile() {
  const rows = getAllTransactions();

  let journal = "";
  let currentTx = null;

  for (const row of rows) {
    if (currentTx !== row.id) {
      journal += `\n${row.date} ${row.description}\n`;
      currentTx = row.id;
    }
    journal += `    ${row.account}    ${row.amount ?? ""}\n`;
  }

  fs.writeFileSync(tempJournalPath, journal);
  return tempJournalPath;
}

module.exports = { generateJournalFile };
