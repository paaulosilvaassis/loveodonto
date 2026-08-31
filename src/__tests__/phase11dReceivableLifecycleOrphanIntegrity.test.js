/**
 * PHASE 11.D — receivable lifecycle, budget cancellation and orphan integrity.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { initDb, loadDb, peekDb, resetDb, withDb } from '../db/index.js';
import {
  cancelReceivable,
  createReceivable,
  getReceivableById,
  getReceivablePayments,
  getReceivablesKPIs,
  listReceivables,
  RECEIVABLE_CANCEL_PERMISSION,
  RECEIVABLE_ORIGIN_TYPE,
  RECEIVABLE_STATUS,
  RECEIVABLE_TABS,
  RECEIVABLE_UPDATE_PERMISSION,
  registerReceivablePayment,
  reverseReceivablePayment,
  updateReceivable,
} from '../services/receivablesService.js';
import { isEffectiveReceivablePayment } from '../services/receivableReconciliation.js';
import { inspectReceivableIntegrity } from '../services/receivableOrphanIntegrity.js';
import { cancelApprovedBudgetWithFinance } from '../services/clinicalBudgetReceivableLifecycle.js';
import { createNewBudgetForAppointment } from '../services/clinicalBudgetLockService.js';
import { can, requirePermission } from '../permissions/permissions.js';
import {
  approveClinicalBudgetWithFinance,
  createReceivablesFromApprovedBudget,
} from '../services/clinicalBudgetFinance.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS, getBudget, saveBudget } from '../services/clinicalService.js';
import { approveFinancing, createFinancingProposal } from '../services/financingsService.js';
import { listFinancingInstallments } from '../services/financingInstallmentsService.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { cancelUnsignedContract } from '../services/contractLifecycleCommandService.js';
import { ensureContractsModuleSeeded } from '../services/contractModuleService.js';
import { FINANCIAL_PAYMENT_METHOD } from '../services/auditEventCatalog.js';

const TENANT_A = 'tenant-11d-a';
const TENANT_B = 'tenant-11d-b';
const PATIENT_A = 'patient-11d-a';
const PATIENT_B = 'patient-11d-b';
const APPT_A = 'apt-11d-a';
const APPT_B = 'apt-11d-b';

const adminA = {
  id: 'user-11d-admin-a', role: 'admin', tenant_id: TENANT_A, tenantId: TENANT_A, name: 'Admin 11D A',
};
const adminB = {
  id: 'user-11d-admin-b', role: 'admin', tenant_id: TENANT_B, tenantId: TENANT_B, name: 'Admin 11D B',
};
const financeiroA = {
  id: 'user-11d-fin', role: 'financeiro', tenant_id: TENANT_A, tenantId: TENANT_A, name: 'Fin 11D',
};
const dentistaA = {
  id: 'user-11d-dent', role: 'dentista', tenant_id: TENANT_A, tenantId: TENANT_A, name: 'Dent 11D',
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
      { id: TENANT_A, name: 'Clinica 11D A', status: 'active' },
      { id: TENANT_B, name: 'Clinica 11D B', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-11d-a', tenant_id: TENANT_A, razaoSocial: 'Clinica 11D A' };
    db.patients = [
      { id: PATIENT_A, tenant_id: TENANT_A, full_name: 'Paciente 11D A' },
      { id: PATIENT_B, tenant_id: TENANT_B, full_name: 'Paciente 11D B' },
    ];
    db.appointments = [
      {
        id: APPT_A, tenant_id: TENANT_A, patientId: PATIENT_A, professionalId: 'prof-11d',
        date: '2026-08-31', status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      },
      {
        id: APPT_B, tenant_id: TENANT_B, patientId: PATIENT_B, professionalId: 'prof-11d-b',
        date: '2026-08-31', status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      },
    ];
    db.accountsReceivable = [];
    db.receivablePayments = [];
    db.financings = [];
    return db;
  });
}

function buildPathABudget(amount = 1000) {
  return {
    status: BUDGET_STATUS.NEGOCIACAO,
    planName: 'Tratamento 11D',
    professionalId: 'prof-11d',
    procedures: [{ name: 'Restauracao', quantity: 1, unitValue: amount, totalValue: amount }],
    paymentOptions: [{
      id: 'pay-11d', type: 'a_vista', accepted: true, method: 'pix',
      firstDueDate: '2026-09-10', total: amount,
    }],
    totalValue: amount,
  };
}

function approvePathA(user, appointmentId, patientId, amount = 1000) {
  saveBudget(user, appointmentId, buildPathABudget(amount));
  const budget = getBudget(appointmentId);
  return approveClinicalBudgetWithFinance(user, {
    appointmentId,
    patientId,
    patient: { id: patientId },
    budget,
  });
}

function openReceivable(user, amount, extras = {}) {
  return createReceivable(user, {
    patient_id: extras.patient_id || PATIENT_A,
    description: extras.description || 'Titulo 11D',
    original_amount: amount,
    origin_type: extras.origin_type || RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY,
    due_date: extras.due_date || '2026-09-10',
  });
}

function pay(user, receivableId, amount, operationId) {
  return registerReceivablePayment(user, receivableId, {
    amount_received: amount,
    payment_method: FINANCIAL_PAYMENT_METHOD.PIX,
    payment_date: '2026-08-31',
    operation_id: operationId,
  });
}

describe('PHASE 11.D — receivable lifecycle', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seed();
  });

  it('T1 unpaid receivable is cancelled with approved budget cancel', () => {
    const { receivables, budget } = approvePathA(adminA, APPT_A, PATIENT_A, 1000);
    expect(receivables).toHaveLength(1);
    const result = cancelApprovedBudgetWithFinance(adminA, APPT_A, 'desistencia');
    const title = getReceivableById(receivables[0].id);
    expect(title).toBeTruthy();
    expect(title.status).toBe(RECEIVABLE_STATUS.CANCELED);
    expect(getReceivablePayments(title.id)).toHaveLength(0);
    expect(result.budget.status).toBe(BUDGET_STATUS.CANCELADO);
    expect(getBudget(APPT_A).id).toBe(budget.id);
  });

  it('T2 payment writer denies cancelled receivable', () => {
    const title = openReceivable(adminA, 500);
    cancelReceivable(adminA, title.id, 'baixa');
    expect(() => pay(adminA, title.id, 100, 'op-11d-t2')).toThrow(/cancelado/i);
    expect(getReceivablePayments(title.id)).toHaveLength(0);
  });

  it('T3 cancellation retry is idempotent', () => {
    const title = openReceivable(adminA, 400);
    const first = cancelReceivable(adminA, title.id, 'um');
    const second = cancelReceivable(adminA, title.id, 'dois');
    expect(second.id).toBe(first.id);
    expect(second.canceled_at).toBe(first.canceled_at);
    expect(second.canceled_reason).toBe('um');
    expect(getReceivableById(title.id).received_amount).toBe(0);
  });

  it('T4 tenant A cannot cancel receivable of tenant B', () => {
    const titleB = openReceivable(adminB, 300, { patient_id: PATIENT_B, description: 'CR B' });
    expect(() => cancelReceivable(adminA, titleB.id, 'x')).toThrow(/outra clínica|TENANT_MISMATCH/i);
    expect(getReceivableById(titleB.id).status).not.toBe(RECEIVABLE_STATUS.CANCELED);
  });

  it('T5 canonical cancel permission passes', () => {
    expect(can(financeiroA, RECEIVABLE_CANCEL_PERMISSION)).toBe(true);
    const title = openReceivable(adminA, 120);
    expect(cancelReceivable(financeiroA, title.id, 'ok').status).toBe(RECEIVABLE_STATUS.CANCELED);
  });

  it('T6 missing cancel permission denies writer', () => {
    const title = openReceivable(adminA, 120);
    expect(can(dentistaA, RECEIVABLE_CANCEL_PERMISSION)).toBe(false);
    expect(() => cancelReceivable(dentistaA, title.id, 'x')).toThrow(/Permissão insuficiente/);
  });

  it('T7 legacy receivable without tenant derives patient tenant', () => {
    const title = openReceivable(adminA, 200);
    const live = peekDb();
    delete live.accountsReceivable.find((row) => row.id === title.id).tenant_id;
    expect(cancelReceivable(adminA, title.id, 'legado').status).toBe(RECEIVABLE_STATUS.CANCELED);
  });

  it('T8 legacy receivable without ownership fails closed', () => {
    const title = openReceivable(adminA, 200, { description: 'unowned' });
    const live = peekDb();
    delete live.accountsReceivable.find((row) => row.id === title.id).tenant_id;
    delete live.patients.find((row) => row.id === PATIENT_A).tenant_id;
    expect(() => cancelReceivable(adminA, title.id, 'x')).toThrow(/comprovável|UNOWNED/i);
  });

  it('T9 partially paid cancellation is fail-closed and keeps payment', () => {
    const title = openReceivable(adminA, 1000);
    pay(adminA, title.id, 400, 'op-11d-t9');
    expect(() => cancelReceivable(adminA, title.id, 'x')).toThrow(/parcialmente pago|PRODUCT_DECISION/i);
    const kept = getReceivableById(title.id);
    expect(kept.status).toBe(RECEIVABLE_STATUS.PARTIALLY_PAID);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
    expect(kept.received_amount).toBe(400);
  });

  it('T10 fully paid remains reconciled when budget goes HISTORICO', () => {
    const { receivables, budget } = approvePathA(adminA, APPT_A, PATIENT_A, 1000);
    pay(adminA, receivables[0].id, 1000, 'op-11d-t10');
    expect(getReceivableById(receivables[0].id).status).toBe(RECEIVABLE_STATUS.PAID);
    createNewBudgetForAppointment(adminA, APPT_A);
    const archived = (loadDb().clinicalAppointments.find((row) => row.appointmentId === APPT_A).budgetHistory || [])
      .find((row) => row.id === budget.id);
    expect(archived.status).toBe(BUDGET_STATUS.HISTORICO);
    const title = getReceivableById(receivables[0].id);
    expect(title.status).toBe(RECEIVABLE_STATUS.PAID);
    expect(title.received_amount).toBe(1000);
    expect(title.origin_id).toBe(budget.id);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
  });

  it('T11 fully paid is preserved when budget is cancelled', () => {
    const { receivables } = approvePathA(adminA, APPT_A, PATIENT_A, 1000);
    pay(adminA, receivables[0].id, 1000, 'op-11d-t11');
    const result = cancelApprovedBudgetWithFinance(adminA, APPT_A, 'encerrar');
    expect(result.budget.status).toBe(BUDGET_STATUS.CANCELADO);
    const title = getReceivableById(receivables[0].id);
    expect(title.status).toBe(RECEIVABLE_STATUS.PAID);
    expect(title.received_amount).toBe(1000);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
  });

  it('T12 new budget cycle does not silently mutate receivable A', () => {
    const { receivables, budget } = approvePathA(adminA, APPT_A, PATIENT_A, 1000);
    const before = JSON.stringify(getReceivableById(receivables[0].id));
    createNewBudgetForAppointment(adminA, APPT_A);
    expect(getBudget(APPT_A).id).not.toBe(budget.id);
    expect(JSON.stringify(getReceivableById(receivables[0].id))).toBe(before);
  });

  it('T13 budget B approval creates its own financial identity', () => {
    const first = approvePathA(adminA, APPT_A, PATIENT_A, 1000);
    createNewBudgetForAppointment(adminA, APPT_A);
    saveBudget(adminA, APPT_A, buildPathABudget(800));
    const second = approveClinicalBudgetWithFinance(adminA, {
      appointmentId: APPT_A,
      patientId: PATIENT_A,
      patient: { id: PATIENT_A },
      budget: getBudget(APPT_A),
    });
    expect(second.budget.id).not.toBe(first.budget.id);
    expect(second.receivables[0].id).not.toBe(first.receivables[0].id);
    expect(second.receivables[0].origin_id).toBe(second.budget.id);
    expect(first.receivables[0].origin_id).toBe(first.budget.id);
  });

  it('T14 new writes do not create receivables without coherent origin', () => {
    const first = approvePathA(adminA, APPT_A, PATIENT_A, 1000);
    createNewBudgetForAppointment(adminA, APPT_A);
    saveBudget(adminA, APPT_A, buildPathABudget(800));
    approveClinicalBudgetWithFinance(adminA, {
      appointmentId: APPT_A,
      patientId: PATIENT_A,
      patient: { id: PATIENT_A },
      budget: getBudget(APPT_A),
    });
    const report = inspectReceivableIntegrity();
    expect(report.some((row) => row.origin_id === first.budget.id && row.is_orphan)).toBe(false);
    expect(report.filter((row) => row.is_orphan)).toHaveLength(0);
    expect(report.some((row) => row.issues.includes('operational_detach_historical_budget'))).toBe(true);
  });

  it('T15 reversal remains allowed after receivable cancellation', () => {
    const title = openReceivable(adminA, 500);
    const paid = pay(adminA, title.id, 500, 'op-11d-t15');
    const live = peekDb();
    live.accountsReceivable.find((row) => row.id === title.id).status = RECEIVABLE_STATUS.CANCELED;
    expect(() => pay(adminA, title.id, 10, 'op-11d-t15-new')).toThrow(/cancelado/i);
    reverseReceivablePayment(adminA, paid.payment.id, { reversal_reason: 'legado' });
    expect(getReceivablePayments(title.id).some((row) => row.kind === 'reversal')).toBe(true);
  });

  it('T16 cancelled unpaid receivable is excluded from open KPI', () => {
    const title = openReceivable(adminA, 700);
    cancelReceivable(adminA, title.id, 'kpi');
    const kpis = getReceivablesKPIs(9, 2026);
    expect(kpis.totalUpcoming).toBe(0);
    expect(kpis.totalOverdue).toBe(0);
    expect(listReceivables({ tabFilter: RECEIVABLE_TABS.A_RECEBER }).some((row) => row.id === title.id)).toBe(false);
  });

  it('T17 historical paid receivable remains in received KPI', () => {
    const { receivables, budget } = approvePathA(adminA, APPT_A, PATIENT_A, 1000);
    pay(adminA, receivables[0].id, 1000, 'op-11d-t17');
    createNewBudgetForAppointment(adminA, APPT_A);
    expect(getBudget(APPT_A).id).not.toBe(budget.id);
    const kpis = getReceivablesKPIs(9, 2026);
    expect(kpis.totalReceived).toBe(1000);
    expect(listReceivables({ tabFilter: RECEIVABLE_TABS.RECEBIDOS }).some((row) => row.id === receivables[0].id)).toBe(true);
  });

  it('T18 direct update writer denies cross-tenant', () => {
    const titleB = openReceivable(adminB, 250, { patient_id: PATIENT_B, description: 'edit B' });
    expect(() => updateReceivable(adminA, titleB.id, { description: 'hack' })).toThrow(/outra clínica|TENANT_MISMATCH/i);
    expect(getReceivableById(titleB.id).description).toBe('edit B');
  });

  it('T19 unknown permission is denied', () => {
    expect(() => requirePermission(financeiroA, 'financeiro_contas_receber:unknown_action'))
      .toThrow(/Permissão insuficiente/);
    expect(can(financeiroA, RECEIVABLE_UPDATE_PERMISSION)).toBe(true);
  });

  it('T20 PATH A 11.B creation idempotency still holds', () => {
    const first = approvePathA(adminA, APPT_A, PATIENT_A, 1000);
    createReceivablesFromApprovedBudget(adminA, APPT_A, PATIENT_A, getBudget(APPT_A));
    const recv = (loadDb().accountsReceivable || []).filter((row) => row.origin_id === first.budget.id);
    expect(recv).toHaveLength(first.receivables.length);
  });

  it('T21 Phase 11.C payment idempotency still holds', () => {
    const title = openReceivable(adminA, 1000);
    pay(adminA, title.id, 400, 'op-11d-t21');
    const second = pay(adminA, title.id, 400, 'op-11d-t21');
    expect(second.replayed).toBe(true);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
  });

  it('T22 Phase 11.C reversal reconciliation still holds', () => {
    const title = openReceivable(adminA, 1000);
    const paid = pay(adminA, title.id, 1000, 'op-11d-t22');
    reverseReceivablePayment(adminA, paid.payment.id, { reversal_reason: 'reg' });
    const refreshed = getReceivableById(title.id);
    expect(refreshed.received_amount).toBe(0);
    expect(refreshed.status).not.toBe(RECEIVABLE_STATUS.PAID);
  });

  it('T23 PATH B financing still works', () => {
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A,
      description: 'Fin 11D',
      total_amount: 1200,
      entry_amount: 200,
      installments_count: 4,
      installment_frequency: 'monthly',
      first_due_date: '2026-04-10',
      issue_date: '2026-03-10',
      interest_type: 'none',
      interest_rate: 0,
      discount_amount: 0,
      boleto_auto_generate: true,
      requires_credit_analysis: true,
    });
    const approved = approveFinancing(adminA, proposal.id, { entry_received_now: false });
    expect(approved.installments.length).toBe(4);
    expect(listFinancingInstallments({ financing_id: proposal.id }).length).toBe(4);
  });

  it('T24 contracts still have no automatic financial side-effects', () => {
    ensureContractsModuleSeeded();
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-11d-1',
        contractNumber: 'CTR-11D-1',
        clinicId: 'clinic-11d-a',
        tenant_id: TENANT_A,
        patientId: PATIENT_A,
        status: CONTRACT_STATUS.GENERATED,
        renderedHtml: '<p>11D</p>',
        finalContent: '<p>11D</p>',
        documentHash: 'hash-11d',
        version: 1,
      }];
      return db;
    });
    const before = financeSnapshot();
    cancelUnsignedContract({ user: adminA, contractId: 'gctr-11d-1', reason: 'desistencia' });
    expect(financeSnapshot()).toBe(before);
  });
});
