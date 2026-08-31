import { loadDb } from '../db/index.js';
import { calcOptionFinalValue, calcPlannedValue } from '../components/clinical/budget/budgetUtils.js';
import { RECEIVABLE_STATUS } from './auditEventCatalog.js';
import { calculateFinancingSummary } from './financingCalculator.js';
import { listReceivablesForFinancing } from './financingReconciliation.js';
import { reconcileReceivableFromPayments } from './receivableReconciliation.js';
import { toCents } from './receivableMoney.js';

function finding(code, entity, message, extra = {}) {
  return { code, entity, message, ...extra };
}

function indexBudgets(db) {
  const byId = new Map();
  for (const ca of db.clinicalAppointments || []) {
    if (ca.budget?.id) byId.set(String(ca.budget.id), ca.budget);
    for (const archived of ca.budgetHistory || []) {
      if (archived?.id) byId.set(String(archived.id), archived);
    }
  }
  return byId;
}

function inspectReceivable(receivable, db) {
  const findings = [];
  const recon = reconcileReceivableFromPayments(receivable, db.receivablePayments || []);
  const net = recon.net_cents;
  const paid = recon.effective_paid_cents;
  const remaining = recon.remaining_cents;
  const storedPaid = toCents(receivable.received_amount || 0);
  const storedRemaining = toCents(receivable.remaining_amount || 0);
  if (storedPaid + storedRemaining !== net && receivable.status !== RECEIVABLE_STATUS.CANCELED) {
    findings.push(finding('receivable_total_mismatch', receivable.id, 'TOTAL != PAID + BALANCE', {
      net_cents: net, paid_cents: storedPaid, remaining_cents: storedRemaining,
    }));
  } else if (storedPaid !== paid || storedRemaining !== remaining) {
    findings.push(finding('receivable_total_mismatch', receivable.id, 'Storage diverge da reconciliação em cents', {
      net_cents: net, paid_cents: paid, remaining_cents: remaining, stored_paid_cents: storedPaid,
    }));
  }
  if (remaining < 0) {
    findings.push(finding('negative_balance', receivable.id, 'Saldo negativo', { remaining_cents: remaining }));
  }
  if (paid > net) {
    findings.push(finding('overpaid_state', receivable.id, 'Pago efetivo maior que o líquido', {
      net_cents: net, paid_cents: paid,
    }));
  }
  return { findings, recon };
}

function inspectBudget(budget, receivables) {
  const findings = [];
  const accepted = (budget.paymentOptions || []).find((option) => option.accepted);
  if (!accepted || accepted.type === 'financiamento') return findings;
  const original = calcPlannedValue(budget.procedures || []);
  const expectedCents = toCents(calcOptionFinalValue(accepted, original));
  const pathA = receivables.filter((row) => (
    row.origin_type === 'treatment_plan'
    && String(row.origin_id || row.budget_id) === String(budget.id)
  ));
  const actualCents = pathA.reduce((sum, row) => sum + toCents(row.net_amount || 0), 0);
  if (pathA.length > 0 && actualCents !== expectedCents) {
    findings.push(finding('budget_obligation_mismatch', budget.id, 'Soma PATH A != total financeiro do orçamento', {
      expected_cents: expectedCents,
      actual_cents: actualCents,
    }));
  }
  return findings;
}

function inspectFinancing(financing, db) {
  const findings = [];
  const recvs = listReceivablesForFinancing(db, financing.id);
  const summary = calculateFinancingSummary(financing);
  const expectedCents = toCents(summary.totalPayableAmount);
  const entryCents = recvs
    .filter((row) => Number(row.installment_number || 0) === 0)
    .reduce((sum, row) => sum + toCents(row.net_amount || 0), 0);
  const installmentCents = recvs
    .filter((row) => Number(row.installment_number || 0) > 0)
    .reduce((sum, row) => sum + toCents(row.net_amount || 0), 0);
  const actualCents = entryCents + installmentCents;
  if (recvs.length > 0 && actualCents !== expectedCents) {
    findings.push(finding('financing_obligation_mismatch', financing.id, 'ENTRY + PARCELAS != total pagável', {
      expected_cents: expectedCents,
      actual_cents: actualCents,
      entry_cents: entryCents,
      installment_cents: installmentCents,
    }));
  }
  const paidCents = recvs.reduce((sum, row) => {
    const recon = reconcileReceivableFromPayments(row, db.receivablePayments || []);
    return sum + recon.effective_paid_cents;
  }, 0);
  const storedPaid = toCents(financing.total_paid_amount || 0);
  if (recvs.length > 0 && storedPaid !== paidCents) {
    findings.push(finding('financing_paid_mismatch', financing.id, 'FINANCING_PAID != soma paid reconciliado', {
      stored_paid_cents: storedPaid,
      recon_paid_cents: paidCents,
    }));
  }
  return findings;
}

/**
 * Detector read-only. Não muta dados. Achados históricos são REPORT ONLY.
 */
export function inspectFinancialReconciliation(db = loadDb()) {
  const findings = [];
  const receivables = Array.isArray(db.accountsReceivable) ? db.accountsReceivable : [];
  for (const receivable of receivables) {
    findings.push(...inspectReceivable(receivable, db).findings);
  }
  const budgets = indexBudgets(db);
  for (const budget of budgets.values()) {
    findings.push(...inspectBudget(budget, receivables));
  }
  for (const financing of db.financings || []) {
    try {
      findings.push(...inspectFinancing(financing, db));
    } catch {
      findings.push(finding('financing_summary_invalid', financing.id, 'Não foi possível recalcular o summary do financiamento'));
    }
  }
  return {
    findings,
    counts: {
      receivables: receivables.length,
      findings: findings.length,
    },
  };
}

export function inspectReceivableEquation(receivable, payments = []) {
  return inspectReceivable(receivable, { receivablePayments: payments }).recon;
}
