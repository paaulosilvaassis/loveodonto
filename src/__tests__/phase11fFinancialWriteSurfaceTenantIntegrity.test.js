/**
 * PHASE 11.F — financial write surface, charges, boleto & tenant read integrity.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initDb, loadDb, peekDb, resetDb, withDb } from '../db/index.js';
import { can, requirePermission } from '../permissions/permissions.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import {
  BOLETO_REMINDER_CHANNEL,
  FINANCIAL_PAYMENT_METHOD,
  RECEIVABLE_CHARGE_TYPE,
} from '../services/auditEventCatalog.js';
import { createBoletoCharge, listBoletoCharges } from '../services/boletoChargesService.js';
import { cancelUnsignedContract } from '../services/contractLifecycleCommandService.js';
import { ensureContractsModuleSeeded } from '../services/contractModuleService.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  getDashboardMetrics,
} from '../services/dashboardMetricsService.js';
import { getDreReport } from '../services/financeDreService.js';
import {
  BOLETO_CREATE_PERMISSION,
  BOLETO_RESEND_PERMISSION,
} from '../services/financialChargeOwnership.js';
import {
  approveFinancing,
  createFinancingProposal,
  getFinancingById,
  runBoletoReminderRule,
} from '../services/financingsService.js';
import {
  cancelReceivable,
  createReceivable,
  createReceivableCharge,
  getReceivableById,
  getReceivablePayments,
  getReceivablesKPIs,
  listReceivableCharges,
  listReceivables,
  RECEIVABLE_ORIGIN_TYPE,
  RECEIVABLE_STATUS,
  registerReceivablePayment,
  reverseReceivablePayment,
} from '../services/receivablesService.js';
import { isEffectiveReceivablePayment } from '../services/receivableReconciliation.js';

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const TENANT_A = 'tenant-11f-a';
const TENANT_B = 'tenant-11f-b';
const PATIENT_A = 'patient-11f-a';
const PATIENT_B = 'patient-11f-b';

const adminA = {
  id: 'user-11f-admin-a', role: 'admin', tenant_id: TENANT_A, tenantId: TENANT_A, name: 'Admin 11F A',
};
const adminB = {
  id: 'user-11f-admin-b', role: 'admin', tenant_id: TENANT_B, tenantId: TENANT_B, name: 'Admin 11F B',
};
const financeiroA = {
  id: 'user-11f-fin', role: 'financeiro', tenant_id: TENANT_A, tenantId: TENANT_A, name: 'Fin 11F',
};
const dentistaA = {
  id: 'user-11f-dent', role: 'dentista', tenant_id: TENANT_A, tenantId: TENANT_A, name: 'Dent 11F',
};

const CORE_WRITE_FILES = [
  'services/receivablesService.js',
  'services/receivablePaymentLifecycle.js',
  'services/receivableObligationLifecycle.js',
  'services/boletoChargesService.js',
  'services/financingsService.js',
  'services/financingOperationalFlowsService.js',
  'services/financialChargeOwnership.js',
  'services/financingOwnership.js',
  'services/financingReconciliation.js',
];

const OUT_OF_SCOPE_FINANCE_WRITE = [
  'services/payablesService.js',
  'services/cashRegisterService.js',
  'services/commissionCalculationService.js',
  'services/commissionRulesService.js',
  'services/suppliersService.js',
  'services/financeService.js',
];

function readSrc(rel) {
  return readFileSync(join(SRC_ROOT, rel), 'utf8');
}

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
      { id: TENANT_A, name: 'Clinica 11F A', status: 'active' },
      { id: TENANT_B, name: 'Clinica 11F B', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-11f-a', tenant_id: TENANT_A, razaoSocial: 'Clinica 11F A' };
    db.patients = [
      { id: PATIENT_A, tenant_id: TENANT_A, full_name: 'Paciente 11F A' },
      { id: PATIENT_B, tenant_id: TENANT_B, full_name: 'Paciente 11F B' },
    ];
    db.appointments = [{
      id: 'apt-11f-a',
      tenant_id: TENANT_A,
      patientId: PATIENT_A,
      professionalId: 'prof-11f',
      date: '2026-08-31',
      status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
    }];
    db.accountsReceivable = [];
    db.receivablePayments = [];
    db.receivableCharges = [];
    db.boletoCharges = [];
    db.boletoReminderEvents = [];
    db.financings = [];
    return db;
  });
}

function openReceivable(user, amount, extras = {}) {
  return createReceivable(user, {
    patient_id: extras.patient_id || PATIENT_A,
    description: extras.description || 'CR 11F',
    original_amount: amount,
    origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY,
    due_date: extras.due_date || '2026-08-15',
    payment_method_expected: FINANCIAL_PAYMENT_METHOD.PIX,
    ...extras,
    patient_id: extras.patient_id || PATIENT_A,
  });
}

function charge(user, receivableId, extras = {}) {
  return createReceivableCharge(user, {
    receivable_id: receivableId,
    charge_type: RECEIVABLE_CHARGE_TYPE.WHATSAPP_REMINDER,
    recipient: 'internal',
    ...extras,
  });
}

function pay(user, receivableId, amount, operationId) {
  return registerReceivablePayment(user, receivableId, {
    payment_date: '2026-08-10',
    amount_received: amount,
    payment_method: FINANCIAL_PAYMENT_METHOD.PIX,
    operation_id: operationId,
  });
}

describe('PHASE 11.F financial write surface tenant integrity', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seed();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('T1 active financial writers no longer use legacy finance:write', () => {
    expect(can(financeiroA, 'finance:write')).toBe(false);
    expect(can(financeiroA, BOLETO_CREATE_PERMISSION)).toBe(true);
    expect(can(financeiroA, BOLETO_RESEND_PERMISSION)).toBe(true);
    for (const rel of CORE_WRITE_FILES) {
      expect(readSrc(rel)).not.toMatch(/requirePermission\([^)]*['"]finance:write['"]/);
    }
    for (const rel of OUT_OF_SCOPE_FINANCE_WRITE) {
      expect(readSrc(rel)).toMatch(/requirePermission\([^)]*['"]finance:write['"]/);
    }
  });

  it('T2 canonical charge RBAC success', () => {
    const title = openReceivable(adminA, 200);
    const created = charge(financeiroA, title.id, { operation_id: 'op-11f-t2' });
    expect(created.id).toBeTruthy();
    expect(created.tenant_id).toBe(TENANT_A);
    expect(created.receivable_id).toBe(title.id);
  });

  it('T3 charge RBAC missing denies writer', () => {
    const title = openReceivable(adminA, 200);
    expect(can(dentistaA, BOLETO_CREATE_PERMISSION)).toBe(false);
    expect(() => charge(dentistaA, title.id, { operation_id: 'op-11f-t3' }))
      .toThrow(/Permissão insuficiente/);
    expect(listReceivableCharges({ user: adminA })).toHaveLength(0);
  });

  it('T4 unknown permission is denied', () => {
    expect(() => requirePermission(financeiroA, 'financeiro_boletos:unknown_action'))
      .toThrow(/Permissão insuficiente/);
    expect(() => requirePermission(financeiroA, 'financeiro_boletos:invented'))
      .toThrow(/Permissão insuficiente/);
  });

  it('T5 charge tenant mismatch is denied', () => {
    const titleB = openReceivable(adminB, 300, { patient_id: PATIENT_B, description: 'CR B' });
    expect(() => charge(adminA, titleB.id, { operation_id: 'op-11f-t5' }))
      .toThrow(/outra clínica|TENANT_MISMATCH/i);
    expect(listReceivableCharges({ user: adminB })).toHaveLength(0);
  });

  it('T6 legacy charge ownership derivable only for owner tenant', () => {
    const title = openReceivable(adminA, 180);
    const live = peekDb();
    delete live.accountsReceivable.find((row) => row.id === title.id).tenant_id;
    const created = charge(adminA, title.id, { operation_id: 'op-11f-t6' });
    expect(created.tenant_id).toBe(TENANT_A);
    expect(() => charge(adminB, title.id, { operation_id: 'op-11f-t6-b' }))
      .toThrow(/outra clínica|TENANT_MISMATCH/i);
  });

  it('T7 legacy charge ownership unknown fails closed', () => {
    const title = openReceivable(adminA, 160, { description: 'unowned charge' });
    const live = peekDb();
    delete live.accountsReceivable.find((row) => row.id === title.id).tenant_id;
    delete live.patients.find((row) => row.id === PATIENT_A).tenant_id;
    expect(() => charge(adminA, title.id, { operation_id: 'op-11f-t7' }))
      .toThrow(/comprovável|UNOWNED/i);
    expect(listReceivableCharges({})).toHaveLength(0);
  });

  it('T8 charge retry does not duplicate financial obligation', () => {
    const title = openReceivable(adminA, 400);
    const beforeCount = (loadDb().accountsReceivable || []).length;
    const first = charge(adminA, title.id, { operation_id: 'op-11f-t8' });
    const second = charge(adminA, title.id, { operation_id: 'op-11f-t8' });
    expect(second.id).toBe(first.id);
    expect((loadDb().accountsReceivable || []).length).toBe(beforeCount);
    expect(listReceivableCharges({ user: adminA })).toHaveLength(1);
    expect(getReceivablePayments(title.id)).toHaveLength(0);
    expect(getReceivableById(title.id).remaining_amount).toBe(400);
  });

  it('T9 boleto reminder does not process other tenant', () => {
    createBoletoCharge(adminB, {
      patient_id: PATIENT_B,
      due_date: '2026-08-10',
      amount: 90,
      charge_type: 'boleto',
    });
    createBoletoCharge(adminA, {
      patient_id: PATIENT_A,
      due_date: '2026-08-10',
      amount: 80,
      charge_type: 'boleto',
    });
    const reminders = runBoletoReminderRule(adminA, '2026-08-07');
    expect(reminders.every((row) => row.tenant_id === TENANT_A)).toBe(true);
    expect(reminders.some((row) => row.tenant_id === TENANT_B)).toBe(false);
    const bCharges = listBoletoCharges({ user: adminB });
    expect(bCharges).toHaveLength(1);
    expect(reminders.some((row) => row.boleto_charge_id === bCharges[0].id)).toBe(false);
  });

  it('T10 boleto reminder RBAC uses canonical permission', () => {
    createBoletoCharge(adminA, {
      patient_id: PATIENT_A,
      due_date: '2026-08-10',
      amount: 70,
      charge_type: 'boleto',
    });
    expect(can(dentistaA, BOLETO_RESEND_PERMISSION)).toBe(false);
    expect(() => runBoletoReminderRule(dentistaA, '2026-08-07')).toThrow(/Permissão insuficiente/);
    const reminders = runBoletoReminderRule(financeiroA, '2026-08-07');
    expect(reminders.length).toBeGreaterThanOrEqual(1);
  });

  it('T11 external side effect is mocked / internal only', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const title = openReceivable(adminA, 110);
    charge(adminA, title.id, { operation_id: 'op-11f-t11' });
    createBoletoCharge(adminA, {
      patient_id: PATIENT_A,
      due_date: '2026-08-10',
      amount: 110,
      charge_type: 'boleto',
    });
    const reminders = runBoletoReminderRule(adminA, '2026-08-07');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(reminders.every((row) => row.channel === BOLETO_REMINDER_CHANNEL.INTERNAL_NOTIFICATION)).toBe(true);
  });

  it('T12 listReceivables tenant explicit returns only A', () => {
    openReceivable(adminA, 100, { description: 'A' });
    openReceivable(adminB, 250, { patient_id: PATIENT_B, description: 'B' });
    const listA = listReceivables({ user: adminA });
    const listB = listReceivables({ user: adminB });
    expect(listA.every((row) => row.tenant_id === TENANT_A)).toBe(true);
    expect(listB.every((row) => row.tenant_id === TENANT_B)).toBe(true);
    expect(listA.some((row) => row.description === 'B')).toBe(false);
  });

  it('T13 legacy receivable with derived tenant is visible only to owner', () => {
    const title = openReceivable(adminA, 220, { description: 'legacy derived' });
    const live = peekDb();
    delete live.accountsReceivable.find((row) => row.id === title.id).tenant_id;
    const listA = listReceivables({ user: adminA });
    const listB = listReceivables({ user: adminB });
    expect(listA.some((row) => row.id === title.id)).toBe(true);
    expect(listB.some((row) => row.id === title.id)).toBe(false);
  });

  it('T14 legacy receivable unknown ownership is omitted from tenant listing', () => {
    const title = openReceivable(adminA, 240, { description: 'legacy unknown' });
    const live = peekDb();
    delete live.accountsReceivable.find((row) => row.id === title.id).tenant_id;
    delete live.patients.find((row) => row.id === PATIENT_A).tenant_id;
    expect(listReceivables({ user: adminA }).some((row) => row.id === title.id)).toBe(false);
    expect(listReceivables({ user: adminB }).some((row) => row.id === title.id)).toBe(false);
    expect((peekDb().accountsReceivable || []).some((row) => row.id === title.id)).toBe(true);
  });

  it('T15 legacy unowned does not contaminate tenant KPI', () => {
    openReceivable(adminA, 500, { description: 'owned kpi' });
    const unowned = openReceivable(adminA, 900, { description: 'unowned kpi' });
    const live = peekDb();
    delete live.accountsReceivable.find((row) => row.id === unowned.id).tenant_id;
    delete live.patients.find((row) => row.id === PATIENT_A).tenant_id;
    live.patients.push({ id: 'patient-11f-orphan', full_name: 'Orphan' });
    const kpis = getReceivablesKPIs(8, 2026, { user: adminA });
    expect(kpis.totalToReceive).toBe(500);
    const dre = getDreReport({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      user: adminA,
    });
    expect(dre).toBeTruthy();
    const dash = getDashboardMetrics(new Date('2026-08-15T12:00:00'), { user: adminA });
    expect(dash.monthlyRevenue).toBe(0);
  });

  it('T16 no active path inserts payment outside 11.C', () => {
    const title = openReceivable(adminA, 300);
    charge(adminA, title.id, { operation_id: 'op-11f-t16' });
    expect(getReceivablePayments(title.id)).toHaveLength(0);
    expect(readSrc('services/boletoChargesService.js')).not.toMatch(/receivablePayments\.push/);
    expect(readSrc('services/receivablesService.js')).not.toMatch(/receivablePayments\.push/);
    const paid = pay(adminA, title.id, 50, 'op-11f-t16-pay');
    expect(paid.payment.operation_id).toBe('op-11f-t16-pay');
    expect(paid.payment.tenant_id).toBe(TENANT_A);
  });

  it('T17 no active path bypasses receivable lifecycle 11.D', () => {
    const title = openReceivable(adminA, 300);
    charge(adminA, title.id, { operation_id: 'op-11f-t17' });
    expect(getReceivableById(title.id).status).not.toBe(RECEIVABLE_STATUS.PAID);
    expect(getReceivableById(title.id).status).not.toBe(RECEIVABLE_STATUS.CANCELED);
    pay(adminA, title.id, 100, 'op-11f-t17-pay');
    expect(() => cancelReceivable(adminA, title.id, 'partial')).toThrow(/parcialmente pago|PRODUCT_DECISION/i);
    const unpaid = openReceivable(adminA, 80, { description: 'unpaid cancel' });
    expect(cancelReceivable(adminA, unpaid.id, 'ok').status).toBe(RECEIVABLE_STATUS.CANCELED);
  });

  it('T18 no active path bypasses financing lifecycle 11.E', () => {
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A,
      description: 'Fin 11F',
      total_amount: 800,
      entry_amount: 0,
      installments_count: 2,
      installment_frequency: 'monthly',
      first_due_date: '2026-09-10',
      issue_date: '2026-08-31',
      boleto_auto_generate: false,
      requires_credit_analysis: false,
    });
    expect(proposal.tenant_id).toBe(TENANT_A);
    expect(['draft', 'pending_analysis']).toContain(proposal.status);
    createBoletoCharge(adminA, {
      financing_id: proposal.id,
      patient_id: PATIENT_A,
      due_date: '2026-09-10',
      amount: 400,
      charge_type: 'boleto',
    });
    expect(['draft', 'pending_analysis']).toContain(
      loadDb().financings.find((row) => row.id === proposal.id).status,
    );
    const approved = approveFinancing(adminA, proposal.id);
    expect(approved.financing.id).toBe(proposal.id);
    expect(['approved', 'active']).toContain(getFinancingById(proposal.id).status);
  });

  it('T19 PHASE 11.B receivable creation still idempotent', () => {
    const first = openReceivable(adminA, 150, {
      description: 'PATH identity',
      origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN,
      origin_id: 'budget-11f-1',
      installment_number: 1,
    });
    const second = openReceivable(adminA, 150, {
      description: 'PATH identity retry',
      origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN,
      origin_id: 'budget-11f-1',
      installment_number: 1,
    });
    expect(second.id).toBe(first.id);
    expect((loadDb().accountsReceivable || []).filter((row) => row.origin_id === 'budget-11f-1')).toHaveLength(1);
  });

  it('T20 PHASE 11.C payment idempotency still holds', () => {
    const title = openReceivable(adminA, 400);
    const first = pay(adminA, title.id, 400, 'op-11f-t20');
    const second = pay(adminA, title.id, 400, 'op-11f-t20');
    expect(second.replayed).toBe(true);
    expect(second.payment.id).toBe(first.payment.id);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
  });

  it('T21 PHASE 11.C reversal still holds', () => {
    const title = openReceivable(adminA, 250);
    const paid = pay(adminA, title.id, 250, 'op-11f-t21');
    const first = reverseReceivablePayment(adminA, paid.payment.id, { reversal_reason: 'teste 11F' });
    const again = reverseReceivablePayment(adminA, paid.payment.id, { reversal_reason: 'retry' });
    expect(again.reversal.id).toBe(first.reversal.id);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(0);
  });

  it('T22 PHASE 11.D unpaid cancel still holds', () => {
    const title = openReceivable(adminA, 90, { description: 'cancel 11F' });
    expect(cancelReceivable(adminA, title.id, 'ok').status).toBe(RECEIVABLE_STATUS.CANCELED);
  });

  it('T23 PHASE 11.E financing tenant/approve still holds', () => {
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A,
      description: 'Fin 11F T23',
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

  it('T24 contract lifecycle has no automatic financial side-effects', () => {
    ensureContractsModuleSeeded();
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-11f-1',
        contractNumber: 'CTR-11F-1',
        clinicId: 'clinic-11f-a',
        tenant_id: TENANT_A,
        patientId: PATIENT_A,
        status: CONTRACT_STATUS.GENERATED,
        renderedHtml: '<p>11F</p>',
        finalContent: '<p>11F</p>',
        documentHash: 'hash-11f',
        version: 1,
      }];
      return db;
    });
    const before = financeSnapshot();
    cancelUnsignedContract({ user: adminA, contractId: 'gctr-11f-1', reason: 'desistencia' });
    expect(financeSnapshot()).toBe(before);
  });
});
