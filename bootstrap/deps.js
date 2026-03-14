// bootstrap/deps.js
const createLedgerService = require("../services/ledgerService");
const createFinanceEngine = require("../services/financeEngine");
const createRecurringProcessor = require("../services/recurringProcessor");
const createReconciliationService = require("../services/reconciliationService");

const reportService = require("../services/reportService");
const recurringService = require("../services/recurringService");

const simulateCashflow = require("../core/simulation");

const format = require("../utils/format");
const finance = require("../utils/finance");

const debt = require("../services/debt_utils");
const debtProjection = require("../services/debt_projection");

module.exports = function createDeps(db, openai) {
  const ledgerService = createLedgerService(db);
  const financeEngine = createFinanceEngine(ledgerService);
  const recurringProcessor = createRecurringProcessor(db, ledgerService);
  const reconciliationService = createReconciliationService({ ledgerService });

  const deps = {
    db,
    openai,

    ledgerService,
    financeEngine,
    reportService,
    recurringService,
    recurringProcessor,
    reconciliationService,

    simulateCashflow,

    format,
    finance,
    debt,
    debtProjection
  };

  return Object.freeze(deps);
};
