/**
 * Resolução determinística contrato ← orçamento.
 * budgetId explícito nunca cai para patientId/appointmentId/primeiro da lista.
 */
import { peekDb } from '../db/index.js';

export const NO_CONTRACT_FOR_SELECTED_BUDGET = 'NO_CONTRACT_FOR_SELECTED_BUDGET';
export const CONTRACT_BUDGET_MISMATCH = 'CONTRACT_BUDGET_MISMATCH';

const INACTIVE = new Set(['replaced', 'canceled', 'cancelled', 'refused']);

function norm(value) {
  return value == null || value === '' ? '' : String(value);
}

function isActiveStatus(status) {
  return !INACTIVE.has(String(status || '').toLowerCase());
}

/**
 * @returns {{ ok: boolean, code: string|null, contract: object|null }}
 */
export function resolveContractForSelectedBudget({
  budgetId = null,
  appointmentId = null,
  patientId = null,
  contractId = null,
  clinicId = null,
  /** Snapshot read-only opcional — evita peekDb/loadDb no hot path do hub. */
  db: explicitDb = null,
} = {}) {
  const db = explicitDb || peekDb();
  const list = Array.isArray(db.generatedContracts) ? db.generatedContracts : [];
  const cid = norm(clinicId);
  const scoped = cid
    ? list.filter((row) => !row.clinicId || norm(row.clinicId) === cid)
    : list;

  if (contractId) {
    const found = scoped.find((row) => norm(row.id) === norm(contractId)) || null;
    if (!found) {
      return { ok: false, code: NO_CONTRACT_FOR_SELECTED_BUDGET, contract: null };
    }
    if (budgetId && norm(found.budgetId) && norm(found.budgetId) !== norm(budgetId)) {
      return { ok: false, code: CONTRACT_BUDGET_MISMATCH, contract: null };
    }
    if (budgetId && !norm(found.budgetId)) {
      return { ok: false, code: CONTRACT_BUDGET_MISMATCH, contract: null };
    }
    return { ok: true, code: null, contract: found };
  }

  if (!budgetId) {
    return { ok: false, code: 'BUDGET_ID_REQUIRED', contract: null };
  }

  const matched = scoped.filter((row) => norm(row.budgetId) === norm(budgetId));
  const invariant = matched.filter((row) => {
    if (appointmentId && row.quoteId && norm(row.quoteId) !== norm(appointmentId)) return false;
    if (patientId && row.patientId && norm(row.patientId) !== norm(patientId)) return false;
    return true;
  });
  const active = invariant.filter((row) => isActiveStatus(row.status));
  const chosen = active[0] || null;
  if (!chosen) {
    return { ok: false, code: NO_CONTRACT_FOR_SELECTED_BUDGET, contract: null };
  }
  return { ok: true, code: null, contract: chosen };
}

export function assertCeremonyMatchesSelectedBudget({
  selectedBudgetId,
  selectedContract,
} = {}) {
  if (!selectedBudgetId) {
    return { ok: false, code: 'BUDGET_ID_REQUIRED' };
  }
  if (!selectedContract?.id) {
    return { ok: false, code: NO_CONTRACT_FOR_SELECTED_BUDGET };
  }
  if (norm(selectedContract.budgetId) !== norm(selectedBudgetId)) {
    return { ok: false, code: CONTRACT_BUDGET_MISMATCH };
  }
  return { ok: true, code: null };
}
