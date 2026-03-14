module.exports = function createReconciliationService(deps) {
  const { ledgerService } = deps;

  const FRIENDLY_ACCOUNT_MAP = {
    bank: "assets:bank",
    savings: "assets:savings"
  };

  function resolveAccount(accountInput) {
    const key = String(accountInput || "").trim().toLowerCase();
    return FRIENDLY_ACCOUNT_MAP[key] || null;
  }

  function getLedgerBalance(accountName) {
    const balances = ledgerService.getBalances();
    const row = balances.find((b) => b.account === accountName);
    return Number(row?.balance) || 0;
  }

  function buildPreview(accountInput, actualBalanceInput) {
    const account = resolveAccount(accountInput);
    if (!account) {
      throw new Error("Unsupported account. Use `bank` or `savings`.");
    }

    const actualBalance = Number(actualBalanceInput);
    if (!Number.isFinite(actualBalance)) {
      throw new Error("Actual balance must be a valid number.");
    }

    const currentBalance = getLedgerBalance(account);
    const delta = actualBalance - currentBalance;

    return {
      accountInput: String(accountInput).trim().toLowerCase(),
      account,
      currentBalance,
      actualBalance,
      delta
    };
  }

  function applyReconciliation(accountInput, actualBalanceInput) {
    const preview = buildPreview(accountInput, actualBalanceInput);

    if (Math.abs(preview.delta) < 0.000001) {
      return {
        ...preview,
        applied: false,
        reason: "already_aligned"
      };
    }

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const date = `${yyyy}-${mm}-${dd}`;

    const description = `Reconciliation adjustment for ${preview.account}`;

    const result = ledgerService.addTransaction({
      date,
      description,
      postings: [
        { account: preview.account, amount: preview.delta },
        { account: "equity:reconciliation", amount: -preview.delta }
      ]
    });

    return {
      ...preview,
      applied: true,
      transactionId: result?.transactionId,
      hash: result?.hash
    };
  }

  return {
    resolveAccount,
    getLedgerBalance,
    buildPreview,
    applyReconciliation
  };
};
