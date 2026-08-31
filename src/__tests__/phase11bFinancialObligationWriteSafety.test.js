/**
 * PHASE 11.B — Financial obligation identity & write safety.
 * PATH A only. Sem backfill, sem cutover, sem correção histórica.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS, getBudget, saveBudget } from '../services/clinicalService.js';
import {
  approveClinicalBudgetWithFinance,
  createReceivablesFromApprovedBudget,
  processApprovedBudgetFinance,
} from '../services/clinicalBudgetFinance.js';
import {
  createReceivable,
  listReceivables,
  RECEIVABLE_ORIGIN_TYPE,
  RECEIVABLE_WRITE_PERMISSION,
  registerReceivablePayment,
} from '../services/receivablesService.js';
import * as receivablesService from '../services/receivablesService.js';
import { can, requirePermission } from '../permissions/permissions.js';
import {
  approveFinancing,
  createFinancingProposal,
} from '../services/financingsService.js';
import { listFinancingInstallments } from '../services/financingInstallmentsService.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  cancelUnsignedContract,
} from '../services/contractLifecycleCommandService.js';
import { voidSignedContract } from '../services/contractVoidReissueCommandService.js';
import { ensureContractsModuleSeeded } from '../services/contractModuleService.js';
import { FINANCIAL_PAYMENT_METHOD } from '../services/auditEventCatalog.js';

const TENANT_A = 'tenant-11b-a';
const TENANT_B = 'tenant-11b-b';
const PATIENT_X = 'patient-11b-x';
const APPT_A1 = 'apt-11b-a1';
const APPT_A2 = 'apt-11b-a2';
const APPT_B1 = 'apt-11b-b1';
const AMOUNT = 5000;

const adminA = {
  id: 'user-11b-admin-a',
  role: 'admin',
  tenant_id: TENANT_A,
  tenantId: TENANT_A,
  name: 'Admin 11B A',
};
const adminB = {
  id: 'user-11b-admin-b',
  role: 'admin',
  tenant_id: TENANT_B,
  tenantId: TENANT_B,
  name: 'Admin 11B B',
};
const financeiroA = {
  id: 'user-11b-fin',
  role: 'financeiro',
  tenant_id: TENANT_A,
  tenantId: TENANT_A,
  name: 'Financeiro 11B',
};
const dentistaA = {
  id: 'user-11b-dent',
  role: 'dentista',
  tenant_id: TENANT_A,
  tenantId: TENANT_A,
  name: 'Dentista 11B',
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

function seedTenantsAndActors() {
  withDb((db) => {
    db.tenants = [
      { id: TENANT_A, name: 'Clinica 11B A', status: 'active' },
      { id: TENANT_B, name: 'Clinica 11B B', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-11b-a', tenant_id: TENANT_A, razaoSocial: 'Clinica 11B A' };
    db.patients = [
      { id: PATIENT_X, tenant_id: TENANT_A, full_name: 'Paciente X 11B' },
      { id: 'patient-11b-b', tenant_id: TENANT_B, full_name: 'Paciente B 11B' },
    ];
    db.appointments = [
      {
        id: APPT_A1,
        tenant_id: TENANT_A,
        patientId: PATIENT_X,
        professionalId: 'prof-11b',
        date: '2026-08-31',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      },
      {
        id: APPT_A2,
        tenant_id: TENANT_A,
        patientId: PATIENT_X,
        professionalId: 'prof-11b',
        date: '2026-08-31',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      },
      {
        id: APPT_B1,
        tenant_id: TENANT_B,
        patientId: 'patient-11b-b',
        professionalId: 'prof-11b-b',
        date: '2026-08-31',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      },
    ];
    db.accountsReceivable = [];
    db.receivablePayments = [];
    db.financings = [];
    return db;
  });
}

function buildPathABudget({ amount = AMOUNT, downPayment = 1000, installments = 2 } = {}) {
  return {
    status: BUDGET_STATUS.NEGOCIACAO,
    planName: 'Tratamento 11B',
    professionalId: 'prof-11b',
    procedures: [{
      id: 'proc-11b-1',
      name: 'Implante',
      quantity: 1,
      unitValue: amount,
      totalValue: amount,
    }],
    paymentOptions: [{
      id: 'pay-11b-a',
      type: 'parcelado_clinica',
      accepted: true,
      downPayment,
      installments,
      method: 'pix',
      firstDueDate: '2026-09-10',
      total: amount,
    }],
    totalValue: amount,
  };
}

function countReceivablesForBudget(budgetId, tenantId = null) {
  return (loadDb().accountsReceivable || []).filter((row) => {
    const matchesOrigin = row.origin_id === budgetId || row.budget_id === budgetId;
    if (!matchesOrigin) return false;
    if (!tenantId) return true;
    return String(row.tenant_id || row.tenantId) === String(tenantId);
  });
}

function seedBudget(user, appointmentId, draft) {
  saveBudget(user, appointmentId, draft);
  return getBudget(appointmentId);
}

describe('PHASE 11.B — obligation identity and write safety', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedTenantsAndActors();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('T1 first PATH A materialization creates expected receivables once', () => {
    const budget = seedBudget(adminA, APPT_A1, buildPathABudget());
    const result = approveClinicalBudgetWithFinance(adminA, {
      appointmentId: APPT_A1,
      patientId: PATIENT_X,
      patient: { id: PATIENT_X },
      budget,
      professional: { id: 'prof-11b' },
    });
    expect(getBudget(APPT_A1).status).toBe(BUDGET_STATUS.APROVADO);
    expect(result.receivables).toHaveLength(3);
    const stored = countReceivablesForBudget(budget.id, TENANT_A);
    expect(stored).toHaveLength(3);
    expect(stored.map((row) => row.installment_number).sort((a, b) => a - b)).toEqual([0, 1, 2]);
    expect(stored.every((row) => row.origin_type === RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN)).toBe(true);
    expect(stored.every((row) => row.origin_id === budget.id)).toBe(true);
    expect(stored.every((row) => row.tenant_id === TENANT_A)).toBe(true);
  });

  it('T2 exact retry of createReceivablesFromApprovedBudget creates 0 new titles', () => {
    const budget = seedBudget(adminA, APPT_A1, buildPathABudget());
    const approved = approveClinicalBudgetWithFinance(adminA, {
      appointmentId: APPT_A1,
      patientId: PATIENT_X,
      patient: { id: PATIENT_X },
      budget,
    });
    const firstCount = countReceivablesForBudget(approved.budget.id, TENANT_A).length;
    const second = createReceivablesFromApprovedBudget(
      adminA,
      APPT_A1,
      PATIENT_X,
      getBudget(APPT_A1),
    );
    const third = createReceivablesFromApprovedBudget(
      adminA,
      APPT_A1,
      PATIENT_X,
      getBudget(APPT_A1),
    );
    expect(second).toHaveLength(firstCount);
    expect(third).toHaveLength(firstCount);
    expect(countReceivablesForBudget(approved.budget.id, TENANT_A)).toHaveLength(firstCount);
    expect(second.map((row) => row.id).sort()).toEqual(approved.receivables.map((row) => row.id).sort());
  });

  it('T3 processApprovedBudgetFinance retry does not duplicate', () => {
    const budget = seedBudget(adminA, APPT_A1, buildPathABudget());
    approveClinicalBudgetWithFinance(adminA, {
      appointmentId: APPT_A1,
      patientId: PATIENT_X,
      patient: { id: PATIENT_X },
      budget,
    });
    const persisted = getBudget(APPT_A1);
    const before = countReceivablesForBudget(persisted.id, TENANT_A).length;
    const retry = processApprovedBudgetFinance(adminA, {
      appointmentId: APPT_A1,
      patientId: PATIENT_X,
      patient: { id: PATIENT_X },
      budget: persisted,
    });
    expect(retry.receivables).toHaveLength(before);
    expect(countReceivablesForBudget(persisted.id, TENANT_A)).toHaveLength(before);
  });

  it('T4 different budgets same patient same amount stay independent', () => {
    const budgetA = seedBudget(adminA, APPT_A1, buildPathABudget());
    const budgetB = seedBudget(adminA, APPT_A2, buildPathABudget());
    approveClinicalBudgetWithFinance(adminA, {
      appointmentId: APPT_A1,
      patientId: PATIENT_X,
      patient: { id: PATIENT_X },
      budget: budgetA,
    });
    approveClinicalBudgetWithFinance(adminA, {
      appointmentId: APPT_A2,
      patientId: PATIENT_X,
      patient: { id: PATIENT_X },
      budget: budgetB,
    });
    expect(budgetA.id).not.toBe(budgetB.id);
    const recvA = countReceivablesForBudget(budgetA.id, TENANT_A);
    const recvB = countReceivablesForBudget(budgetB.id, TENANT_A);
    expect(recvA).toHaveLength(3);
    expect(recvB).toHaveLength(3);
    const idsA = new Set(recvA.map((row) => row.id));
    expect(recvB.every((row) => !idsA.has(row.id))).toBe(true);
  });

  it('T5 cross-tenant obligations stay independent and list does not leak', () => {
    const budgetA = seedBudget(adminA, APPT_A1, buildPathABudget());
    const budgetBDraft = {
      ...buildPathABudget(),
      professionalId: 'prof-11b-b',
    };
    const budgetB = seedBudget(adminB, APPT_B1, budgetBDraft);
    approveClinicalBudgetWithFinance(adminA, {
      appointmentId: APPT_A1,
      patientId: PATIENT_X,
      patient: { id: PATIENT_X },
      budget: budgetA,
    });
    approveClinicalBudgetWithFinance(adminB, {
      appointmentId: APPT_B1,
      patientId: 'patient-11b-b',
      patient: { id: 'patient-11b-b' },
      budget: budgetB,
    });
    const listA = listReceivables({ tenantId: TENANT_A });
    const listB = listReceivables({ tenantId: TENANT_B });
    expect(listA.every((row) => row.tenant_id === TENANT_A)).toBe(true);
    expect(listB.every((row) => row.tenant_id === TENANT_B)).toBe(true);
    expect(listA.some((row) => row.origin_id === budgetB.id)).toBe(false);
    expect(listB.some((row) => row.origin_id === budgetA.id)).toBe(false);
  });

  it('T6 createReceivable failure is propagated not swallowed', () => {
    const budget = seedBudget(adminA, APPT_A1, {
      ...buildPathABudget(),
      status: BUDGET_STATUS.APROVADO,
    });
    const spy = vi.spyOn(receivablesService, 'createReceivable').mockImplementation(() => {
      throw new Error('CREATE_RECEIVABLE_FORCED_FAILURE');
    });
    expect(() => createReceivablesFromApprovedBudget(
      adminA,
      APPT_A1,
      PATIENT_X,
      { ...budget, status: BUDGET_STATUS.APROVADO },
    )).toThrow(/CREATE_RECEIVABLE_FORCED_FAILURE/);
    expect(countReceivablesForBudget(budget.id, TENANT_A)).toHaveLength(0);
    spy.mockRestore();
  });

  it('T7 required finance failure does not consolidate APROVADO', () => {
    const budget = seedBudget(adminA, APPT_A1, buildPathABudget());
    expect(getBudget(APPT_A1).status).not.toBe(BUDGET_STATUS.APROVADO);
    const spy = vi.spyOn(receivablesService, 'createReceivable').mockImplementation(() => {
      throw new Error('CREATE_RECEIVABLE_FORCED_FAILURE');
    });
    expect(() => approveClinicalBudgetWithFinance(adminA, {
      appointmentId: APPT_A1,
      patientId: PATIENT_X,
      patient: { id: PATIENT_X },
      budget,
    })).toThrow(/CREATE_RECEIVABLE_FORCED_FAILURE/);
    expect(getBudget(APPT_A1).status).not.toBe(BUDGET_STATUS.APROVADO);
    expect(countReceivablesForBudget(budget.id, TENANT_A)).toHaveLength(0);
    spy.mockRestore();
  });

  it('T8 canonical permission allows createReceivable', () => {
    expect(can(financeiroA, RECEIVABLE_WRITE_PERMISSION)).toBe(true);
    const record = createReceivable(financeiroA, {
      patient_id: PATIENT_X,
      description: 'CR canônico 11B',
      original_amount: 150,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY,
    });
    expect(record.id).toBeTruthy();
    expect(record.tenant_id).toBe(TENANT_A);
  });

  it('T9 missing permission denies writer', () => {
    expect(can(dentistaA, RECEIVABLE_WRITE_PERMISSION)).toBe(false);
    expect(() => createReceivable(dentistaA, {
      patient_id: PATIENT_X,
      description: 'CR sem permissão',
      original_amount: 150,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY,
    })).toThrow(/Permissão insuficiente/);
  });

  it('T10 unknown permission key is deny-closed', () => {
    expect(can(financeiroA, 'modulo_inexistente_11b:edit')).toBe(false);
    expect(can(financeiroA, 'finance:write')).toBe(false);
    expect(() => requirePermission(financeiroA, 'modulo_inexistente_11b:edit')).toThrow(/Permissão insuficiente/);
    expect(() => requirePermission(financeiroA, undefined)).toThrow(/Permissão insuficiente/);
  });

  it('T11 missing user context denies writer', () => {
    expect(() => createReceivable(null, {
      patient_id: PATIENT_X,
      description: 'CR sem usuário',
      original_amount: 150,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY,
    })).toThrow(/Permissão insuficiente/);
    expect(() => approveClinicalBudgetWithFinance(null, {
      appointmentId: APPT_A1,
      patientId: PATIENT_X,
      budget: buildPathABudget(),
    })).toThrow(/Permissão insuficiente/);
  });

  it('T12 tenant mismatch on PATH A is blocked', () => {
    const budgetB = seedBudget(adminB, APPT_B1, {
      ...buildPathABudget(),
      professionalId: 'prof-11b-b',
    });
    expect(() => approveClinicalBudgetWithFinance(adminA, {
      appointmentId: APPT_B1,
      patientId: 'patient-11b-b',
      patient: { id: 'patient-11b-b' },
      budget: budgetB,
    })).toThrow(/outra clínica|TENANT_MISMATCH|Permissão/i);
    expect(getBudget(APPT_B1).status).not.toBe(BUDGET_STATUS.APROVADO);
  });

  it('T13 listReceivables returns only active tenant rows', () => {
    createReceivable(adminA, {
      patient_id: PATIENT_X,
      description: 'CR A',
      original_amount: 80,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY,
    });
    createReceivable(adminB, {
      patient_id: 'patient-11b-b',
      description: 'CR B',
      original_amount: 90,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY,
    });
    const listA = listReceivables({ tenantId: TENANT_A, user: adminA });
    expect(listA.some((row) => row.description === 'CR A')).toBe(true);
    expect(listA.some((row) => row.description === 'CR B')).toBe(false);
  });

  it('T14 PATH B financing approval still materializes installments', () => {
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_X,
      description: 'Financiamento 11B',
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
    const result = approveFinancing(adminA, proposal.id, { entry_received_now: true });
    expect(result.installments.length).toBe(4);
    expect(listFinancingInstallments({ financing_id: proposal.id })).toHaveLength(4);
    const receivables = (loadDb().accountsReceivable || []).filter(
      (row) => row.origin_type === RECEIVABLE_ORIGIN_TYPE.FINANCING && row.origin_id === proposal.id,
    );
    expect(receivables.length).toBe(5);
  });

  it('T15 contract lifecycle has no automatic financial side-effects', () => {
    ensureContractsModuleSeeded();
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-11b-1',
        contractNumber: 'CTR-11B-1',
        clinicId: 'clinic-11b-a',
        tenant_id: TENANT_A,
        patientId: PATIENT_X,
        status: CONTRACT_STATUS.GENERATED,
        renderedHtml: '<p>11B</p>',
        finalContent: '<p>11B</p>',
        documentHash: 'hash-11b',
        version: 1,
      }];
      return db;
    });
    const beforeCancel = financeSnapshot();
    cancelUnsignedContract({ user: adminA, contractId: 'gctr-11b-1', reason: 'desistencia do paciente' });
    expect(financeSnapshot()).toBe(beforeCancel);

    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-11b-signed',
        contractNumber: 'CTR-11B-S',
        clinicId: 'clinic-11b-a',
        tenant_id: TENANT_A,
        patientId: PATIENT_X,
        status: CONTRACT_STATUS.SIGNED,
        renderedHtml: '<p>S</p>',
        finalContent: '<p>S</p>',
        documentHash: 'hash-11b-s',
        version: 1,
        pdfUrl: 'data:application/pdf;base64,QQ==',
      }];
      db.contractSignatures = [
        { id: 'csig-11b-1', contractId: 'gctr-11b-signed', signerRole: 'PROFESSIONAL', evidenceJson: { hash: 'h1' } },
        { id: 'csig-11b-2', contractId: 'gctr-11b-signed', signerRole: 'PATIENT', evidenceJson: { hash: 'h2' } },
      ];
      return db;
    });
    const beforeVoid = financeSnapshot();
    voidSignedContract({ user: adminA, contractId: 'gctr-11b-signed', reason: 'erro material' });
    expect(financeSnapshot()).toBe(beforeVoid);
  });

  it('payment register still works after PATH A obligation hardening', () => {
    const budget = seedBudget(adminA, APPT_A1, buildPathABudget({ downPayment: 0, installments: 1 }));
    const result = approveClinicalBudgetWithFinance(adminA, {
      appointmentId: APPT_A1,
      patientId: PATIENT_X,
      patient: { id: PATIENT_X },
      budget,
    });
    const title = result.receivables[0];
    const { payment } = registerReceivablePayment(adminA, title.id, {
      amount_received: 50,
      payment_method: FINANCIAL_PAYMENT_METHOD.PIX,
      payment_date: '2026-08-31',
    });
    expect(payment?.id).toBeTruthy();
    expect(Number(loadDb().accountsReceivable.find((row) => row.id === title.id).received_amount)).toBeCloseTo(50);
  });
});
