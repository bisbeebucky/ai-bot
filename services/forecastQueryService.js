// services/forecastQueryService.js
function parseLocalDate(dateStr) {
  const s = String(dateStr || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(12, 0, 0, 0);
  return d;
}

function parseYMD(value) {
  const s = String(value || "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  const dt = new Date(y, mo - 1, d);
  dt.setHours(0, 0, 0, 0);

  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }

  return dt;
}

function ymd(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayYMD() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return ymd(d);
}

function diffDays(fromDate, toDate) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((toDate.getTime() - fromDate.getTime()) / msPerDay);
}

function getBankAccount(db) {
  return db.prepare(`
    SELECT id, name
    FROM accounts
    WHERE name = 'assets:bank'
  `).get() || null;
}

function getCurrentBankBalance(db) {
  const account = getBankAccount(db);
  if (!account) {
    return { ok: false, error: "assets:bank account not found." };
  }

  const row = db.prepare(`
    SELECT IFNULL(SUM(amount), 0) AS balance
    FROM postings
    WHERE account_id = ?
  `).get(account.id);

  return {
    ok: true,
    account,
    balance: Number(row?.balance) || 0
  };
}

function getForecastWindow(db, simulateCashflow, days = 30) {
  const current = getCurrentBankBalance(db);
  if (!current.ok) return current;

  const result = simulateCashflow(db, current.balance, current.account.id, days);
  const timeline = Array.isArray(result?.timeline) ? result.timeline : [];
  const lowestBalance = Number(result?.lowestBalance) || current.balance;

  let lowestDate = todayYMD();
  for (const evt of timeline) {
    if (Number(evt.balance) === lowestBalance) {
      lowestDate = String(evt.date || lowestDate);
      break;
    }
  }

  let firstNegativeDate = null;
  for (const evt of timeline) {
    const b = Number(evt.balance) || 0;
    if (b < 0) {
      firstNegativeDate = String(evt.date || "");
      break;
    }
  }

  return {
    ok: true,
    account: current.account,
    currentBalance: current.balance,
    lowestBalance,
    lowestDate,
    firstNegativeDate,
    timeline,
    days
  };
}

function getBalanceOnDate(db, simulateCashflow, rawDate) {
  const targetDate = parseYMD(rawDate);
  if (!targetDate) {
    return { ok: false, error: "Invalid date. Use YYYY-MM-DD." };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = diffDays(today, targetDate);

  if (days < 0) {
    return { ok: false, error: "Only future dates are supported." };
  }

  const current = getCurrentBankBalance(db);
  if (!current.ok) return current;

  if (days === 0) {
    return {
      ok: true,
      date: ymd(targetDate),
      currentBalance: current.balance,
      estimatedBalance: current.balance
    };
  }

  const result = simulateCashflow(db, current.balance, current.account.id, days);
  const timeline = Array.isArray(result?.timeline) ? result.timeline : [];

  let estimatedBalance = current.balance;
  for (const evt of timeline) {
    if (String(evt.date || "") <= ymd(targetDate)) {
      estimatedBalance = Number(evt.balance) || 0;
    }
  }

  return {
    ok: true,
    date: ymd(targetDate),
    currentBalance: current.balance,
    estimatedBalance
  };
}

function getWhyData(db, simulateCashflow, days = 30) {
  const forecast = getForecastWindow(db, simulateCashflow, days);
  if (!forecast.ok) return forecast;

  if (!forecast.timeline.length) {
    return {
      ok: true,
      currentBalance: forecast.currentBalance,
      lowestBalance: forecast.currentBalance,
      lowestDate: todayYMD(),
      causes: [],
      noEvents: true,
      noLowerEvent: false
    };
  }

  let lowestDateObj = null;
  for (const evt of forecast.timeline) {
    if (Number(evt.balance) === forecast.lowestBalance) {
      lowestDateObj = parseLocalDate(evt.date);
      break;
    }
  }

  if (!lowestDateObj) {
    return {
      ok: true,
      currentBalance: forecast.currentBalance,
      lowestBalance: forecast.lowestBalance,
      lowestDate: todayYMD(),
      causes: [],
      noEvents: false,
      noLowerEvent: true
    };
  }

  const causes = [];
  for (const evt of forecast.timeline) {
    const d = parseLocalDate(evt.date);
    const amt = Number(evt.amount) || 0;

    if (d && d <= lowestDateObj && amt < 0) {
      causes.push({
        description: evt.description || "expense",
        amount: Math.abs(amt)
      });
    }
  }

  causes.sort((a, b) => b.amount - a.amount);

  return {
    ok: true,
    currentBalance: forecast.currentBalance,
    lowestBalance: forecast.lowestBalance,
    lowestDate: ymd(lowestDateObj),
    causes,
    noEvents: false,
    noLowerEvent: false
  };
}

function getUntilPaydayData(db, simulateCashflow) {
  const forecast = getForecastWindow(db, simulateCashflow, 30);
  if (!forecast.ok) return forecast;

  const rows = db.prepare(`
    SELECT id, description, next_due_date, postings_json
    FROM recurring_transactions
    ORDER BY date(next_due_date) ASC, id ASC
  `).all();

  const incomeRows = rows.filter((row) => {
    try {
      const postings = JSON.parse(row.postings_json);
      const bankLine = Array.isArray(postings)
        ? postings.find((p) => p.account === "assets:bank")
        : null;
      return bankLine && (Number(bankLine.amount) || 0) > 0;
    } catch (_) {
      return false;
    }
  });

  return {
    ok: true,
    currentBalance: forecast.currentBalance,
    lowestBeforePayday: forecast.lowestBalance,
    nextPayday: incomeRows.length ? String(incomeRows[0].next_due_date || "") : null,
    safe: forecast.lowestBalance >= 0
  };
}

module.exports = {
  getForecastWindow,
  getBalanceOnDate,
  getWhyData,
  getUntilPaydayData
};
