/**
 * QUARANTINE — Phase 9.4A Security Hardening
 * Histórico inseguro de budget_items (PostgREST sem schema app / RLS / tenant).
 * @deprecated
 */

export const BUDGET_ITEMS_LEGACY_UNSAFE_IMPLEMENTATION = true;

export const createBudgetItemsLegacyUnsafe = async () => {
  throw new Error('BUDGET_ITEMS_LEGACY_UNSAFE_IMPLEMENTATION: não executar.');
};

export const listBudgetItemsByBudgetLegacyUnsafe = async () => {
  throw new Error('BUDGET_ITEMS_LEGACY_UNSAFE_IMPLEMENTATION: não executar.');
};

export const listBudgetItemsByBudgetIdsLegacyUnsafe = async () => {
  throw new Error('BUDGET_ITEMS_LEGACY_UNSAFE_IMPLEMENTATION: não executar.');
};
