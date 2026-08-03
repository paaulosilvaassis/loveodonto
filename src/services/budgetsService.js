/**
 * budgetsService — QUARANTINED (Phase 9.4A Security Hardening).
 *
 * Motivo: referenciava `public.budgets` sem migration app, sem RLS e sem tenant filter
 * (update/delete por id). Consumidor residual: ClinicalAppointmentPage (listagem).
 *
 * Até Phase 9.4B (schema + RLS + tenant SSOT), qualquer chamada falha de forma explícita.
 * Substituto: IndexedDB / crmBudgetService.
 */

export const BUDGETS_SERVICE_QUARANTINED = true;
export const BUDGETS_QUARANTINE_CODE = 'BUDGETS_SERVICE_QUARANTINED';
export const BUDGETS_QUARANTINE_REASON =
  'Acesso PostgREST a budgets bloqueado até schema+RLS+tenant filtering (Phase 9.4B). Use IndexedDB/crmBudgetService.';

function deny(operation) {
  const err = new Error(`${BUDGETS_QUARANTINE_CODE}: ${operation} — ${BUDGETS_QUARANTINE_REASON}`);
  err.code = BUDGETS_QUARANTINE_CODE;
  err.operation = operation;
  throw err;
}

export const createBudget = async () => {
  deny('createBudget');
};

export const listBudgets = async () => {
  deny('listBudgets');
};

export const updateBudgetTotal = async () => {
  deny('updateBudgetTotal');
};
