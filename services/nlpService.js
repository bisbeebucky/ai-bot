/* ============================================
   Simple Natural Language Parser
============================================ */

function parseNaturalLanguage(text) {

  const lower = text.toLowerCase();
  const amountMatch = lower.match(/(\d+(\.\d+)?)/);

  if (!amountMatch) {
    throw new Error("No amount found.");
  }

  const amount = parseFloat(amountMatch[1]);
  const today = new Date().toISOString().split("T")[0];

  // =========================================
  // EXPENSE
  // =========================================
  if (lower.includes("spent") || lower.includes("paid")) {

    let category = "expenses:misc";

    if (lower.includes("food")) category = "expenses:food";
    if (lower.includes("rent")) category = "expenses:rent";
    if (lower.includes("gas")) category = "expenses:gas";

    return {
      date: today,
      description: text,
      postings: [
        { account: category, amount: amount },
        { account: "assets:bank", amount: -amount }
      ]
    };
  }

  // =========================================
  // INCOME
  // =========================================
  if (lower.includes("got paid") || lower.includes("salary") || lower.includes("income")) {

    return {
      date: today,
      description: text,
      postings: [
        { account: "assets:bank", amount: amount },
        { account: "income:salary", amount: -amount }
      ]
    };
  }

  throw new Error("Could not understand transaction.");
}

module.exports = { parseNaturalLanguage };
