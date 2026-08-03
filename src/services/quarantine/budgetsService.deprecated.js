/**
 * QUARANTINE — Phase 9.4A Security Hardening
 *
 * Cópia histórica do budgetsService legado (PostgREST `budgets` sem schema app /
 * sem RLS / sem tenant filter). NÃO importar em runtime de produção.
 *
 * Substituto funcional atual: fluxos IndexedDB (`crmBudgetService` / clinical budgets).
 * Phase 9.4B (Orçamentos) deve introduzir schema + RLS + repository com tenant SSOT.
 *
 * @deprecated
 */

export const BUDGETS_LEGACY_UNSAFE_IMPLEMENTATION = true;

export const createBudgetLegacyUnsafe = async () => {
  throw new Error(
    'BUDGETS_LEGACY_UNSAFE_IMPLEMENTATION: não executar. Use quarantine shim em budgetsService.js.',
  );
};

export const listBudgetsLegacyUnsafe = async () => {
  throw new Error(
    'BUDGETS_LEGACY_UNSAFE_IMPLEMENTATION: não executar. Use quarantine shim em budgetsService.js.',
  );
};

export const updateBudgetTotalLegacyUnsafe = async () => {
  throw new Error(
    'BUDGETS_LEGACY_UNSAFE_IMPLEMENTATION: não executar. Use quarantine shim em budgetsService.js.',
  );
};
