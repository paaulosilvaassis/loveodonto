/**
 * PHASE 11.G — monetary model and global financial reconciliation in cents.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initDb, loadDb, peekDb, resetDb, withDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS, getBudget, saveBudget } from '../services/clinicalService.js';
import { approveClinicalBudgetWithFinance } from '../services/clinicalBudgetFinance.js';
import { createNewBudgetForAppointment } from '../services/clinicalBudgetLockService.js';
import { applyPercentDiscountCents, fromCents, splitInCents, toCents } from '../services/receivableMoney.js';
import { calculateFinancingSummary } from '../services/financingCalculator.js';
import {
  inspectFinancialReconciliation,
} from '../services/financialReconciliationInspector.js';
import {
  approveFinancing,
  createFinancingProposal,
  getFinancingById,
} from '../services/financingsService.js';
import {
  cancelReceivable,
  createReceivable,
  createReceivableCharge,
  getReceivableById,
  getReceivablePayments,
  listReceivables,
  RECEIVABLE_ORIGIN_TYPE,
  RECEIVABLE_STATUS,
  registerReceivablePayment,
  reverseReceivablePayment,
} from '../services/receivablesService.js';
import { isEffectiveReceivablePayment, reconcileReceivableFromPayments } from '../services/receivableReconciliation.js';
import { FINANCIAL_PAYMENT_METHOD } from '../services/auditEventCatalog.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { cancelUnsignedContract } from '../services/contractLifecycleCommandService.js';
import { ensureContractsModuleSeeded } from '../services/contractModuleService.js';

const TENANT_A = 'tenant-11g-a';
const TENANT_B = 'tenant-11g-b';
const PATIENT_A = 'patient-11g-a';
const PATIENT_B = 'patient-11g-b';
const APPT_A = 'apt-11g-a';

const adminA = {
  id: 'user-11g-admin-a', role: 'admin', tenant_id: TENANT_A, tenantId: TENANT_A, name: 'Admin 11G A',
};
const adminB = {
  id: 'user-11g-admin-b', role: 'admin', tenant_id: TENANT_B, tenantId: TENANT_B, name: 'Admin 11G B',
};

function seed() {
  withDb((db) => {
    db.tenants = [
      { id: TENANT_A, name: 'Clinica 11G A', status: 'active' },
      { id: TENANT_B, name: 'Clinica 11G B', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-11g-a', tenant_id: TENANT_A, razaoSocial: 'Clinica 11G A' };
    db.patients = [
      { id: PATIENT_A, tenant_id: TENANT_A, full_name: 'Paciente 11G A' },
      { id: PATIENT_B, tenant_id: TENANT_B, full_name: 'Paciente 11G B' },
    ];
    db.appointments = [{
      id: APPT_A, tenant_id: TENANT_A, patientId: PATIENT_A, professionalId: 'prof-11g',
      date: '2026-08-31', status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
    }];
    db.accountsReceivable = [];
    db.receivablePayments = [];
    db.financings = [];
    return db;
  });
}

function openReceivable(amount, extras = {}) {
  return createReceivable(adminA, {
    patient_id: PATIENT_A,
    description: extras.description || 'CR 11G',
    original_amount: amount,
    origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY,
    due_date: extras.due_date || '2026-09-15',
    ...extras,
    patient_id: extras.patient_id || PATIENT_A,
  });
}

function pay(receivableId, amount, operationId) {
  return registerReceivablePayment(adminA, receivableId, {
    payment_date: '2026-08-10',
    amount_received: amount,
    payment_method: FINANCIAL_PAYMENT_METHOD.PIX,
    operation_id: operationId,
  });
}

function buildPathABudget({ amount, downPayment = 0, installments = 1, discountPercent = 0 } = {}) {
  return {
    status: BUDGET_STATUS.NEGOCIACAO,
    planName: 'Tratamento 11G',
    professionalId: 'prof-11g',
    procedures: [{ name: 'Implante', quantity: 1, unitValue: amount, totalValue: amount }],
    paymentOptions: [{
      id: 'pay-11g',
      type: 'parcelado_clinica',
      accepted: true,
      downPayment,
      installments,
      discountPercent,
      method: 'pix',
      firstDueDate: '2026-09-10',
      total: amount,
    }],
    totalValue: amount,
  };
}

function approvePathA(draft) {
  saveBudget(adminA, APPT_A, draft);
  return approveClinicalBudgetWithFinance(adminA, {
    appointmentId: APPT_A,
    patientId: PATIENT_A,
    patient: { id: PATIENT_A },
    budget: getBudget(APPT_A),
  });
}

function pathAReceivables(budgetId) {
  return (loadDb().accountsReceivable || []).filter((row) => (
    row.origin_type === RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN
    && String(row.origin_id) === String(budgetId)
  ));
}

function financeSnapshot() {
  const db = loadDb();
  return JSON.stringify({
    accountsReceivable: db.accountsReceivable || [],
    receivablePayments: db.receivablePayments || [],
    financings: db.financings || [],
  });
}

function centsSum(rows, field) {
  return rows.reduce((sum, row) => sum + toCents(row[field] || 0), 0);
}

describe('PHASE 11.G monetary model global reconciliation', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T12:00:00Z'));
    localStorage.clear();
    await resetDb();
    await initDb();
    seed();
  });

  afterEach(() => { vi.useRealTimers(); });

  it('T1 canonical cents conversion', () => {
    expect(toCents(10.1)).toBe(1010);
    expect(toCents('10,10')).toBe(1010);
    expect(fromCents(1010)).toBe(10.1);
    expect(toCents(fromCents(1))).toBe(1);
  });

  it('T2 float artifact normalization 0.1+0.2', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(fromCents(toCents(0.1) + toCents(0.2))).toBe(0.3);
  });

  it('T3 PATH A split 1000/3 is exact', () => {
    const result = approvePathA(buildPathABudget({ amount: 1000, downPayment: 0, installments: 3 }));
    const recvs = pathAReceivables(result.budget.id);
    expect(centsSum(recvs, 'net_amount')).toBe(100000);
    expect(recvs.map((row) => row.net_amount).sort((a, b) => b - a)).toEqual([333.34, 333.33, 333.33]);
  });

  it('T4 PATH A entry + installments equals total', () => {
    const result = approvePathA(buildPathABudget({ amount: 1000, downPayment: 100, installments: 3 }));
    const recvs = pathAReceivables(result.budget.id);
    expect(recvs.some((row) => row.installment_number === 0)).toBe(true);
    expect(centsSum(recvs, 'net_amount')).toBe(100000);
  });

  it('T5 PATH B splitInCents 1000/3 preserved', () => {
    const parts = splitInCents(1000, 3);
    expect(parts).toEqual([333.34, 333.33, 333.33]);
    expect(parts.reduce((sum, value) => sum + toCents(value), 0)).toBe(100000);
  });

  it('T6 financing entry + installments equals total', () => {
    const summary = calculateFinancingSummary({
      total_amount: 1000,
      entry_amount: 100,
      installments_count: 3,
      interest_type: 'none',
      interest_rate: 0,
      discount_amount: 0,
    });
    expect(toCents(summary.entryAmount) + summary.installmentParts.reduce((s, v) => s + toCents(v), 0))
      .toBe(toCents(summary.totalPayableAmount));
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A,
      description: 'Fin 11G T6',
      total_amount: 1000,
      entry_amount: 100,
      installments_count: 3,
      installment_frequency: 'monthly',
      first_due_date: '2026-09-10',
      issue_date: '2026-08-31',
      boleto_auto_generate: false,
      requires_credit_analysis: false,
    });
    approveFinancing(adminA, proposal.id);
    const recvs = (loadDb().accountsReceivable || []).filter((row) => row.financing_id === proposal.id
      || (row.origin_type === RECEIVABLE_ORIGIN_TYPE.FINANCING && row.origin_id === proposal.id));
    expect(centsSum(recvs, 'net_amount')).toBe(toCents(getFinancingById(proposal.id).total_payable_amount));
  });

  it('T7 partial payment reconciliation is exact', () => {
    const title = openReceivable(1000);
    pay(title.id, 400, 'op-11g-t7');
    const recon = reconcileReceivableFromPayments(getReceivableById(title.id), loadDb().receivablePayments);
    expect(recon.effective_paid_cents).toBe(40000);
    expect(recon.remaining_cents).toBe(60000);
    expect(recon.receivable.status).toBe(RECEIVABLE_STATUS.PARTIALLY_PAID);
  });

  it('T8 full payment balance is exact zero', () => {
    const title = openReceivable(1000);
    pay(title.id, 1000, 'op-11g-t8');
    const recon = reconcileReceivableFromPayments(getReceivableById(title.id), loadDb().receivablePayments);
    expect(recon.remaining_cents).toBe(0);
    expect(recon.receivable.status).toBe(RECEIVABLE_STATUS.PAID);
  });

  it('T9 reversal restores exact prior paid', () => {
    const title = openReceivable(1000);
    pay(title.id, 400, 'op-11g-t9-a');
    const second = pay(title.id, 600, 'op-11g-t9-b');
    reverseReceivablePayment(adminA, second.payment.id, { reversal_reason: 'estorno 600' });
    const recon = reconcileReceivableFromPayments(getReceivableById(title.id), loadDb().receivablePayments);
    expect(recon.effective_paid_cents).toBe(40000);
    expect(recon.remaining_cents).toBe(60000);
  });

  it('T10 multi-payment reconciliation is exact', () => {
    const title = openReceivable(1000);
    pay(title.id, 333.34, 'op-11g-t10-a');
    pay(title.id, 333.33, 'op-11g-t10-b');
    pay(title.id, 333.33, 'op-11g-t10-c');
    const recon = reconcileReceivableFromPayments(getReceivableById(title.id), loadDb().receivablePayments);
    expect(recon.effective_paid_cents).toBe(100000);
    expect(recon.remaining_cents).toBe(0);
  });

  it('T11 overpayment remains blocked', () => {
    const title = openReceivable(100);
    expect(() => pay(title.id, 100.01, 'op-11g-t11')).toThrow(/excede o saldo/i);
    expect(getReceivablePayments(title.id)).toHaveLength(0);
  });

  it('T12 negative residual is impossible', () => {
    const title = openReceivable(0.01);
    pay(title.id, 0.01, 'op-11g-t12');
    const recon = reconcileReceivableFromPayments(getReceivableById(title.id), loadDb().receivablePayments);
    expect(recon.remaining_cents).toBe(0);
    expect(recon.remaining_cents).toBeGreaterThanOrEqual(0);
  });

  it('T13 discount rounding is deterministic', () => {
    const applied = applyPercentDiscountCents(99.99, 10);
    expect(applied.discountCents).toBe(1000);
    expect(applied.netCents).toBe(8999);
    const result = approvePathA(buildPathABudget({
      amount: 99.99, downPayment: 0, installments: 1, discountPercent: 10,
    }));
    expect(centsSum(pathAReceivables(result.budget.id), 'net_amount')).toBe(8999);
  });

  it('T14 installment sum checker detects mismatch', () => {
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A,
      description: 'Fin checker',
      total_amount: 300,
      entry_amount: 0,
      installments_count: 3,
      installment_frequency: 'monthly',
      first_due_date: '2026-09-10',
      issue_date: '2026-08-31',
      boleto_auto_generate: false,
      requires_credit_analysis: false,
    });
    approveFinancing(adminA, proposal.id);
    const live = peekDb();
    const row = (live.accountsReceivable || []).find((item) => item.financing_id === proposal.id);
    row.net_amount = Number(row.net_amount) + 0.01;
    const report = inspectFinancialReconciliation(live);
    expect(report.findings.some((item) => item.code === 'financing_obligation_mismatch')).toBe(true);
    expect(getReceivableById(row.id).net_amount).toBe(row.net_amount);
  });

  it('T15 receivable checker detects total != paid+balance', () => {
    const title = openReceivable(100);
    const live = peekDb();
    const row = live.accountsReceivable.find((item) => item.id === title.id);
    row.remaining_amount = 50;
    row.received_amount = 40;
    const report = inspectFinancialReconciliation(live);
    expect(report.findings.some((item) => item.code === 'receivable_total_mismatch' && item.entity === title.id)).toBe(true);
  });

  it('T16 financing checker detects paid mismatch', () => {
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A,
      description: 'Fin paid checker',
      total_amount: 200,
      entry_amount: 0,
      installments_count: 2,
      installment_frequency: 'monthly',
      first_due_date: '2026-09-10',
      issue_date: '2026-08-31',
      boleto_auto_generate: false,
      requires_credit_analysis: false,
    });
    approveFinancing(adminA, proposal.id);
    const live = peekDb();
    live.financings.find((row) => row.id === proposal.id).total_paid_amount = 99.99;
    const report = inspectFinancialReconciliation(live);
    expect(report.findings.some((item) => item.code === 'financing_paid_mismatch')).toBe(true);
  });

  it('T17 budget checker detects obligation mismatch', () => {
    const result = approvePathA(buildPathABudget({ amount: 500, downPayment: 0, installments: 1 }));
    const live = peekDb();
    const row = live.accountsReceivable.find((item) => item.origin_id === result.budget.id);
    row.net_amount = 499.99;
    const report = inspectFinancialReconciliation(live);
    expect(report.findings.some((item) => item.code === 'budget_obligation_mismatch')).toBe(true);
  });

  it('T18 legacy float read normalizes without rewrite', () => {
    const title = openReceivable(10.1);
    const live = peekDb();
    const row = live.accountsReceivable.find((item) => item.id === title.id);
    row.net_amount = 10.1000000000001;
    row.original_amount = 10.1000000000001;
    row.remaining_amount = 10.1000000000001;
    expect(toCents(row.net_amount)).toBe(1010);
    expect(row.net_amount).toBe(10.1000000000001);
    const recon = reconcileReceivableFromPayments(row, []);
    expect(recon.net_cents).toBe(1010);
    expect(getReceivableById(title.id).net_amount).toBe(10.1000000000001);
  });

  it('T19 canceled unpaid does not invent paid amount', () => {
    const title = openReceivable(80);
    cancelReceivable(adminA, title.id, 'ok');
    const recon = reconcileReceivableFromPayments(getReceivableById(title.id), loadDb().receivablePayments);
    expect(recon.effective_paid_cents).toBe(0);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(0);
  });

  it('T20 paid historical budget preserves received', () => {
    const result = approvePathA(buildPathABudget({ amount: 200, downPayment: 0, installments: 1 }));
    const recv = pathAReceivables(result.budget.id)[0];
    pay(recv.id, 200, 'op-11g-t20');
    const before = getReceivableById(recv.id).received_amount;
    createNewBudgetForAppointment(adminA, APPT_A);
    expect(toCents(getReceivableById(recv.id).received_amount)).toBe(toCents(before));
    expect(toCents(getReceivableById(recv.id).received_amount)).toBe(20000);
  });

  it('T21 PHASE 11.B receivable creation still idempotent', () => {
    const first = openReceivable(150, {
      origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN,
      origin_id: 'budget-11g-1',
      installment_number: 1,
    });
    const second = openReceivable(150, {
      origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN,
      origin_id: 'budget-11g-1',
      installment_number: 1,
    });
    expect(second.id).toBe(first.id);
  });

  it('T22 PHASE 11.C payment idempotency still holds', () => {
    const title = openReceivable(400);
    pay(title.id, 400, 'op-11g-t22');
    const second = pay(title.id, 400, 'op-11g-t22');
    expect(second.replayed).toBe(true);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
  });

  it('T23 PHASE 11.D unpaid cancel still holds', () => {
    const title = openReceivable(90);
    expect(cancelReceivable(adminA, title.id, 'ok').status).toBe(RECEIVABLE_STATUS.CANCELED);
  });

  it('T24 PHASE 11.E financing tenant still holds', () => {
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A,
      description: 'Fin 11G T24',
      total_amount: 600,
      entry_amount: 0,
      installments_count: 2,
      installment_frequency: 'monthly',
      first_due_date: '2026-09-10',
      issue_date: '2026-08-31',
      boleto_auto_generate: false,
      requires_credit_analysis: false,
    });
    expect(() => approveFinancing(adminB, proposal.id)).toThrow(/outra clínica|TENANT_MISMATCH/i);
    expect(approveFinancing(adminA, proposal.id).financing.id).toBe(proposal.id);
  });

  it('T25 PHASE 11.F charge still does not create obligation', () => {
    const title = openReceivable(120);
    const before = (loadDb().accountsReceivable || []).length;
    const first = createReceivableCharge(adminA, {
      receivable_id: title.id,
      operation_id: 'op-11g-t25',
    });
    const second = createReceivableCharge(adminA, {
      receivable_id: title.id,
      operation_id: 'op-11g-t25',
    });
    expect(second.id).toBe(first.id);
    expect((loadDb().accountsReceivable || []).length).toBe(before);
    expect(listReceivables({ user: adminB }).some((row) => row.id === title.id)).toBe(false);
  });

  it('T26 contract lifecycle has no automatic financial side-effects', () => {
    ensureContractsModuleSeeded();
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-11g-1',
        contractNumber: 'CTR-11G-1',
        clinicId: 'clinic-11g-a',
        tenant_id: TENANT_A,
        patientId: PATIENT_A,
        status: CONTRACT_STATUS.GENERATED,
        renderedHtml: '<p>11G</p>',
        finalContent: '<p>11G</p>',
        documentHash: 'hash-11g',
        version: 1,
      }];
      return db;
    });
    const before = financeSnapshot();
    cancelUnsignedContract({ user: adminA, contractId: 'gctr-11g-1', reason: 'desistencia' });
    expect(financeSnapshot()).toBe(before);
  });
});
