/**
 * budgetItemsService — QUARANTINED (Phase 9.4A Security Hardening).
 * Ver budgetsService.js. Substituto: IndexedDB / crmBudgetService.
 */

export const BUDGET_ITEMS_SERVICE_QUARANTINED = true;
export const BUDGET_ITEMS_QUARANTINE_CODE = 'BUDGET_ITEMS_SERVICE_QUARANTINED';
export const BUDGET_ITEMS_QUARANTINE_REASON =
  'Acesso PostgREST a budget_items bloqueado até schema+RLS+tenant filtering (Phase 9.4B).';

function deny(operation) {
  const err = new Error(
    `${BUDGET_ITEMS_QUARANTINE_CODE}: ${operation} — ${BUDGET_ITEMS_QUARANTINE_REASON}`,
  );
  err.code = BUDGET_ITEMS_QUARANTINE_CODE;
  err.operation = operation;
  throw err;
}

export const createBudgetItems = async () => {
  deny('createBudgetItems');
};

export const listBudgetItemsByBudget = async () => {
  deny('listBudgetItemsByBudget');
};

export const listBudgetItemsByBudgetIds = async () => {
  deny('listBudgetItemsByBudgetIds');
};
