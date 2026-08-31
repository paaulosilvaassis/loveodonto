import { loadDb } from '../db/index.js';
import { BUDGET_STATUS } from './clinicalBudgetConstants.js';
import { RECEIVABLE_STATUS } from './auditEventCatalog.js';
import {
  isEffectiveReceivablePayment,
  isReceivableCollectible,
  reconcileReceivableFromPayments,
} from './receivableReconciliation.js';
import { toCents } from './receivableMoney.js';

function indexBudgets(db) {
  const byId = new Map();
  for (const ca of db.clinicalAppointments || []) {
    if (ca.budget?.id) byId.set(String(ca.budget.id), { ...ca.budget, appointmentId: ca.appointmentId });
    for (const archived of ca.budgetHistory || []) {
      if (archived?.id) {
        byId.set(String(archived.id), {
          ...archived,
          appointmentId: ca.appointmentId,
          status: archived.status || BUDGET_STATUS.HISTORICO,
        });
      }
    }
  }
  return byId;
}

function normalizeTenant(value) {
  return String(value || '').trim();
}

/**
 * Detector de domínio/teste. Não muta dados.
 * HISTORICO + título cobrável NÃO é órfão: origem existe (versão substituída).
 */
export function classifyReceivableIntegrity(receivable, db = loadDb()) {
  const issues = [];
  const originType = receivable?.origin_type || receivable?.originType;
  const originId = String(receivable?.origin_id || receivable?.budget_id || '').trim();
  const budgets = indexBudgets(db);
  const budget = originId ? budgets.get(originId) : null;
  const recon = reconcileReceivableFromPayments(receivable, db.receivablePayments || []);
  const paidCents = recon.effective_paid_cents;
  const patient = (db.patients || []).find((row) => row.id === receivable?.patient_id);

  if (!normalizeTenant(receivable?.tenant_id || receivable?.tenantId)) {
    if (!normalizeTenant(patient?.tenant_id || patient?.tenantId)) {
      issues.push('unowned_tenant');
    } else {
      issues.push('legacy_tenant_derivable');
    }
  }

  if (originType === 'treatment_plan') {
    if (!originId || !budget) issues.push('missing_origin_budget');
    else if (budget.status === BUDGET_STATUS.CANCELADO && isReceivableCollectible(receivable)) {
      issues.push('collectible_on_cancelled_budget');
    } else if (budget.status === BUDGET_STATUS.HISTORICO && isReceivableCollectible(receivable)) {
      issues.push('operational_detach_historical_budget');
    }
  }

  const payments = (db.receivablePayments || []).filter(
    (row) => row.receivable_id === receivable.id && isEffectiveReceivablePayment(row),
  );
  if (receivable.status === RECEIVABLE_STATUS.PAID && paidCents <= 0) {
    issues.push('paid_status_without_effective_payments');
  }
  if (isReceivableCollectible(receivable) && payments.length > 0 && paidCents !== toCents(receivable.received_amount || 0)) {
    issues.push('payment_balance_mismatch');
  }

  return {
    receivable_id: receivable?.id || null,
    origin_id: originId || null,
    budget_status: budget?.status || null,
    issues,
    is_orphan: issues.includes('missing_origin_budget'),
    is_collectible: isReceivableCollectible(receivable),
  };
}

export function inspectReceivableIntegrity(db = loadDb()) {
  return (db.accountsReceivable || []).map((row) => classifyReceivableIntegrity(row, db));
}
