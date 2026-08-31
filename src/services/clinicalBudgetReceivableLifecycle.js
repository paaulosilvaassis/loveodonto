import { loadDb, withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { BUDGET_STATUS } from './clinicalBudgetConstants.js';
import { RECEIVABLE_STATUS } from './auditEventCatalog.js';
import { hasRealFinancingLinkedToBudget } from '../components/clinical/budget/budgetEditAccessUtils.js';
import {
  cancelReceivable,
  listPathAReceivablesForBudget,
  RECEIVABLE_CANCEL_PERMISSION,
} from './receivableObligationLifecycle.js';
import { isReceivableCollectible, sumEffectivePaidCents } from './receivableReconciliation.js';
import { toCents } from './receivableMoney.js';

/**
 * BUDGET_HISTORICO_FINANCIAL_EFFECT = NONE
 * Novo ciclo (createNewBudgetForAppointment) não cancela nem altera títulos.
 *
 * BUDGET_CANCELADO_FINANCIAL_EFFECT = CANCEL_UNPAID_PATH_A_OR_FAIL_CLOSED
 * Cancelamento formal do orçamento é uma cerimônia financeira explícita.
 * PATH B ativo: FAIL CLOSED (lifecycle de financing deferred).
 */
export function cancelApprovedBudgetWithFinance(user, appointmentId, reason = '') {
  requirePermission(user, RECEIVABLE_CANCEL_PERMISSION);
  if (!appointmentId) throw new Error('Atendimento é obrigatório.');

  const db = loadDb();
  const clinical = (db.clinicalAppointments || []).find((row) => row.appointmentId === appointmentId);
  if (!clinical?.budget) throw new Error('Orçamento não encontrado.');
  const budget = clinical.budget;

  if (budget.status === BUDGET_STATUS.CANCELADO) {
    return { budget, receivables: listPathAReceivablesForBudget(budget.id, db), replayed: true };
  }

  if (hasRealFinancingLinkedToBudget(budget.id)) {
    const error = new Error(
      'Orçamento com financiamento ativo não pode ser cancelado nesta fase. Lifecycle PATH B permanece deferred.',
    );
    error.code = 'FINANCING_LIFECYCLE_DEFERRED';
    throw error;
  }

  const linked = listPathAReceivablesForBudget(budget.id, db);
  const canceled = [];
  for (const row of linked) {
    if (row.status === RECEIVABLE_STATUS.CANCELED) continue;
    if (!isReceivableCollectible(row)) continue;
    const paidCents = sumEffectivePaidCents(db.receivablePayments || [], row.id);
    const remaining = Math.max(toCents(row.net_amount || 0) - paidCents, 0);
    if (paidCents > 0 && remaining <= 0) continue;
    canceled.push(cancelReceivable(user, row.id, reason || 'Orçamento cancelado.'));
  }

  let nextBudget = budget;
  withDb((state) => {
    const idx = (state.clinicalAppointments || []).findIndex((row) => row.appointmentId === appointmentId);
    if (idx < 0 || !state.clinicalAppointments[idx].budget) return state;
    nextBudget = {
      ...state.clinicalAppointments[idx].budget,
      status: BUDGET_STATUS.CANCELADO,
      statusNotes: reason || state.clinicalAppointments[idx].budget.statusNotes || '',
      statusUpdatedAt: new Date().toISOString(),
      statusUpdatedBy: user?.id || null,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.id || null,
    };
    state.clinicalAppointments[idx] = {
      ...state.clinicalAppointments[idx],
      budget: nextBudget,
      updatedAt: nextBudget.updatedAt,
      updatedBy: user?.id || null,
    };
    return state;
  });

  return {
    budget: nextBudget,
    receivables: listPathAReceivablesForBudget(budget.id),
    canceled,
    replayed: false,
  };
}
