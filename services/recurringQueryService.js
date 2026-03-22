// services/recurringQueryService.js
function parseBankPostingInfo(postingsJson) {
  let amount = 0;
  let type = "unknown";

  try {
    const postings = JSON.parse(postingsJson);
    const bankLine = Array.isArray(postings)
      ? postings.find((p) => p.account === "assets:bank")
      : null;

    if (bankLine) {
      const bankAmt = Number(bankLine.amount) || 0;
      amount = Math.abs(bankAmt);
      type = bankAmt >= 0 ? "income" : "bill";
    }
  } catch (_) {
    amount = 0;
    type = "unknown";
  }

  return { amount, type };
}

function getRecurringRows(db, limit = null) {
  const sql = `
    SELECT id, hash, description, postings_json, frequency, next_due_date
    FROM recurring_transactions
    ORDER BY date(next_due_date) ASC, id ASC
    ${limit != null ? "LIMIT ?" : ""}
  `;

  return limit != null ? db.prepare(sql).all(limit) : db.prepare(sql).all();
}

function getRecurringItems(db, limit = 25) {
  const rows = getRecurringRows(db, limit);

  const items = rows.map((row) => {
    const { amount, type } = parseBankPostingInfo(row.postings_json);

    return {
      id: Number(row.id),
      ref: String(row.hash || "").slice(0, 6),
      description: String(row.description || ""),
      amount,
      frequency: String(row.frequency || ""),
      nextDue: String(row.next_due_date || ""),
      type
    };
  });

  return {
    ok: true,
    items
  };
}

function getDueNext(db, limit = 5) {
  const rows = getRecurringRows(db, limit);

  const items = rows.map((row) => {
    const { amount, type } = parseBankPostingInfo(row.postings_json);

    return {
      nextDue: String(row.next_due_date || ""),
      description: String(row.description || ""),
      amount,
      type
    };
  });

  return {
    ok: true,
    items
  };
}

function getUpcomingIncome(db, limit = 5) {
  const rows = getRecurringRows(db);

  const items = rows
    .map((row) => {
      const { amount, type } = parseBankPostingInfo(row.postings_json);
      return {
        nextDue: String(row.next_due_date || ""),
        description: String(row.description || ""),
        amount,
        type
      };
    })
    .filter((item) => item.type === "income")
    .slice(0, limit);

  return {
    ok: true,
    items
  };
}

function getUpcomingBills(db, limit = 5) {
  const rows = getRecurringRows(db);

  const items = rows
    .map((row) => {
      const { amount, type } = parseBankPostingInfo(row.postings_json);
      return {
        nextDue: String(row.next_due_date || ""),
        description: String(row.description || ""),
        amount,
        type
      };
    })
    .filter((item) => item.type === "bill")
    .slice(0, limit);

  return {
    ok: true,
    items
  };
}

function getNextPayday(db) {
  const rows = getRecurringRows(db);

  const item = rows
    .map((row) => {
      const { amount, type } = parseBankPostingInfo(row.postings_json);
      return {
        description: String(row.description || ""),
        nextDue: String(row.next_due_date || ""),
        amount,
        type
      };
    })
    .find((item) => item.type === "income");

  if (!item) {
    return {
      ok: true,
      item: null
    };
  }

  return {
    ok: true,
    item
  };
}

module.exports = {
  getRecurringItems,
  getDueNext,
  getUpcomingIncome,
  getUpcomingBills,
  getNextPayday
};
