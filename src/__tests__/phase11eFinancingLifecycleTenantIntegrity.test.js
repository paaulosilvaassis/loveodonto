/**
 * PHASE 11.E — financing lifecycle, tenant ownership and PATH B integrity.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initDb, loadDb, peekDb, resetDb, withDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS, getBudget, saveBudget } from '../services/clinicalService.js';
import { createNewBudgetForAppointment } from '../services/clinicalBudgetLockService.js';
import { cancelApprovedBudgetWithFinance } from '../services/clinicalBudgetReceivableLifecycle.js';
import {
  approveClinicalBudgetWithFinance,
  createReceivablesFromApprovedBudget,
} from '../services/clinicalBudgetFinance.js';
import {
  approveFinancing,
  cancelFinancing,
  createFinancingProposal,
  FINANCING_APPROVE_PERMISSION,
  FINANCING_CANCEL_PERMISSION,
  FINANCING_CREATE_PERMISSION,
  getFinancingById,
  listFinancings,
  registerFinancingPayment,
  __setFinancingApproveFaultForTest,
} from '../services/financingsService.js';
import { listFinancingInstallments } from '../services/financingInstallmentsService.js';
import { calculateFinancingSummary } from '../services/financingCalculator.js';
import {
  cancelReceivable,
  createReceivable,
  findPathBObligationReceivable,
  getReceivableById,
  getReceivablePayments,
  RECEIVABLE_ORIGIN_TYPE,
  RECEIVABLE_STATUS,
  registerReceivablePayment,
  reverseReceivablePayment,
} from '../services/receivablesService.js';
import { isEffectiveReceivablePayment } from '../services/receivableReconciliation.js';
import { can, requirePermission } from '../permissions/permissions.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { cancelUnsignedContract } from '../services/contractLifecycleCommandService.js';
import { ensureContractsModuleSeeded } from '../services/contractModuleService.js';
import { FINANCIAL_PAYMENT_METHOD } from '../services/auditEventCatalog.js';

const TENANT_A = 'tenant-11e-a';
const TENANT_B = 'tenant-11e-b';
const PATIENT_A = 'patient-11e-a';
const PATIENT_B = 'patient-11e-b';
const APPT_A = 'apt-11e-a';
const APPT_A2 = 'apt-11e-a2';
const APPT_B = 'apt-11e-b';

const adminA = {
  id: 'user-11e-admin-a', role: 'admin', tenant_id: TENANT_A, tenantId: TENANT_A, name: 'Admin 11E A',
};
const adminB = {
  id: 'user-11e-admin-b', role: 'admin', tenant_id: TENANT_B, tenantId: TENANT_B, name: 'Admin 11E B',
};
const financeiroA = {
  id: 'user-11e-fin', role: 'financeiro', tenant_id: TENANT_A, tenantId: TENANT_A, name: 'Fin 11E',
};
const dentistaA = {
  id: 'user-11e-dent', role: 'dentista', tenant_id: TENANT_A, tenantId: TENANT_A, name: 'Dent 11E',
};

function financeSnapshot() {
  const db = loadDb();
  return JSON.stringify({
    clinicalBudgets: db.clinicalBudgets || [],
    accountsReceivable: db.accountsReceivable || [],
    receivablePayments: db.receivablePayments || [],
    financings: db.financings || [],
  });
}

function seed() {
  withDb((db) => {
    db.tenants = [
      { id: TENANT_A, name: 'Clinica 11E A', status: 'active' },
      { id: TENANT_B, name: 'Clinica 11E B', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-11e-a', tenant_id: TENANT_A, razaoSocial: 'Clinica 11E A' };
    db.patients = [
      { id: PATIENT_A, tenant_id: TENANT_A, full_name: 'Paciente 11E A' },
      { id: PATIENT_B, tenant_id: TENANT_B, full_name: 'Paciente 11E B' },
    ];
    db.appointments = [
      {
        id: APPT_A, tenant_id: TENANT_A, patientId: PATIENT_A, professionalId: 'prof-11e',
        date: '2026-08-31', status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      },
      {
        id: APPT_A2, tenant_id: TENANT_A, patientId: PATIENT_A, professionalId: 'prof-11e',
        date: '2026-08-31', status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      },
      {
        id: APPT_B, tenant_id: TENANT_B, patientId: PATIENT_B, professionalId: 'prof-11e-b',
        date: '2026-08-31', status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      },
    ];
    db.accountsReceivable = [];
    db.receivablePayments = [];
    db.financings = [];
    db.financingInstallments = [];
    return db;
  });
}

function proposalPayload(overrides = {}) {
  return {
    patient_id: PATIENT_A,
    description: 'Financiamento 11E',
    total_amount: 1200,
    entry_amount: 200,
    installments_count: 4,
    installment_frequency: 'monthly',
    first_due_date: '2026-09-10',
    issue_date: '2026-08-31',
    interest_type: 'none',
    interest_rate: 0,
    discount_amount: 0,
    boleto_auto_generate: true,
    requires_credit_analysis: true,
    ...overrides,
  };
}

function createProposal(user = adminA, overrides = {}) {
  return createFinancingProposal(user, proposalPayload(overrides));
}

function pathBReceivables(financingId) {
  return (loadDb().accountsReceivable || []).filter((row) => (
    String(row.financing_id || '') === financingId
    || (row.origin_type === RECEIVABLE_ORIGIN_TYPE.FINANCING && String(row.origin_id || '') === financingId)
  ));
}

function saveNamedBudget(user, appointmentId, extra = {}) {
  saveBudget(user, appointmentId, {
    status: BUDGET_STATUS.NEGOCIACAO,
    planName: 'Tratamento 11E',
    professionalId: 'prof-11e',
    procedures: [{ name: 'Implante', quantity: 1, unitValue: 1200, totalValue: 1200 }],
    paymentOptions: [{
      id: 'pay-11e', type: 'a_vista', accepted: true, method: 'pix',
      firstDueDate: '2026-09-10', total: 1200,
    }],
    totalValue: 1200,
    ...extra,
  });
  return getBudget(appointmentId);
}

function payReceivable(user, receivableId, amount, operationId) {
  return registerReceivablePayment(user, receivableId, {
    payment_date: '2026-04-10',
    amount_received: amount,
    payment_method: FINANCIAL_PAYMENT_METHOD.PIX,
    operation_id: operationId,
  });
}

describe('PHASE 11.E financing lifecycle tenant integrity', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T12:00:00Z'));
    localStorage.clear();
    await resetDb();
    await initDb();
    seed();
  });

  afterEach(() => {
    vi.useRealTimers();
    __setFinancingApproveFaultForTest(null);
  });

  it('T1 create persists tenant_id and binds ownership', () => {
    const created = createProposal();
    expect(created.tenant_id).toBe(TENANT_A);
    expect(getFinancingById(created.id).tenant_id).toBe(TENANT_A);
    expect(created.patient_id).toBe(PATIENT_A);
  });

  it('T2 create retry with same budget_id does not duplicate', () => {
    const budget = saveNamedBudget(adminA, APPT_A);
    const first = createProposal(adminA, { budget_id: budget.id, treatment_plan_id: budget.id });
    const second = createProposal(adminA, { budget_id: budget.id, treatment_plan_id: budget.id });
    expect(second.id).toBe(first.id);
    expect((loadDb().financings || []).filter((row) => row.budget_id === budget.id)).toHaveLength(1);
  });

  it('T3 distinct budgets with same amount remain two financings', () => {
    const budgetA = saveNamedBudget(adminA, APPT_A);
    const budgetB = saveNamedBudget(adminA, APPT_A2);
    const first = createProposal(adminA, { budget_id: budgetA.id, description: 'Fin A' });
    const second = createProposal(adminA, { budget_id: budgetB.id, description: 'Fin B' });
    expect(second.id).not.toBe(first.id);
    expect((loadDb().financings || []).filter((row) => row.patient_id === PATIENT_A)).toHaveLength(2);
  });

  it('T4 cross-tenant create is denied', () => {
    expect(() => createProposal(adminA, { patient_id: PATIENT_B })).toThrow(/outra clínica|TENANT_MISMATCH/i);
    expect(loadDb().financings || []).toHaveLength(0);
  });

  it('T5 budget ownership mismatch is denied', () => {
    const budgetB = saveNamedBudget(adminB, APPT_B);
    expect(() => createProposal(adminA, { budget_id: budgetB.id })).toThrow(/não pertence|outra clínica|TENANT_MISMATCH/i);
    expect(loadDb().financings || []).toHaveLength(0);
  });

  it('T6 first approval materializes expected PATH B receivables', () => {
    const proposal = createProposal();
    const approved = approveFinancing(adminA, proposal.id);
    expect(approved.installments).toHaveLength(4);
    const recvs = pathBReceivables(proposal.id);
    expect(recvs).toHaveLength(5);
    expect(recvs.every((row) => row.origin_type === RECEIVABLE_ORIGIN_TYPE.FINANCING)).toBe(true);
    expect(recvs.every((row) => row.origin_id === proposal.id)).toBe(true);
    expect(recvs.every((row) => row.tenant_id === TENANT_A)).toBe(true);
    expect(recvs.some((row) => row.installment_number === 0)).toBe(true);
    expect(findPathBObligationReceivable(recvs, {
      tenantId: TENANT_A, financingId: proposal.id, installmentNumber: 0,
    })).toBeTruthy();
    expect(getFinancingById(proposal.id).status).not.toBe('draft');
    expect(getFinancingById(proposal.id).status).not.toBe('pending_analysis');
  });

  it('T7 approval retry does not create extra receivables', () => {
    const proposal = createProposal();
    approveFinancing(adminA, proposal.id);
    const firstCount = pathBReceivables(proposal.id).length;
    approveFinancing(adminA, proposal.id);
    approveFinancing(adminA, proposal.id);
    expect(pathBReceivables(proposal.id)).toHaveLength(firstCount);
    expect(listFinancingInstallments({ financing_id: proposal.id })).toHaveLength(4);
  });

  it('T8 materialize fault does not leave silently APPROVED incomplete financing', () => {
    const proposal = createProposal();
    __setFinancingApproveFaultForTest((phase, ctx) => {
      if (phase === 'after_installment' && Number(ctx.installmentNumber) === 1) {
        throw new Error('INJECTED_APPROVE_FAULT');
      }
    });
    expect(() => approveFinancing(adminA, proposal.id)).toThrow(/INJECTED_APPROVE_FAULT/);
    const afterFault = getFinancingById(proposal.id);
    expect(['approved', 'active', 'partially_paid', 'paid_off']).not.toContain(afterFault.status);
    __setFinancingApproveFaultForTest(null);
    const retried = approveFinancing(adminA, proposal.id);
    expect(retried.installments).toHaveLength(4);
    expect(pathBReceivables(proposal.id)).toHaveLength(5);
    expect(['approved', 'active', 'partially_paid']).toContain(getFinancingById(proposal.id).status);
  });

  it('T9 installment + entry sum equals total payable', () => {
    const proposal = createProposal();
    approveFinancing(adminA, proposal.id);
    const recvs = pathBReceivables(proposal.id);
    const sum = recvs.reduce((acc, row) => acc + Number(row.net_amount || 0), 0);
    expect(sum).toBeCloseTo(1200, 2);
  });

  it('T10 splitInCents 1000/3 remains deterministic', () => {
    const summary = calculateFinancingSummary({
      total_amount: 1000,
      entry_amount: 0,
      installments_count: 3,
      interest_type: 'none',
      interest_rate: 0,
      discount_amount: 0,
    });
    expect(summary.installmentParts.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1000, 2);
    expect(summary.installmentParts[0]).toBe(333.34);
    expect(summary.installmentParts[1]).toBe(333.33);
    expect(summary.installmentParts[2]).toBe(333.33);
  });

  it('T11 invalid entry is blocked', () => {
    expect(() => createProposal(adminA, { entry_amount: -1 })).toThrow(/Entrada não pode ser negativa/i);
    expect(() => createProposal(adminA, { entry_amount: 1300 })).toThrow(/maior que o valor total/i);
  });

  it('T12 entry_received_now retry does not duplicate payment', () => {
    const proposal = createProposal();
    approveFinancing(adminA, proposal.id, { entry_received_now: true });
    approveFinancing(adminA, proposal.id, { entry_received_now: true });
    const entry = pathBReceivables(proposal.id).find((row) => row.installment_number === 0);
    const payments = getReceivablePayments(entry.id).filter(isEffectiveReceivablePayment);
    expect(payments).toHaveLength(1);
    expect(payments[0].operation_id).toBe(`payop:fin-entry:${proposal.id}`);
    expect(getReceivableById(entry.id).received_amount).toBeCloseTo(200, 2);
  });

  it('T13 partial payment reconciles financing status', () => {
    const proposal = createProposal();
    approveFinancing(adminA, proposal.id);
    const first = listFinancingInstallments({ financing_id: proposal.id })[0];
    registerFinancingPayment(adminA, {
      installment_id: first.id,
      amount_received: 100,
      payment_date: '2026-04-10',
      payment_method: 'pix',
      operation_id: 'payop-11e-t13',
    });
    const financing = getFinancingById(proposal.id);
    expect(financing.total_paid_amount).toBeCloseTo(100, 2);
    expect(financing.total_open_amount).toBeGreaterThan(0);
    expect(financing.status).toBe('partially_paid');
    const refreshed = listFinancingInstallments({ financing_id: proposal.id }).find((row) => row.id === first.id);
    expect(refreshed.paid_amount).toBeCloseTo(100, 2);
  });

  it('T14 full payment marks paid_off', () => {
    const proposal = createProposal();
    approveFinancing(adminA, proposal.id);
    pathBReceivables(proposal.id).forEach((row, index) => {
      payReceivable(adminA, row.id, row.net_amount, `payop-11e-t14-${index}`);
    });
    expect(getFinancingById(proposal.id).status).toBe('paid_off');
    expect(getFinancingById(proposal.id).total_open_amount).toBeCloseTo(0, 2);
  });

  it('T15 reversal reconciles financing away from paid_off', () => {
    const proposal = createProposal();
    approveFinancing(adminA, proposal.id);
    const recvs = pathBReceivables(proposal.id);
    const payments = recvs.map((row, index) => payReceivable(adminA, row.id, row.net_amount, `payop-11e-t15-${index}`));
    expect(getFinancingById(proposal.id).status).toBe('paid_off');
    reverseReceivablePayment(adminA, payments[0].payment.id, { reversal_reason: '11e' });
    const after = getFinancingById(proposal.id);
    expect(after.status).not.toBe('paid_off');
    expect(after.total_open_amount).toBeGreaterThan(0);
  });

  it('T16 unpaid cancel does not hard-delete', () => {
    const proposal = createProposal();
    approveFinancing(adminA, proposal.id);
    const canceled = cancelFinancing(adminA, proposal.id, 'desistir');
    expect(canceled.status).toBe('canceled');
    expect(getFinancingById(proposal.id)).toBeTruthy();
    expect(pathBReceivables(proposal.id).every((row) => row.status === RECEIVABLE_STATUS.CANCELED)).toBe(true);
    expect(cancelFinancing(adminA, proposal.id, 'retry').status).toBe('canceled');
  });

  it('T17 partial cancel is fail-closed', () => {
    const proposal = createProposal();
    approveFinancing(adminA, proposal.id);
    const first = listFinancingInstallments({ financing_id: proposal.id })[0];
    registerFinancingPayment(adminA, {
      installment_id: first.id,
      amount_received: 50,
      payment_date: '2026-04-10',
      payment_method: 'pix',
      operation_id: 'payop-11e-t17',
    });
    expect(() => cancelFinancing(adminA, proposal.id, 'x')).toThrow(/parcialmente pago|PRODUCT_DECISION/i);
    expect(getFinancingById(proposal.id).status).not.toBe('canceled');
    expect(getReceivablePayments(first.receivable_id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
  });

  it('T18 fully paid financing is preserved', () => {
    const proposal = createProposal();
    approveFinancing(adminA, proposal.id);
    pathBReceivables(proposal.id).forEach((row, index) => {
      payReceivable(adminA, row.id, row.net_amount, `payop-11e-t18-${index}`);
    });
    expect(() => cancelFinancing(adminA, proposal.id, 'x')).toThrow(/quitado/i);
    expect(getFinancingById(proposal.id).status).toBe('paid_off');
    expect(pathBReceivables(proposal.id).every((row) => row.status === RECEIVABLE_STATUS.PAID)).toBe(true);
  });

  it('T19 budget HISTORICO does not cancel financing', () => {
    const budget = saveNamedBudget(adminA, APPT_A);
    const proposal = createProposal(adminA, { budget_id: budget.id, treatment_plan_id: budget.id });
    approveFinancing(adminA, proposal.id);
    const before = JSON.stringify(pathBReceivables(proposal.id));
    createNewBudgetForAppointment(adminA, APPT_A);
    const archived = (loadDb().clinicalAppointments.find((row) => row.appointmentId === APPT_A).budgetHistory || [])
      .find((row) => row.id === budget.id);
    expect(archived.status).toBe(BUDGET_STATUS.HISTORICO);
    expect(getFinancingById(proposal.id).status).not.toBe('canceled');
    expect(JSON.stringify(pathBReceivables(proposal.id))).toBe(before);
  });

  it('T20 budget CANCELADO before approval cancels draft financing', () => {
    const budget = saveNamedBudget(adminA, APPT_A, { status: BUDGET_STATUS.APROVADO });
    const proposal = createProposal(adminA, { budget_id: budget.id, treatment_plan_id: budget.id });
    const result = cancelApprovedBudgetWithFinance(adminA, APPT_A, 'antes da aprovacao');
    expect(result.budget.status).toBe(BUDGET_STATUS.CANCELADO);
    expect(getFinancingById(proposal.id).status).toBe('canceled');
    expect(pathBReceivables(proposal.id)).toHaveLength(0);
  });

  it('T21 budget CANCELADO after approval does not wipe materialized obligation', () => {
    const budget = saveNamedBudget(adminA, APPT_A, { status: BUDGET_STATUS.APROVADO });
    const proposal = createProposal(adminA, { budget_id: budget.id, treatment_plan_id: budget.id });
    approveFinancing(adminA, proposal.id);
    const result = cancelApprovedBudgetWithFinance(adminA, APPT_A, 'depois');
    expect(result.budget.status).toBe(BUDGET_STATUS.CANCELADO);
    expect(getFinancingById(proposal.id).status).not.toBe('canceled');
    expect(pathBReceivables(proposal.id)).toHaveLength(5);
    expect(pathBReceivables(proposal.id).every((row) => row.status !== RECEIVABLE_STATUS.CANCELED)).toBe(true);
  });

  it('T22 tenant-scoped list does not leak tenant B', () => {
    createProposal(adminA, { description: 'Fin A list' });
    createProposal(adminB, { patient_id: PATIENT_B, description: 'Fin B list' });
    const listedA = listFinancings({ user: adminA });
    const listedB = listFinancings({ user: adminB });
    expect(listedA.every((row) => row.tenant_id === TENANT_A)).toBe(true);
    expect(listedB.every((row) => row.tenant_id === TENANT_B)).toBe(true);
    expect(listedA.some((row) => row.description === 'Fin B list')).toBe(false);
  });

  it('T23 writer denies cross-tenant mutation', () => {
    const proposal = createProposal(adminB, { patient_id: PATIENT_B, description: 'Fin B write' });
    expect(() => approveFinancing(adminA, proposal.id)).toThrow(/outra clínica|TENANT_MISMATCH/i);
    expect(getFinancingById(proposal.id).status).toBe('pending_analysis');
  });

  it('T24 legacy financing derives tenant from patient', () => {
    const proposal = createProposal();
    const live = peekDb();
    delete live.financings.find((row) => row.id === proposal.id).tenant_id;
    const approved = approveFinancing(adminA, proposal.id);
    expect(approved.installments).toHaveLength(4);
    expect(pathBReceivables(proposal.id)).toHaveLength(5);
  });

  it('T25 unknown ownership fails closed', () => {
    const proposal = createProposal();
    const live = peekDb();
    delete live.financings.find((row) => row.id === proposal.id).tenant_id;
    delete live.patients.find((row) => row.id === PATIENT_A).tenant_id;
    expect(() => approveFinancing(adminA, proposal.id)).toThrow(/comprovável|UNOWNED/i);
    expect(getFinancingById(proposal.id).status).toBe('pending_analysis');
  });

  it('T26 RBAC create uses canonical permission', () => {
    expect(can(financeiroA, FINANCING_CREATE_PERMISSION)).toBe(true);
    expect(can(dentistaA, FINANCING_CREATE_PERMISSION)).toBe(false);
    const created = createProposal(financeiroA);
    expect(created.id).toBeTruthy();
    expect(() => createProposal(dentistaA, { description: 'dentista' })).toThrow(/Permissão insuficiente/);
  });

  it('T27 RBAC approve uses canonical permission', () => {
    const proposal = createProposal(financeiroA);
    expect(can(financeiroA, FINANCING_APPROVE_PERMISSION)).toBe(true);
    expect(can(dentistaA, FINANCING_APPROVE_PERMISSION)).toBe(false);
    expect(approveFinancing(financeiroA, proposal.id).installments).toHaveLength(4);
    const other = createProposal();
    expect(() => approveFinancing(dentistaA, other.id)).toThrow(/Permissão insuficiente/);
  });

  it('T28 RBAC cancel uses canonical permission', () => {
    const proposal = createProposal(financeiroA);
    approveFinancing(financeiroA, proposal.id);
    expect(can(financeiroA, FINANCING_CANCEL_PERMISSION)).toBe(true);
    expect(cancelFinancing(financeiroA, proposal.id, 'rbac').status).toBe('canceled');
    const other = createProposal();
    approveFinancing(adminA, other.id);
    expect(() => cancelFinancing(dentistaA, other.id, 'x')).toThrow(/Permissão insuficiente/);
  });

  it('T29 unknown permission is denied', () => {
    expect(() => requirePermission(financeiroA, 'financeiro_financiamentos:unknown_action'))
      .toThrow(/Permissão insuficiente/);
    expect(can(financeiroA, 'finance:write')).toBe(false);
  });

  it('T30 PHASE 11.B PATH A creation idempotency still holds', () => {
    saveBudget(adminA, APPT_A, {
      status: BUDGET_STATUS.NEGOCIACAO,
      professionalId: 'prof-11e',
      procedures: [{ name: 'Restauracao', quantity: 1, unitValue: 1000, totalValue: 1000 }],
      paymentOptions: [{
        id: 'pay-11e-a', type: 'a_vista', accepted: true, method: 'pix',
        firstDueDate: '2026-09-10', total: 1000,
      }],
      totalValue: 1000,
    });
    const first = approveClinicalBudgetWithFinance(adminA, {
      appointmentId: APPT_A,
      patientId: PATIENT_A,
      patient: { id: PATIENT_A },
      budget: getBudget(APPT_A),
    });
    createReceivablesFromApprovedBudget(adminA, APPT_A, PATIENT_A, getBudget(APPT_A));
    const recv = (loadDb().accountsReceivable || []).filter((row) => row.origin_id === first.budget.id);
    expect(recv).toHaveLength(first.receivables.length);
  });

  it('T31 PHASE 11.C payment idempotency still holds', () => {
    const title = createReceivable(adminA, {
      patient_id: PATIENT_A,
      description: 'CR 11E',
      original_amount: 400,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY,
    });
    payReceivable(adminA, title.id, 400, 'op-11e-t31');
    const second = payReceivable(adminA, title.id, 400, 'op-11e-t31');
    expect(second.replayed).toBe(true);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
  });

  it('T32 PHASE 11.D unpaid cancel still holds', () => {
    const title = createReceivable(adminA, {
      patient_id: PATIENT_A,
      description: 'CR 11E cancel',
      original_amount: 300,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY,
    });
    expect(cancelReceivable(adminA, title.id, '11e').status).toBe(RECEIVABLE_STATUS.CANCELED);
  });

  it('T33 contracts still have no automatic financial side-effects', () => {
    ensureContractsModuleSeeded();
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-11e-1',
        contractNumber: 'CTR-11E-1',
        clinicId: 'clinic-11e-a',
        tenant_id: TENANT_A,
        patientId: PATIENT_A,
        status: CONTRACT_STATUS.GENERATED,
        renderedHtml: '<p>11E</p>',
        finalContent: '<p>11E</p>',
        documentHash: 'hash-11e',
        version: 1,
      }];
      return db;
    });
    const before = financeSnapshot();
    cancelUnsignedContract({ user: adminA, contractId: 'gctr-11e-1', reason: 'desistencia' });
    expect(financeSnapshot()).toBe(before);
  });
});
