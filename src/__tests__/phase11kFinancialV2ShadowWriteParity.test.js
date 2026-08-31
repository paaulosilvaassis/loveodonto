/**
 * PHASE 11.K — financial v2 shadow-write & parity.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { FINANCIAL_PAYMENT_METHOD } from '../services/auditEventCatalog.js';
import { cancelUnsignedContract } from '../services/contractLifecycleCommandService.js';
import { ensureContractsModuleSeeded } from '../services/contractModuleService.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  PHASE_11H_RUNTIME,
} from '../contracts/financialCoreV2PersistenceContract.js';
import {
  FINANCIAL_021_MIGRATION_FILE,
  PHASE_11J_RUNTIME,
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
} from '../contracts/financialV2RemoteSchemaContract.js';
import { PHASE_11I_RUNTIME } from '../services/financialV2Foundation.js';
import { toCents } from '../services/receivableMoney.js';
import {
  PHASE_11K_GATE,
  PHASE_11K_RUNTIME,
  SHADOW_WRITE_DECISION,
  __resetFinancialV2ShadowWriteForTest,
  __setFinancialV2ShadowStoreForTest,
  __setFinancialV2ShadowWriteForTest,
  assertShadowWriteEnvironmentAllowed,
  assertV3FlagsRemainOffForShadow,
  createMemoryFinancialV2Store,
  isFinancialV2ShadowWriteEnabled,
  runFinancialV2ShadowParity,
  shadowWriteFinancialRecord,
} from '../services/financialV2ShadowWrite.js';
import { compareFinancialShadow, SHADOW_REASON, SHADOW_RESULT } from '../services/financialV2ShadowComparator.js';
import {
  cancelReceivable,
  createReceivable,
  createReceivableCharge,
  getReceivablePayments,
  RECEIVABLE_ORIGIN_TYPE,
  RECEIVABLE_STATUS,
  registerReceivablePayment,
  reverseReceivablePayment,
} from '../services/receivablesService.js';
import { isEffectiveReceivablePayment } from '../services/receivableReconciliation.js';
import { approveFinancing, createFinancingProposal } from '../services/financingsService.js';
import { FINANCIAL_REPOSITORY_FLAG_DEFAULTS } from '../repositories/financial/financialRepositoryFlags.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const PATIENT_A = 'patient-11k-a';
const APPT_A = 'apt-11k-a';

const adminA = {
  id: 'user-11k-admin-a', role: 'admin', tenant_id: TENANT_A, tenantId: TENANT_A, name: 'Admin 11K A',
};
const adminB = {
  id: 'user-11k-admin-b', role: 'admin', tenant_id: TENANT_B, tenantId: TENANT_B, name: 'Admin 11K B',
};

function seed() {
  withDb((db) => {
    db.tenants = [
      { id: TENANT_A, name: 'Clinica 11K A', status: 'active' },
      { id: TENANT_B, name: 'Clinica 11K B', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-11k-a', tenant_id: TENANT_A, razaoSocial: 'Clinica 11K A' };
    db.patients = [
      { id: PATIENT_A, tenant_id: TENANT_A, full_name: 'Paciente 11K A' },
      { id: 'patient-11k-b', tenant_id: TENANT_B, full_name: 'Paciente 11K B' },
    ];
    db.appointments = [{
      id: APPT_A, tenant_id: TENANT_A, patientId: PATIENT_A, professionalId: 'prof-11k',
      date: '2026-08-31', status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
    }];
    db.accountsReceivable = [];
    db.receivablePayments = [];
    db.financings = [];
    db.receivableCharges = [];
    return db;
  });
}

function openReceivable(amount, extras = {}) {
  return createReceivable(adminA, {
    patient_id: PATIENT_A,
    description: extras.description || 'CR 11K',
    original_amount: amount,
    origin_type: extras.origin_type || RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY,
    due_date: extras.due_date || '2026-09-15',
    ...extras,
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

function financeSnapshot() {
  const db = loadDb();
  return JSON.stringify({
    accountsReceivable: db.accountsReceivable || [],
    receivablePayments: db.receivablePayments || [],
    financings: db.financings || [],
  });
}

function write(entityType, record, extras = {}) {
  return shadowWriteFinancialRecord({
    entityType,
    record,
    db: extras.db || loadDb(),
    store: extras.store,
    enabled: extras.enabled ?? true,
    projectRef: extras.projectRef,
  });
}

describe('PHASE 11.K financial v2 shadow-write parity', () => {
  beforeEach(async () => {
    localStorage.clear();
    __resetFinancialV2ShadowWriteForTest();
    await resetDb();
    await initDb();
    seed();
  });
  afterEach(() => {
    __resetFinancialV2ShadowWriteForTest();
  });

  it('T1 shadow write default OFF', () => {
    expect(PHASE_11K_RUNTIME.SHADOW_WRITE_DEFAULT).toBe(false);
    expect(isFinancialV2ShadowWriteEnabled()).toBe(false);
    expect(PHASE_11K_GATE).toBe('FINANCIAL_V2_SHADOW_WRITE_PARITY_VALIDATED');
  });

  it('T2 production project refused', () => {
    expect(() => assertShadowWriteEnvironmentAllowed(PRODUCTION_SUPABASE_PROJECT_REF))
      .toThrow(/PRODUCTION_FORBIDDEN/);
    expect(assertShadowWriteEnvironmentAllowed(STAGING_SUPABASE_PROJECT_REF)).toBe(true);
    const store = createMemoryFinancialV2Store();
    const title = openReceivable(40);
    expect(write('receivable', title, { store, projectRef: PRODUCTION_SUPABASE_PROJECT_REF }).decision)
      .toBe(SHADOW_WRITE_DECISION.SKIPPED_PRODUCTION_GUARD);
    expect(store.bags.receivables).toHaveLength(0);
  });

  it('T3 non-UUID tenant quarantined', () => {
    const store = createMemoryFinancialV2Store();
    const result = write('receivable', {
      id: 'recv-opaque', tenant_id: 'tenant-11k-opaque', patient_id: PATIENT_A,
      origin_type: 'manual_entry', net_amount: 10, original_amount: 10, status: 'upcoming',
    }, { store });
    expect(result.decision).toBe(SHADOW_WRITE_DECISION.QUARANTINED);
    expect(result.reason_code).toBe('TENANT_NOT_UUID');
    expect(store.bags.receivables).toHaveLength(0);
  });

  it('T4 unowned quarantined', () => {
    const store = createMemoryFinancialV2Store();
    const result = write('receivable', {
      id: 'recv-unowned', origin_type: 'manual_entry', net_amount: 10, original_amount: 10, status: 'upcoming',
    }, { store, db: { accountsReceivable: [], patients: [] } });
    expect(result.decision).toBe(SHADOW_WRITE_DECISION.QUARANTINED);
    expect(store.bags.receivables).toHaveLength(0);
  });

  it('T5 conflicted quarantined', () => {
    const store = createMemoryFinancialV2Store();
    const db = {
      patients: [{ id: PATIENT_A, tenant_id: TENANT_B }],
      accountsReceivable: [],
    };
    const result = write('receivable', {
      id: 'recv-conflict', tenant_id: TENANT_A, patient_id: PATIENT_A,
      origin_type: 'manual_entry', net_amount: 10, original_amount: 10, status: 'upcoming',
    }, { store, db });
    expect(result.decision).toBe(SHADOW_WRITE_DECISION.QUARANTINED);
    expect(store.bags.receivables).toHaveLength(0);
  });

  it('T6 eligible UUID written', () => {
    const store = createMemoryFinancialV2Store();
    const title = openReceivable(80);
    const result = write('receivable', title, { store });
    expect(result.decision).toBe(SHADOW_WRITE_DECISION.WRITTEN);
    expect(store.bags.receivables).toHaveLength(1);
  });

  it('T7 source_id preserved', () => {
    const store = createMemoryFinancialV2Store();
    const title = openReceivable(25);
    const result = write('receivable', title, { store });
    expect(result.mapped.source_id).toBe(title.id);
  });

  it('T8 money uses 11.G toCents', () => {
    const store = createMemoryFinancialV2Store();
    const title = openReceivable(10.1);
    const result = write('receivable', title, { store });
    expect(result.mapped.total_cents).toBe(toCents(10.1));
    expect(result.mapped.total_cents).toBe(1010);
  });

  it('T9 payment write depends on receivable', () => {
    const store = createMemoryFinancialV2Store();
    const title = openReceivable(50);
    const { payment } = pay(title.id, 50, 'op-11k-t9');
    const result = write('payment', payment, { store });
    expect(result.decision).toBe(SHADOW_WRITE_DECISION.WRITTEN);
    expect(store.bags.receivables).toHaveLength(1);
    expect(store.bags.payments[0].receivable_id).toBe(title.id);
  });

  it('T10 reversal preserves original fact', () => {
    const store = createMemoryFinancialV2Store();
    const title = openReceivable(50);
    const { payment } = pay(title.id, 50, 'op-11k-t10');
    const reversed = reverseReceivablePayment(adminA, payment.id, { reversal_reason: 'teste' });
    write('payment', reversed.payment, { store });
    const result = write('payment', reversed.reversal, { store });
    expect(result.decision).toBe(SHADOW_WRITE_DECISION.WRITTEN);
    expect(result.mapped.reverses_payment_id).toBe(payment.id);
    expect(store.get('payments', TENANT_A, payment.id)).toBeTruthy();
  });

  it('T11 charge does not create receivable', () => {
    const store = createMemoryFinancialV2Store();
    const title = openReceivable(30);
    write('receivable', title, { store });
    const charge = createReceivableCharge(adminA, { receivable_id: title.id, operation_id: 'op-11k-chg' });
    const before = store.bags.receivables.length;
    const result = write('charge', charge, { store });
    expect(result.decision).toBe(SHADOW_WRITE_DECISION.WRITTEN);
    expect(result.mapped.creates_receivable).toBe(false);
    expect(store.bags.receivables).toHaveLength(before);
  });

  it('T12 financing write', () => {
    const store = createMemoryFinancialV2Store();
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A, description: 'Fin 11K', total_amount: 400, entry_amount: 0,
      installments_count: 2, installment_frequency: 'monthly', first_due_date: '2026-09-10',
      issue_date: '2026-08-31', boleto_auto_generate: false, requires_credit_analysis: false,
    });
    const result = write('financing', proposal, { store });
    expect(result.decision).toBe(SHADOW_WRITE_DECISION.WRITTEN);
    expect(result.mapped.source_id).toBe(proposal.id);
    expect(result.mapped.total_cents).toBe(toCents(proposal.total_amount));
  });

  it('T13 idempotent replay', () => {
    const store = createMemoryFinancialV2Store();
    const title = openReceivable(20);
    expect(write('receivable', title, { store }).decision).toBe(SHADOW_WRITE_DECISION.WRITTEN);
    expect(write('receivable', title, { store }).decision).toBe(SHADOW_WRITE_DECISION.REPLAYED);
    expect(store.bags.receivables).toHaveLength(1);
  });

  it('T14 store failure does not mutate IDB', () => {
    const title = openReceivable(15);
    const before = financeSnapshot();
    const broken = { upsert() { throw new Error('store down'); }, get() { return null; } };
    const result = write('receivable', title, { store: broken });
    expect(result.decision).toBe(SHADOW_WRITE_DECISION.FAILED);
    expect(financeSnapshot()).toBe(before);
  });

  it('T15 flag off skips write', () => {
    const store = createMemoryFinancialV2Store();
    const title = openReceivable(12);
    expect(write('receivable', title, { store, enabled: false }).decision)
      .toBe(SHADOW_WRITE_DECISION.SKIPPED_FLAG_OFF);
    expect(store.bags.receivables).toHaveLength(0);
  });

  it('T16 shadow compare MATCH after write', () => {
    const store = createMemoryFinancialV2Store();
    const title = openReceivable(44);
    const result = write('receivable', title, { store });
    expect(result.comparison.result).toBe(SHADOW_RESULT.MATCH);
  });

  it('T17 money mismatch detected after tamper', () => {
    const store = createMemoryFinancialV2Store();
    const title = openReceivable(44);
    const result = write('receivable', title, { store });
    result.mapped.total_cents = 1;
    expect(compareFinancialShadow({
      entityType: 'receivable', legacy: title, v2: result.mapped, eligibility: result.eligibility,
    }).reason_code).toBe(SHADOW_REASON.MONEY_MISMATCH);
  });

  it('T18 writer hook is no-op when flag off', async () => {
    const store = createMemoryFinancialV2Store();
    __setFinancialV2ShadowStoreForTest(store);
    openReceivable(18);
    await new Promise((resolve) => queueMicrotask(resolve));
    expect(store.bags.receivables).toHaveLength(0);
  });

  it('T19 writer hook shadows when explicitly enabled', async () => {
    const store = createMemoryFinancialV2Store();
    __setFinancialV2ShadowStoreForTest(store);
    __setFinancialV2ShadowWriteForTest(true);
    const title = openReceivable(22);
    await new Promise((resolve) => queueMicrotask(resolve));
    expect(store.get('receivables', TENANT_A, title.id)?.source_id).toBe(title.id);
  });

  it('T20 V3 flags remain OFF', () => {
    expect(assertV3FlagsRemainOffForShadow()).toBe(true);
    expect(FINANCIAL_REPOSITORY_FLAG_DEFAULTS.FINANCIAL_SHADOW).toBe(false);
    expect(FINANCIAL_REPOSITORY_FLAG_DEFAULTS.FINANCIAL_DUAL_WRITE).toBe(false);
  });

  it('T21 no dual write / server write', () => {
    expect(PHASE_11K_RUNTIME.DUAL_WRITE_ENABLED).toBe(false);
    expect(PHASE_11K_RUNTIME.FINANCIAL_SERVER_WRITE_ENABLED).toBe(false);
    expect(PHASE_11K_RUNTIME.FINANCIAL_SERVER_READ_ENABLED).toBe(false);
  });

  it('T22 no tenant cutover', () => {
    expect(PHASE_11K_RUNTIME.TENANT_CUTOVER).toBe(false);
  });

  it('T23 no remote staging write in this phase runtime', () => {
    expect(PHASE_11K_RUNTIME.REMOTE_STAGING_WRITE).toBe(false);
    expect(PHASE_11K_RUNTIME.PRODUCTION_DATABASE_CHANGED).toBe(false);
  });

  it('T24 021 remains untouched', () => {
    const sql021 = readFileSync(join(ROOT, FINANCIAL_021_MIGRATION_FILE), 'utf8');
    expect(sql021).toMatch(/numeric\(14, 2\)/);
    expect(sql021).toMatch(/default 'open'/);
  });

  it('T25 PHASE 11.B receivable creation still idempotent', () => {
    const first = openReceivable(150, { origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN, origin_id: 'budget-11k-1', installment_number: 1 });
    const second = openReceivable(150, { origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN, origin_id: 'budget-11k-1', installment_number: 1 });
    expect(second.id).toBe(first.id);
  });

  it('T26 PHASE 11.C payment idempotency still holds', () => {
    const title = openReceivable(400);
    pay(title.id, 400, 'op-11k-t26');
    expect(pay(title.id, 400, 'op-11k-t26').replayed).toBe(true);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
  });

  it('T27 PHASE 11.D unpaid cancel still holds', () => {
    expect(cancelReceivable(adminA, openReceivable(90).id, 'ok').status).toBe(RECEIVABLE_STATUS.CANCELED);
  });

  it('T28 PHASE 11.E financing tenant still holds', () => {
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A, description: 'Fin 11K T28', total_amount: 600, entry_amount: 0,
      installments_count: 2, installment_frequency: 'monthly', first_due_date: '2026-09-10',
      issue_date: '2026-08-31', boleto_auto_generate: false, requires_credit_analysis: false,
    });
    expect(() => approveFinancing(adminB, proposal.id)).toThrow(/outra clínica|TENANT_MISMATCH/i);
  });

  it('T29 PHASE 11.F charge still does not create obligation', () => {
    const title = openReceivable(120);
    const before = (loadDb().accountsReceivable || []).length;
    createReceivableCharge(adminA, { receivable_id: title.id, operation_id: 'op-11k-t29' });
    expect((loadDb().accountsReceivable || []).length).toBe(before);
  });

  it('T30 PHASE 11.G cents conversion still holds', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it('T31 PHASE 11.H readiness still not cutover', () => {
    expect(PHASE_11H_RUNTIME.DUAL_WRITE_ENABLED).toBe(false);
    expect(PHASE_11H_RUNTIME.SUPABASE_CUTOVER).toBe(false);
  });

  it('T32 PHASE 11.I shadow write remains off in 11.I runtime', () => {
    expect(PHASE_11I_RUNTIME.SHADOW_WRITE_ENABLED).toBe(false);
    expect(existsSync(join(ROOT, 'src/services/financialV2Mapper.js'))).toBe(true);
  });

  it('T33 PHASE 11.J schema remains validated without app writers', () => {
    expect(PHASE_11J_RUNTIME.FINANCIAL_V2_SCHEMA_APPLIED).toBe(true);
    expect(PHASE_11J_RUNTIME.SHADOW_WRITE_ENABLED).toBe(false);
    expect(PHASE_11J_RUNTIME.PRODUCTION_DATABASE_CHANGED).toBe(false);
  });

  it('T34 contract lifecycle has no automatic financial side-effects', () => {
    ensureContractsModuleSeeded();
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-11k-1', contractNumber: 'CTR-11K-1', clinicId: 'clinic-11k-a',
        tenant_id: TENANT_A, patientId: PATIENT_A, status: CONTRACT_STATUS.GENERATED,
        renderedHtml: '<p>11K</p>', finalContent: '<p>11K</p>', documentHash: 'hash-11k', version: 1,
      }];
      return db;
    });
    const before = financeSnapshot();
    cancelUnsignedContract({ user: adminA, contractId: 'gctr-11k-1', reason: 'desistencia' });
    expect(financeSnapshot()).toBe(before);
  });

  it('T35 no backfill / no production scan', () => {
    expect(PHASE_11K_RUNTIME.BACKFILL_APPLIED).toBe(false);
    expect(PHASE_11K_RUNTIME.HISTORICAL_PRODUCTION_SCAN).toBe(false);
  });

  it('T36 parity stats deterministic', () => {
    const title = openReceivable(33);
    const db = loadDb();
    const a = runFinancialV2ShadowParity(db);
    const b = runFinancialV2ShadowParity(db);
    expect(a.stats).toEqual(b.stats);
    expect(a.stats.WRITTEN).toBeGreaterThanOrEqual(1);
    expect(a.stats.MATCH).toBe(a.stats.WRITTEN);
    expect(title.id).toBeTruthy();
  });
});
