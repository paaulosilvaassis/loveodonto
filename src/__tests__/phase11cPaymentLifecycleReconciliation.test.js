/**
 * PHASE 11.C — payment lifecycle, idempotency, reversal and reconciliation.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDb, loadDb, peekDb, resetDb, withDb } from '../db/index.js';
import {
  createReceivable,
  getReceivableById,
  getReceivablePayments,
  PAYMENT_RECEIVE_PERMISSION,
  PAYMENT_REVERSE_PERMISSION,
  RECEIVABLE_ORIGIN_TYPE,
  RECEIVABLE_STATUS,
  registerReceivablePayment,
  reverseReceivablePayment,
} from '../services/receivablesService.js';
import { __setPaymentWriteFaultForTest } from '../services/receivablePaymentLifecycle.js';
import {
  isEffectiveReceivablePayment,
  reconcileReceivableFromPayments,
} from '../services/receivableReconciliation.js';
import { toCents } from '../services/receivableMoney.js';
import { can } from '../permissions/permissions.js';
import {
  approveClinicalBudgetWithFinance,
  createReceivablesFromApprovedBudget,
} from '../services/clinicalBudgetFinance.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS, getBudget, saveBudget } from '../services/clinicalService.js';
import {
  approveFinancing,
  createFinancingProposal,
} from '../services/financingsService.js';
import { listFinancingInstallments } from '../services/financingInstallmentsService.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { cancelUnsignedContract } from '../services/contractLifecycleCommandService.js';
import { ensureContractsModuleSeeded } from '../services/contractModuleService.js';
import { FINANCIAL_PAYMENT_METHOD } from '../services/auditEventCatalog.js';

const TENANT_A = 'tenant-11c-a';
const TENANT_B = 'tenant-11c-b';
const PATIENT_A = 'patient-11c-a';
const PATIENT_B = 'patient-11c-b';

const adminA = {
  id: 'user-11c-admin-a', role: 'admin', tenant_id: TENANT_A, tenantId: TENANT_A, name: 'Admin 11C A',
};
const adminB = {
  id: 'user-11c-admin-b', role: 'admin', tenant_id: TENANT_B, tenantId: TENANT_B, name: 'Admin 11C B',
};
const financeiroA = {
  id: 'user-11c-fin', role: 'financeiro', tenant_id: TENANT_A, tenantId: TENANT_A, name: 'Fin 11C',
};
const dentistaA = {
  id: 'user-11c-dent', role: 'dentista', tenant_id: TENANT_A, tenantId: TENANT_A, name: 'Dent 11C',
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
      { id: TENANT_A, name: 'Clinica 11C A', status: 'active' },
      { id: TENANT_B, name: 'Clinica 11C B', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-11c-a', tenant_id: TENANT_A, razaoSocial: 'Clinica 11C A' };
    db.patients = [
      { id: PATIENT_A, tenant_id: TENANT_A, full_name: 'Paciente 11C A' },
      { id: PATIENT_B, tenant_id: TENANT_B, full_name: 'Paciente 11C B' },
    ];
    db.accountsReceivable = [];
    db.receivablePayments = [];
    return db;
  });
}

function openReceivable(user, amount, extras = {}) {
  return createReceivable(user, {
    patient_id: extras.patient_id || PATIENT_A,
    description: extras.description || 'Titulo 11C',
    original_amount: amount,
    origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY,
    due_date: extras.due_date || '2026-09-15',
  });
}

function pay(user, receivableId, amount, operationId, extra = {}) {
  return registerReceivablePayment(user, receivableId, {
    amount_received: amount,
    payment_method: FINANCIAL_PAYMENT_METHOD.PIX,
    payment_date: '2026-08-31',
    operation_id: operationId,
    ...extra,
  });
}

describe('PHASE 11.C — payment lifecycle', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seed();
    __setPaymentWriteFaultForTest(null);
  });

  afterEach(() => {
    __setPaymentWriteFaultForTest(null);
  });

  it('T1 first payment creates one payment and one effect', () => {
    const title = openReceivable(adminA, 1000);
    const result = pay(adminA, title.id, 400, 'op-11c-t1');
    expect(result.payment.id).toBeTruthy();
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
    const refreshed = getReceivableById(title.id);
    expect(refreshed.received_amount).toBe(400);
    expect(refreshed.remaining_amount).toBe(600);
    expect(refreshed.status).toBe(RECEIVABLE_STATUS.PARTIALLY_PAID);
  });

  it('T2 exact retry with same operation id creates 0 extra payments', () => {
    const title = openReceivable(adminA, 1000);
    pay(adminA, title.id, 400, 'op-11c-t2');
    const second = pay(adminA, title.id, 400, 'op-11c-t2');
    expect(second.replayed).toBe(true);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
    expect(getReceivableById(title.id).received_amount).toBe(400);
  });

  it('T3 double-click simulation shares one effective payment', () => {
    const title = openReceivable(adminA, 1000);
    const first = pay(adminA, title.id, 250, 'op-11c-t3');
    const second = pay(adminA, title.id, 250, 'op-11c-t3');
    expect(second.payment.id).toBe(first.payment.id);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
  });

  it('T4 legitimate same amount twice with distinct operations', () => {
    const title = openReceivable(adminA, 1000);
    pay(adminA, title.id, 100, 'op-11c-t4a');
    pay(adminA, title.id, 100, 'op-11c-t4b');
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(2);
    expect(getReceivableById(title.id).received_amount).toBe(200);
  });

  it('T5 tenant A cannot pay receivable of tenant B', () => {
    const titleB = openReceivable(adminB, 500, { patient_id: PATIENT_B, description: 'CR B' });
    expect(() => pay(adminA, titleB.id, 100, 'op-11c-t5')).toThrow(/outra clínica|TENANT_MISMATCH/i);
    expect(getReceivablePayments(titleB.id)).toHaveLength(0);
  });

  it('T6 legacy receivable without tenant uses derived patient tenant or fail-closed', () => {
    const derivable = openReceivable(adminA, 300);
    const live = peekDb();
    const derivableRow = (live.accountsReceivable || []).find((item) => item.id === derivable.id);
    delete derivableRow.tenant_id;
    const derivedPay = pay(adminA, derivable.id, 50, 'op-11c-t6-ok');
    expect(derivedPay.payment.tenant_id).toBe(TENANT_A);
    expect(getReceivableById(derivable.id).tenant_id).toBeFalsy();

    const unowned = openReceivable(adminA, 200, { description: 'unowned' });
    const live2 = peekDb();
    const unownedRow = (live2.accountsReceivable || []).find((item) => item.id === unowned.id);
    delete unownedRow.tenant_id;
    const patient = (live2.patients || []).find((item) => item.id === PATIENT_A);
    delete patient.tenant_id;
    expect(() => pay(adminA, unowned.id, 20, 'op-11c-t6-deny')).toThrow(/comprovável|UNOWNED/i);
  });

  it('T7 canonical receive permission passes', () => {
    expect(can(financeiroA, PAYMENT_RECEIVE_PERMISSION)).toBe(true);
    const title = openReceivable(adminA, 120);
    const result = pay(financeiroA, title.id, 120, 'op-11c-t7');
    expect(result.payment.id).toBeTruthy();
  });

  it('T8 missing receive permission denies writer', () => {
    const title = openReceivable(adminA, 120);
    expect(can(dentistaA, PAYMENT_RECEIVE_PERMISSION)).toBe(false);
    expect(() => pay(dentistaA, title.id, 120, 'op-11c-t8')).toThrow(/Permissão insuficiente/);
  });

  it('T9 partial payment reconciles 1000 → 400', () => {
    const title = openReceivable(adminA, 1000);
    pay(adminA, title.id, 400, 'op-11c-t9');
    const refreshed = getReceivableById(title.id);
    expect(refreshed.received_amount).toBe(400);
    expect(refreshed.remaining_amount).toBe(600);
    expect(refreshed.status).not.toBe(RECEIVABLE_STATUS.PAID);
  });

  it('T10 full payment reaches paid', () => {
    const title = openReceivable(adminA, 1000);
    pay(adminA, title.id, 400, 'op-11c-t10a');
    pay(adminA, title.id, 600, 'op-11c-t10b');
    const refreshed = getReceivableById(title.id);
    expect(refreshed.received_amount).toBe(1000);
    expect(refreshed.remaining_amount).toBe(0);
    expect(refreshed.status).toBe(RECEIVABLE_STATUS.PAID);
  });

  it('T11 overpayment is blocked', () => {
    const title = openReceivable(adminA, 1000);
    expect(() => pay(adminA, title.id, 1100, 'op-11c-t11')).toThrow(/excede/);
    expect(getReceivablePayments(title.id)).toHaveLength(0);
    expect(getReceivableById(title.id).received_amount).toBe(0);
  });

  it('T12 zero payment is blocked', () => {
    const title = openReceivable(adminA, 1000);
    expect(() => pay(adminA, title.id, 0, 'op-11c-t12')).toThrow(/maior que zero|inválido/);
    expect(getReceivablePayments(title.id)).toHaveLength(0);
  });

  it('T13 negative payment is blocked', () => {
    const title = openReceivable(adminA, 1000);
    expect(() => pay(adminA, title.id, -10, 'op-11c-t13')).toThrow(/maior que zero/);
    expect(() => pay(adminA, title.id, Number.NaN, 'op-11c-t13b')).toThrow(/inválido/);
    expect(() => pay(adminA, title.id, Number.POSITIVE_INFINITY, 'op-11c-t13c')).toThrow(/inválido/);
  });

  it('T14 cent reconciliation has no float residue', () => {
    const title = openReceivable(adminA, 1000);
    pay(adminA, title.id, 333.33, 'op-11c-t14a');
    pay(adminA, title.id, 333.33, 'op-11c-t14b');
    pay(adminA, title.id, 333.34, 'op-11c-t14c');
    const refreshed = getReceivableById(title.id);
    expect(toCents(refreshed.received_amount)).toBe(100000);
    expect(toCents(refreshed.remaining_amount)).toBe(0);
    expect(refreshed.status).toBe(RECEIVABLE_STATUS.PAID);
  });

  it('T15 full reversal reopens receivable', () => {
    const title = openReceivable(adminA, 1000);
    const paid = pay(adminA, title.id, 1000, 'op-11c-t15');
    expect(getReceivableById(title.id).status).toBe(RECEIVABLE_STATUS.PAID);
    reverseReceivablePayment(adminA, paid.payment.id, { reversal_reason: 'teste' });
    const refreshed = getReceivableById(title.id);
    expect(refreshed.received_amount).toBe(0);
    expect(refreshed.remaining_amount).toBe(1000);
    expect(refreshed.status).not.toBe(RECEIVABLE_STATUS.PAID);
  });

  it('T16 reversal keeps original payment evidence', () => {
    const title = openReceivable(adminA, 1000);
    const paid = pay(adminA, title.id, 1000, 'op-11c-t16');
    reverseReceivablePayment(adminA, paid.payment.id, { reversal_reason: 'evidencia' });
    const all = getReceivablePayments(title.id);
    expect(all.some((row) => row.id === paid.payment.id)).toBe(true);
    expect(all.some((row) => row.kind === 'reversal' && row.reverses_payment_id === paid.payment.id)).toBe(true);
    expect(all.find((row) => row.id === paid.payment.id).amount_received).toBe(1000);
  });

  it('T17 reversal idempotency does not duplicate effect', () => {
    const title = openReceivable(adminA, 1000);
    const paid = pay(adminA, title.id, 1000, 'op-11c-t17');
    const first = reverseReceivablePayment(adminA, paid.payment.id, { reversal_reason: 'um' });
    const second = reverseReceivablePayment(adminA, paid.payment.id, { reversal_reason: 'dois' });
    expect(second.reversal.id).toBe(first.reversal.id);
    expect(getReceivablePayments(title.id).filter((row) => row.kind === 'reversal')).toHaveLength(1);
    expect(getReceivableById(title.id).received_amount).toBe(0);
  });

  it('T18 reverse one of two payments leaves the other', () => {
    const title = openReceivable(adminA, 1000);
    pay(adminA, title.id, 400, 'op-11c-t18a');
    const second = pay(adminA, title.id, 600, 'op-11c-t18b');
    expect(getReceivableById(title.id).status).toBe(RECEIVABLE_STATUS.PAID);
    reverseReceivablePayment(adminA, second.payment.id, { reversal_reason: 'parcial' });
    const refreshed = getReceivableById(title.id);
    expect(refreshed.received_amount).toBe(400);
    expect(refreshed.remaining_amount).toBe(600);
    expect(refreshed.status).toBe(RECEIVABLE_STATUS.PARTIALLY_PAID);
  });

  it('T19 reversal without permission is denied', () => {
    const title = openReceivable(adminA, 200);
    const paid = pay(adminA, title.id, 200, 'op-11c-t19');
    expect(can(dentistaA, PAYMENT_REVERSE_PERMISSION)).toBe(false);
    expect(() => reverseReceivablePayment(dentistaA, paid.payment.id, { reversal_reason: 'x' }))
      .toThrow(/Permissão insuficiente/);
    expect(getReceivableById(title.id).status).toBe(RECEIVABLE_STATUS.PAID);
  });

  it('T20 direct writer deny without user context', () => {
    const title = openReceivable(adminA, 200);
    const paid = pay(adminA, title.id, 80, 'op-11c-t20');
    expect(() => reverseReceivablePayment(null, paid.payment.id, { reversal_reason: 'x' }))
      .toThrow(/Permissão insuficiente/);
    expect(() => pay(null, title.id, 10, 'op-11c-t20b')).toThrow(/Permissão insuficiente/);
  });

  it('T21 mid-write fault leaves no silent partial state', () => {
    const title = openReceivable(adminA, 1000);
    __setPaymentWriteFaultForTest(() => {
      throw new Error('FAULT_MID_PAYMENT');
    });
    expect(() => pay(adminA, title.id, 400, 'op-11c-t21')).toThrow(/FAULT_MID_PAYMENT/);
    expect(getReceivablePayments(title.id)).toHaveLength(0);
    expect(getReceivableById(title.id).received_amount).toBe(0);
  });

  it('T22 cash remains decoupled — payment does not create cash movement', () => {
    const title = openReceivable(adminA, 100);
    pay(adminA, title.id, 100, 'op-11c-t22');
    pay(adminA, title.id, 100, 'op-11c-t22');
    const db = loadDb();
    expect(db.cashTransactions || []).toHaveLength(0);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
  });

  it('T23 PATH A 11.B idempotency still holds', () => {
    withDb((db) => {
      db.appointments = [{
        id: 'apt-11c-a',
        tenant_id: TENANT_A,
        patientId: PATIENT_A,
        professionalId: 'prof-11c',
        date: '2026-08-31',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      }];
      return db;
    });
    saveBudget(adminA, 'apt-11c-a', {
      status: BUDGET_STATUS.NEGOCIACAO,
      professionalId: 'prof-11c',
      procedures: [{ name: 'Implante', quantity: 1, unitValue: 5000, totalValue: 5000 }],
      paymentOptions: [{
        id: 'pay-11c', type: 'parcelado_clinica', accepted: true,
        downPayment: 1000, installments: 2, method: 'pix', firstDueDate: '2026-09-10', total: 5000,
      }],
      totalValue: 5000,
    });
    const budget = getBudget('apt-11c-a');
    const first = approveClinicalBudgetWithFinance(adminA, {
      appointmentId: 'apt-11c-a',
      patientId: PATIENT_A,
      patient: { id: PATIENT_A },
      budget,
    });
    const count = first.receivables.length;
    createReceivablesFromApprovedBudget(adminA, 'apt-11c-a', PATIENT_A, getBudget('apt-11c-a'));
    const db = loadDb();
    const recv = (db.accountsReceivable || []).filter((row) => row.origin_id === first.budget.id);
    expect(recv).toHaveLength(count);
  });

  it('T24 PATH B financing payment still works', () => {
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A,
      description: 'Fin 11C',
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
    const approved = approveFinancing(adminA, proposal.id, { entry_received_now: true });
    expect(approved.installments.length).toBe(4);
    const installment = listFinancingInstallments({ financing_id: proposal.id })[0];
    const result = registerReceivablePayment(adminA, installment.receivable_id, {
      amount_received: 50,
      payment_method: FINANCIAL_PAYMENT_METHOD.BOLETO,
      operation_id: 'op-11c-t24',
    });
    expect(result.payment.id).toBeTruthy();
  });

  it('T25 contracts still have no automatic financial side-effects', () => {
    ensureContractsModuleSeeded();
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-11c-1',
        contractNumber: 'CTR-11C-1',
        clinicId: 'clinic-11c-a',
        tenant_id: TENANT_A,
        patientId: PATIENT_A,
        status: CONTRACT_STATUS.GENERATED,
        renderedHtml: '<p>11C</p>',
        finalContent: '<p>11C</p>',
        documentHash: 'hash-11c',
        version: 1,
      }];
      return db;
    });
    const before = financeSnapshot();
    cancelUnsignedContract({ user: adminA, contractId: 'gctr-11c-1', reason: 'desistencia' });
    expect(financeSnapshot()).toBe(before);
  });

  it('reconciliation matrix covers canonical payment states', () => {
    const cases = [
      { total: 1000, pays: [], reverses: [], paid: 0, remaining: 1000 },
      { total: 1000, pays: [400], reverses: [], paid: 400, remaining: 600 },
      { total: 1000, pays: [400, 600], reverses: [], paid: 1000, remaining: 0 },
      { total: 1000, pays: [1000], reverses: [0], paid: 0, remaining: 1000 },
      { total: 1000, pays: [400, 600], reverses: [1], paid: 400, remaining: 600 },
      { total: 1000, pays: [333.33, 333.33, 333.34], reverses: [], paid: 1000, remaining: 0 },
      { total: 0.30, pays: [0.10, 0.20], reverses: [], paid: 0.30, remaining: 0 },
    ];
    cases.forEach((item, index) => {
      const title = openReceivable(adminA, item.total, { description: `matrix-${index}` });
      const created = item.pays.map((amount, payIndex) => (
        pay(adminA, title.id, amount, `op-matrix-${index}-${payIndex}`).payment.id
      ));
      item.reverses.forEach((payIndex) => {
        reverseReceivablePayment(adminA, created[payIndex], { reversal_reason: 'matrix' });
      });
      const db = loadDb();
      const recv = db.accountsReceivable.find((row) => row.id === title.id);
      const recon = reconcileReceivableFromPayments(recv, db.receivablePayments);
      expect(toCents(recon.receivable.received_amount)).toBe(toCents(item.paid));
      expect(toCents(recon.receivable.remaining_amount)).toBe(toCents(item.remaining));
      expect(toCents(recv.received_amount)).toBe(toCents(item.paid));
      if (item.remaining === 0 && item.total > 0) {
        expect(recv.status).toBe(RECEIVABLE_STATUS.PAID);
      } else {
        expect(recv.status).not.toBe(RECEIVABLE_STATUS.PAID);
      }
    });
  });
});
