/**
 * PHASE 11.M — controlled app writer → V2 runtime shadow (staging).
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
import { PHASE_11H_RUNTIME } from '../contracts/financialCoreV2PersistenceContract.js';
import {
  FINANCIAL_021_MIGRATION_FILE,
  PHASE_11J_RUNTIME,
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
} from '../contracts/financialV2RemoteSchemaContract.js';
import { PHASE_11I_RUNTIME } from '../services/financialV2Foundation.js';
import { PHASE_11K_RUNTIME } from '../services/financialV2ShadowWrite.js';
import { PHASE_11L_RUNTIME } from '../services/financialV2StagingShadowPersist.js';
import { toCents } from '../services/receivableMoney.js';
import {
  FINANCIAL_V2_RUNTIME_SHADOW_FLAG,
  PHASE_11M_GATE,
  PHASE_11M_RUNTIME,
  PHASE_11M_TENANT_A,
  RUNTIME_SHADOW_RESULT,
  __flushFinancialV2RuntimeShadowForTest,
  __getFinancialV2RuntimeStoreForTest,
  __resetFinancialV2RuntimeShadowForTest,
  __setFinancialV2RuntimeShadowForTest,
  assertRuntimeShadowEnvironmentAllowed,
  assertV3FlagsRemainOffForRuntimeShadow,
  createTenantScopedRuntimeExecutor,
  getRuntimeShadowCounters,
  getRuntimeShadowTelemetry,
  isFinancialV2RuntimeShadowEnabled,
  parseFinancialV2ShadowAllowlist,
  resolveRuntimeShadowDecision,
} from '../services/financialV2RuntimeShadow.js';
import {
  PHASE_11M_TENANT_B,
} from '../services/financialV2Phase11mFixtures.js';
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
const SNAPSHOT_PATH = join(ROOT, 'docs/reports/PHASE_11M_STAGING_RUNTIME_READBACK.json');
const PATIENT_A = 'phase11m-patient-a';
const APPT_A = 'phase11m-apt-a';

const adminA = {
  id: 'user-11m-admin-a', role: 'admin', tenant_id: PHASE_11M_TENANT_A, tenantId: PHASE_11M_TENANT_A, name: 'Admin 11M A',
};
const adminB = {
  id: 'user-11m-admin-b', role: 'admin', tenant_id: PHASE_11M_TENANT_B, tenantId: PHASE_11M_TENANT_B, name: 'Admin 11M B',
};

function readSnapshot() {
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
}

function seed() {
  withDb((db) => {
    db.tenants = [
      { id: PHASE_11M_TENANT_A, name: 'phase11m-clinic-a', status: 'active' },
      { id: PHASE_11M_TENANT_B, name: 'phase11m-clinic-b', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-11m-a', tenant_id: PHASE_11M_TENANT_A, razaoSocial: 'phase11m-clinic-a' };
    db.patients = [
      { id: PATIENT_A, tenant_id: PHASE_11M_TENANT_A, full_name: 'Paciente 11M A' },
      { id: 'phase11m-patient-b', tenant_id: PHASE_11M_TENANT_B, full_name: 'Paciente 11M B' },
    ];
    db.appointments = [{
      id: APPT_A, tenant_id: PHASE_11M_TENANT_A, patientId: PATIENT_A, professionalId: 'prof-11m',
      date: '2026-08-31', status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
    }];
    db.accountsReceivable = [];
    db.receivablePayments = [];
    db.financings = [];
    db.receivableCharges = [];
    return db;
  });
}

function enableRuntime(extras = {}) {
  const store = extras.store;
  __setFinancialV2RuntimeShadowForTest({
    enabled: extras.enabled ?? true,
    allowlist: extras.allowlist ?? [PHASE_11M_TENANT_A],
    projectRef: extras.projectRef ?? STAGING_SUPABASE_PROJECT_REF,
    executor: extras.executor ?? createTenantScopedRuntimeExecutor({ bags: extras.bags }),
  });
  return store || __getFinancialV2RuntimeStoreForTest();
}

async function flushShadow() {
  await new Promise((resolve) => queueMicrotask(resolve));
  await __flushFinancialV2RuntimeShadowForTest();
}

function openPathA(amount = 80, extras = {}) {
  return createReceivable(adminA, {
    patient_id: PATIENT_A,
    description: extras.description || 'phase11m path-a',
    original_amount: amount,
    origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN,
    origin_id: extras.origin_id || 'phase11m-budget-a',
    installment_number: extras.installment_number || 1,
    due_date: extras.due_date || '2026-09-15',
    ...extras,
  });
}

function pay(receivableId, amount, operationId) {
  return registerReceivablePayment(adminA, receivableId, {
    payment_date: '2026-08-31',
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

function lastTelemetry(entityType) {
  return getRuntimeShadowTelemetry().filter((row) => row.entity_type === entityType).at(-1);
}

describe('PHASE 11.M controlled app writer shadow wiring', () => {
  beforeEach(async () => {
    localStorage.clear();
    __resetFinancialV2RuntimeShadowForTest();
    await resetDb();
    await initDb();
    seed();
  });
  afterEach(() => {
    __resetFinancialV2RuntimeShadowForTest();
  });

  it('T1 baseline correct', () => {
    expect(PHASE_11M_GATE).toBe('FINANCIAL_V2_APP_WRITER_SHADOW_WIRING_VALIDATED');
    expect(PHASE_11M_RUNTIME.TARGET_DB_ENVIRONMENT).toBe('STAGING');
    expect(PHASE_11M_RUNTIME.SHADOW_NON_AUTHORITATIVE).toBe(true);
  });

  it('T2 staging target accepted', () => {
    expect(assertRuntimeShadowEnvironmentAllowed(STAGING_SUPABASE_PROJECT_REF)).toBe(true);
  });

  it('T3 production target blocked', () => {
    expect(() => assertRuntimeShadowEnvironmentAllowed(PRODUCTION_SUPABASE_PROJECT_REF))
      .toThrow(/PRODUCTION_FORBIDDEN/);
    expect(resolveRuntimeShadowDecision({
      record: { id: 'x', tenant_id: PHASE_11M_TENANT_A },
      enabled: true,
      allowlist: [PHASE_11M_TENANT_A],
      projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
    }).reason_code).toBe('PRODUCTION_FORBIDDEN');
  });

  it('T4 unknown target blocked', () => {
    expect(() => assertRuntimeShadowEnvironmentAllowed('other-ref')).toThrow(/UNKNOWN_TARGET/);
    expect(resolveRuntimeShadowDecision({
      record: { id: 'x', tenant_id: PHASE_11M_TENANT_A },
      enabled: true,
      allowlist: [PHASE_11M_TENANT_A],
      projectRef: 'other-ref',
    }).reason_code).toBe('UNKNOWN_TARGET');
  });

  it('T5 V2 runtime flag default OFF', () => {
    expect(PHASE_11M_RUNTIME.V2_RUNTIME_SHADOW_DEFAULT).toBe(false);
    expect(isFinancialV2RuntimeShadowEnabled()).toBe(false);
    expect(FINANCIAL_V2_RUNTIME_SHADOW_FLAG).toBe('FINANCIAL_V2_RUNTIME_SHADOW');
    expect(FINANCIAL_REPOSITORY_FLAG_DEFAULTS.FINANCIAL_SHADOW).toBe(false);
  });

  it('T6 allowlist missing => disabled', () => {
    expect(resolveRuntimeShadowDecision({
      record: { id: 'x', tenant_id: PHASE_11M_TENANT_A },
      enabled: true,
      allowlist: [],
      projectRef: STAGING_SUPABASE_PROJECT_REF,
    }).reason_code).toBe('ALLOWLIST_MISSING');
    expect(parseFinancialV2ShadowAllowlist(null)).toEqual([]);
  });

  it('T7 tenant not allowlisted => disabled', () => {
    expect(resolveRuntimeShadowDecision({
      record: { id: 'x', tenant_id: PHASE_11M_TENANT_B },
      enabled: true,
      allowlist: [PHASE_11M_TENANT_A],
      projectRef: STAGING_SUPABASE_PROJECT_REF,
    }).reason_code).toBe('ALLOWLIST_DENIED');
  });

  it('T8 allowlisted tenant accepted', () => {
    expect(resolveRuntimeShadowDecision({
      record: { id: 'x', tenant_id: PHASE_11M_TENANT_A },
      enabled: true,
      allowlist: [PHASE_11M_TENANT_A],
      projectRef: STAGING_SUPABASE_PROJECT_REF,
    }).result).toBe('ALLOWED');
  });

  it('T9 non-UUID tenant quarantined', () => {
    expect(resolveRuntimeShadowDecision({
      record: { id: 'x', tenant_id: 'tenant-opaque' },
      enabled: true,
      allowlist: ['tenant-opaque'],
      projectRef: STAGING_SUPABASE_PROJECT_REF,
    }).reason_code).toBe('TENANT_NOT_UUID');
  });

  it('T10 writer PATH A legacy success', async () => {
    enableRuntime();
    const title = openPathA(90);
    expect(title.id).toMatch(/^recv-/);
    expect(title.origin_type).toBe(RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN);
    expect(loadDb().accountsReceivable).toHaveLength(1);
  });

  it('T11 writer PATH A triggers shadow', async () => {
    enableRuntime();
    const title = openPathA(90);
    await flushShadow();
    expect(lastTelemetry('receivable').source_id).toBe(title.id);
    expect(lastTelemetry('receivable').result).toBe(RUNTIME_SHADOW_RESULT.MATCH);
  });

  it('T12 PATH A read-back MATCH', async () => {
    const store = enableRuntime();
    const title = openPathA(99.99);
    await flushShadow();
    expect(store.get('receivables', PHASE_11M_TENANT_A, title.id).total_cents).toBe(toCents(99.99));
    expect(lastTelemetry('receivable').result).toBe(RUNTIME_SHADOW_RESULT.MATCH);
  });

  it('T13 PATH A retry no duplicate', async () => {
    enableRuntime();
    const first = openPathA(80, { origin_id: 'phase11m-budget-retry' });
    const second = openPathA(80, { origin_id: 'phase11m-budget-retry' });
    await flushShadow();
    expect(second.id).toBe(first.id);
    expect(loadDb().accountsReceivable).toHaveLength(1);
    expect(__getFinancialV2RuntimeStoreForTest().bags.receivables).toHaveLength(1);
  });

  it('T14 financing writer legacy success', async () => {
    enableRuntime();
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A, description: 'phase11m financing', total_amount: 400, entry_amount: 0,
      installments_count: 2, installment_frequency: 'monthly', first_due_date: '2026-09-10',
      issue_date: '2026-08-31', boleto_auto_generate: false, requires_credit_analysis: false,
    });
    expect(proposal.id).toBeTruthy();
    expect(loadDb().financings).toHaveLength(1);
  });

  it('T15 financing shadow MATCH', async () => {
    enableRuntime();
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A, description: 'phase11m financing match', total_amount: 400, entry_amount: 0,
      installments_count: 2, installment_frequency: 'monthly', first_due_date: '2026-09-10',
      issue_date: '2026-08-31', boleto_auto_generate: false, requires_credit_analysis: false,
    });
    await flushShadow();
    expect(lastTelemetry('financing').source_id).toBe(proposal.id);
    expect(lastTelemetry('financing').result).toBe(RUNTIME_SHADOW_RESULT.MATCH);
  });

  it('T16 financing approval legacy success', async () => {
    enableRuntime();
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A, description: 'phase11m financing approve', total_amount: 400, entry_amount: 0,
      installments_count: 2, installment_frequency: 'monthly', first_due_date: '2026-09-10',
      issue_date: '2026-08-31', boleto_auto_generate: false, requires_credit_analysis: false,
    });
    approveFinancing(adminA, proposal.id);
    const recvs = (loadDb().accountsReceivable || []).filter((row) => row.origin_type === 'financing');
    expect(recvs.length).toBeGreaterThanOrEqual(2);
    expect(getFinancingStatus(proposal.id)).toBeTruthy();
  });

  it('T17 PATH B receivable shadows MATCH', async () => {
    enableRuntime();
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A, description: 'phase11m financing pathb', total_amount: 400, entry_amount: 0,
      installments_count: 2, installment_frequency: 'monthly', first_due_date: '2026-09-10',
      issue_date: '2026-08-31', boleto_auto_generate: false, requires_credit_analysis: false,
    });
    approveFinancing(adminA, proposal.id);
    await flushShadow();
    const pathB = (loadDb().accountsReceivable || []).filter((row) => row.origin_type === 'financing');
    expect(pathB.length).toBeGreaterThanOrEqual(2);
    const recvLogs = getRuntimeShadowTelemetry().filter((row) => (
      row.entity_type === 'receivable' && pathB.some((item) => item.id === row.source_id)
    ));
    expect(recvLogs.every((row) => row.result === RUNTIME_SHADOW_RESULT.MATCH)).toBe(true);
    expect(lastTelemetry('financing').result).toBe(RUNTIME_SHADOW_RESULT.MATCH);
  });

  it('T18 PATH A/B identities separate', async () => {
    enableRuntime();
    const pathA = openPathA(50, { origin_id: 'phase11m-budget-sep' });
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A, description: 'phase11m financing sep', total_amount: 300, entry_amount: 0,
      installments_count: 2, installment_frequency: 'monthly', first_due_date: '2026-09-10',
      issue_date: '2026-08-31', boleto_auto_generate: false, requires_credit_analysis: false,
    });
    approveFinancing(adminA, proposal.id);
    const pathB = (loadDb().accountsReceivable || []).filter((row) => row.origin_type === 'financing');
    expect(pathA.origin_type).toBe('treatment_plan');
    expect(pathB.every((row) => row.origin_type === 'financing')).toBe(true);
    expect(pathB.every((row) => row.id !== pathA.id)).toBe(true);
  });

  it('T19 payment writer legacy success', async () => {
    enableRuntime();
    const title = openPathA(50, { origin_id: 'phase11m-budget-pay' });
    const { payment } = pay(title.id, 50, 'phase11m-op-pay');
    expect(payment.id).toBeTruthy();
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
  });

  it('T20 payment shadow MATCH', async () => {
    enableRuntime();
    const title = openPathA(50, { origin_id: 'phase11m-budget-pay2' });
    const { payment } = pay(title.id, 50, 'phase11m-op-pay2');
    await flushShadow();
    expect(lastTelemetry('payment').source_id).toBe(payment.id);
    expect(lastTelemetry('payment').result).toBe(RUNTIME_SHADOW_RESULT.MATCH);
  });

  it('T21 payment operation retry idempotent', async () => {
    enableRuntime();
    const title = openPathA(50, { origin_id: 'phase11m-budget-pay3' });
    pay(title.id, 50, 'phase11m-op-pay3');
    expect(pay(title.id, 50, 'phase11m-op-pay3').replayed).toBe(true);
    await flushShadow();
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
    expect(__getFinancialV2RuntimeStoreForTest().bags.payments.filter((row) => row.kind === 'payment')).toHaveLength(1);
  });

  it('T22 remote immutable payment conflict no overwrite', async () => {
    enableRuntime();
    const title = openPathA(50, { origin_id: 'phase11m-budget-pay4' });
    const { payment } = pay(title.id, 50, 'phase11m-op-pay4');
    await flushShadow();
    const store = __getFinancialV2RuntimeStoreForTest();
    store.get('payments', PHASE_11M_TENANT_A, payment.id).amount_cents = 1;
    pay(title.id, 50, 'phase11m-op-pay4');
    await flushShadow();
    expect(store.get('payments', PHASE_11M_TENANT_A, payment.id).amount_cents).toBe(1);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
    expect(lastTelemetry('payment').reason_code).toBe('IMMUTABLE_FACT_CONFLICT');
  });

  it('T23 reversal writer legacy success', async () => {
    enableRuntime();
    const title = openPathA(50, { origin_id: 'phase11m-budget-rev' });
    const { payment } = pay(title.id, 50, 'phase11m-op-rev');
    const reversed = reverseReceivablePayment(adminA, payment.id, { reversal_reason: 'phase11m' });
    expect(reversed.reversal.reverses_payment_id).toBe(payment.id);
    expect(getReceivablePayments(title.id).some((row) => row.id === payment.id)).toBe(true);
  });

  it('T24 original payment preserved', async () => {
    enableRuntime();
    const title = openPathA(50, { origin_id: 'phase11m-budget-rev2' });
    const { payment } = pay(title.id, 50, 'phase11m-op-rev2');
    reverseReceivablePayment(adminA, payment.id, { reversal_reason: 'phase11m' });
    await flushShadow();
    expect(__getFinancialV2RuntimeStoreForTest().get('payments', PHASE_11M_TENANT_A, payment.id)).toBeTruthy();
  });

  it('T25 reversal remote MATCH', async () => {
    enableRuntime();
    const title = openPathA(50, { origin_id: 'phase11m-budget-rev3' });
    const { payment } = pay(title.id, 50, 'phase11m-op-rev3');
    const reversed = reverseReceivablePayment(adminA, payment.id, { reversal_reason: 'phase11m' });
    await flushShadow();
    const revLog = getRuntimeShadowTelemetry().find((row) => row.source_id === reversed.reversal.id);
    expect(revLog.result).toBe(RUNTIME_SHADOW_RESULT.MATCH);
  });

  it('T26 reversal missing dependency not fabricated', async () => {
    enableRuntime();
    const title = openPathA(50, { origin_id: 'phase11m-budget-rev4' });
    const { payment } = pay(title.id, 50, 'phase11m-op-rev4');
    await flushShadow();
    const store = __getFinancialV2RuntimeStoreForTest();
    store.bags.payments.length = 0;
    const before = financeSnapshot();
    reverseReceivablePayment(adminA, payment.id, { reversal_reason: 'phase11m' });
    expect(financeSnapshot()).not.toBe(before);
    await flushShadow();
    expect(getRuntimeShadowTelemetry().some((row) => row.reason_code === 'WRITE_FAILED_WITH_DEPENDENCY')).toBe(true);
    expect(store.bags.payments.filter((row) => row.kind === 'payment')).toHaveLength(0);
  });

  it('T27 charge writer legacy success', async () => {
    enableRuntime();
    const title = openPathA(40, { origin_id: 'phase11m-budget-chg' });
    const charge = createReceivableCharge(adminA, { receivable_id: title.id, operation_id: 'phase11m-op-chg' });
    expect(charge.id).toBeTruthy();
  });

  it('T28 charge shadow MATCH', async () => {
    enableRuntime();
    const title = openPathA(40, { origin_id: 'phase11m-budget-chg2' });
    const charge = createReceivableCharge(adminA, { receivable_id: title.id, operation_id: 'phase11m-op-chg2' });
    await flushShadow();
    expect(lastTelemetry('charge').source_id).toBe(charge.id);
    expect(lastTelemetry('charge').result).toBe(RUNTIME_SHADOW_RESULT.MATCH);
  });

  it('T29 charge does not create receivable', async () => {
    enableRuntime();
    const title = openPathA(40, { origin_id: 'phase11m-budget-chg3' });
    const before = (loadDb().accountsReceivable || []).length;
    createReceivableCharge(adminA, { receivable_id: title.id, operation_id: 'phase11m-op-chg3' });
    expect((loadDb().accountsReceivable || []).length).toBe(before);
    await flushShadow();
    expect(lastTelemetry('charge').result).toBe(RUNTIME_SHADOW_RESULT.MATCH);
  });

  it('T30 shadow network failure does not fail legacy writer', async () => {
    enableRuntime({
      executor: async () => { throw new Error('network'); },
    });
    const title = openPathA(30, { origin_id: 'phase11m-budget-net' });
    expect(title.id).toBeTruthy();
    await flushShadow();
    expect(loadDb().accountsReceivable).toHaveLength(1);
    expect(lastTelemetry('receivable').result).toBe(RUNTIME_SHADOW_RESULT.WRITE_FAILED);
  });

  it('T31 shadow RLS failure does not fail legacy writer', async () => {
    enableRuntime({
      executor: async () => { throw new Error('RLS'); },
    });
    const title = openPathA(30, { origin_id: 'phase11m-budget-rls' });
    expect(title.id).toBeTruthy();
    await flushShadow();
    expect(lastTelemetry('receivable').reason_code).toBe('RLS');
  });

  it('T32 shadow constraint failure does not fail legacy writer', async () => {
    enableRuntime({
      executor: async () => { throw new Error('constraint'); },
    });
    const title = openPathA(30, { origin_id: 'phase11m-budget-con' });
    expect(title.id).toBeTruthy();
    await flushShadow();
    expect(lastTelemetry('receivable').reason_code).toBe('constraint');
  });

  it('T33 comparator mismatch does not fail legacy writer', async () => {
    enableRuntime({
      executor: async (sql) => {
        const bags = __getFinancialV2RuntimeStoreForTest();
        const rows = await createTenantScopedRuntimeExecutor({ bags })(sql);
        if (String(sql).includes('SELECT') && rows[0]) {
          return [{ ...rows[0], total_cents: 1 }];
        }
        return rows;
      },
    });
    const title = openPathA(30, { origin_id: 'phase11m-budget-mm' });
    expect(title.id).toBeTruthy();
    await flushShadow();
    expect(loadDb().accountsReceivable).toHaveLength(1);
    expect(lastTelemetry('receivable').result).toBe(RUNTIME_SHADOW_RESULT.MISMATCH);
  });

  it('T34 kill switch ON works', async () => {
    enableRuntime({ enabled: true });
    openPathA(20, { origin_id: 'phase11m-budget-ks-on' });
    await flushShadow();
    expect(lastTelemetry('receivable').result).toBe(RUNTIME_SHADOW_RESULT.MATCH);
  });

  it('T35 kill switch OFF works', async () => {
    enableRuntime({ enabled: true });
    openPathA(20, { origin_id: 'phase11m-budget-ks-1' });
    await flushShadow();
    __setFinancialV2RuntimeShadowForTest({
      enabled: false,
      allowlist: [PHASE_11M_TENANT_A],
      projectRef: STAGING_SUPABASE_PROJECT_REF,
      executor: createTenantScopedRuntimeExecutor(),
    });
    const before = getRuntimeShadowTelemetry().length;
    openPathA(21, { origin_id: 'phase11m-budget-ks-off' });
    await flushShadow();
    expect(getRuntimeShadowTelemetry().length).toBe(before);
  });

  it('T36 telemetry no PII', async () => {
    enableRuntime();
    openPathA(15, { origin_id: 'phase11m-budget-pii' });
    await flushShadow();
    const blob = JSON.stringify(getRuntimeShadowTelemetry());
    expect(blob).not.toMatch(/Paciente|cpf|telefone|email|@/i);
    expect(Object.keys(getRuntimeShadowTelemetry()[0]).sort()).toEqual([
      'duration_ms', 'entity_type', 'operation', 'reason_code', 'result', 'source_id', 'tenant_id', 'timestamp',
    ]);
  });

  it('T37 counters deterministic', async () => {
    enableRuntime();
    openPathA(12, { origin_id: 'phase11m-budget-c1' });
    openPathA(13, { origin_id: 'phase11m-budget-c2' });
    await flushShadow();
    const a = getRuntimeShadowCounters();
    expect(a.receivable.match).toBe(2);
    expect(a.receivable.attempted).toBe(2);
  });

  it('T38 server read remains OFF', () => {
    expect(PHASE_11M_RUNTIME.FINANCIAL_SERVER_READ_ENABLED).toBe(false);
  });

  it('T39 server write authority remains NO', () => {
    expect(PHASE_11M_RUNTIME.FINANCIAL_SERVER_WRITE_AUTHORITY).toBe(false);
    expect(PHASE_11M_RUNTIME.FINANCIAL_SERVER_WRITE_ENABLED).toBe(false);
  });

  it('T40 dual-write remains NO', () => {
    expect(PHASE_11M_RUNTIME.DUAL_WRITE_ENABLED).toBe(false);
    expect(PHASE_11M_RUNTIME.SHADOW_NON_AUTHORITATIVE).toBe(true);
  });

  it('T41 IndexedDB remains SSOT', async () => {
    enableRuntime({ executor: async () => { throw new Error('down'); } });
    const before = financeSnapshot();
    openPathA(18, { origin_id: 'phase11m-budget-ssot' });
    expect(financeSnapshot()).not.toBe(before);
    expect((loadDb().accountsReceivable || []).length).toBe(1);
  });

  it('T42 historical scan NO', () => {
    expect(PHASE_11M_RUNTIME.HISTORICAL_SHADOW_SCAN).toBe(false);
  });

  it('T43 backfill NO', () => {
    expect(PHASE_11M_RUNTIME.BACKFILL_APPLIED).toBe(false);
  });

  it('T44 tenant cutover NO', () => {
    expect(PHASE_11M_RUNTIME.TENANT_CUTOVER).toBe(false);
  });

  it('T45 production unchanged', () => {
    expect(PHASE_11M_RUNTIME.PRODUCTION_DATABASE_CHANGED).toBe(false);
    expect(PHASE_11K_RUNTIME.PRODUCTION_DATABASE_CHANGED).toBe(false);
    expect(PHASE_11L_RUNTIME.PRODUCTION_DATABASE_CHANGED).toBe(false);
  });

  it('T46 cleanup complete', () => {
    expect(existsSync(SNAPSHOT_PATH)).toBe(true);
    const snap = readSnapshot();
    expect(snap.cleanupComplete).toBe(true);
    expect(snap.leftoverCounts).toEqual({
      receivables: 0, payments: 0, financings: 0, charges: 0, tenants: 0, tenant_users: 0,
    });
    expect(snap.productionRefTouched).toBe(false);
  });

  it('T47 PHASE 11.B receivable creation still idempotent', () => {
    const first = openPathA(150, { origin_id: 'budget-11m-1' });
    const second = openPathA(150, { origin_id: 'budget-11m-1' });
    expect(second.id).toBe(first.id);
  });

  it('T48 PHASE 11.C payment idempotency still holds', () => {
    const title = openPathA(400, { origin_id: 'budget-11m-c' });
    pay(title.id, 400, 'op-11m-t48');
    expect(pay(title.id, 400, 'op-11m-t48').replayed).toBe(true);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
  });

  it('T49 PHASE 11.D unpaid cancel still holds', () => {
    expect(cancelReceivable(adminA, openPathA(90, { origin_id: 'budget-11m-d' }).id, 'ok').status)
      .toBe(RECEIVABLE_STATUS.CANCELED);
  });

  it('T50 PHASE 11.E financing tenant still holds', () => {
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A, description: 'Fin 11M T50', total_amount: 600, entry_amount: 0,
      installments_count: 2, installment_frequency: 'monthly', first_due_date: '2026-09-10',
      issue_date: '2026-08-31', boleto_auto_generate: false, requires_credit_analysis: false,
    });
    expect(() => approveFinancing(adminB, proposal.id)).toThrow(/outra clínica|TENANT_MISMATCH/i);
  });

  it('T51 PHASE 11.F charge still does not create obligation', () => {
    const title = openPathA(120, { origin_id: 'budget-11m-f' });
    const before = (loadDb().accountsReceivable || []).length;
    createReceivableCharge(adminA, { receivable_id: title.id, operation_id: 'op-11m-t51' });
    expect((loadDb().accountsReceivable || []).length).toBe(before);
  });

  it('T52 PHASE 11.G cents conversion still holds', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it('T53 PHASE 11.H readiness still not cutover', () => {
    expect(PHASE_11H_RUNTIME.DUAL_WRITE_ENABLED).toBe(false);
    expect(PHASE_11H_RUNTIME.SUPABASE_CUTOVER).toBe(false);
  });

  it('T54 PHASE 11.I shadow write remains off in 11.I runtime', () => {
    expect(PHASE_11I_RUNTIME.SHADOW_WRITE_ENABLED).toBe(false);
  });

  it('T55 PHASE 11.J schema remains validated without app writers as authority', () => {
    expect(PHASE_11J_RUNTIME.FINANCIAL_V2_SCHEMA_APPLIED).toBe(true);
    expect(PHASE_11J_RUNTIME.SHADOW_WRITE_ENABLED).toBe(false);
  });

  it('T56 PHASE 11.K remote staging write remains false in 11.K runtime', () => {
    expect(PHASE_11K_RUNTIME.REMOTE_STAGING_WRITE).toBe(false);
    expect(PHASE_11K_RUNTIME.SHADOW_WRITE_DEFAULT).toBe(false);
  });

  it('T57 PHASE 11.L writers were not wired; 11.M wires with default OFF', () => {
    expect(PHASE_11L_RUNTIME.APP_WRITERS_STAGING_WIRED).toBe(false);
    expect(PHASE_11M_RUNTIME.APP_WRITERS_STAGING_WIRED).toBe(true);
    expect(PHASE_11M_RUNTIME.V2_RUNTIME_SHADOW_DEFAULT).toBe(false);
  });

  it('T58 contracts automatic financial side effect NONE', () => {
    ensureContractsModuleSeeded();
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-11m-1', contractNumber: 'CTR-11M-1', clinicId: 'clinic-11m-a',
        tenant_id: PHASE_11M_TENANT_A, patientId: PATIENT_A, status: CONTRACT_STATUS.GENERATED,
        renderedHtml: '<p>11M</p>', finalContent: '<p>11M</p>', documentHash: 'hash-11m', version: 1,
      }];
      return db;
    });
    const before = financeSnapshot();
    cancelUnsignedContract({ user: adminA, contractId: 'gctr-11m-1', reason: 'desistencia' });
    expect(financeSnapshot()).toBe(before);
  });

  it('T59 021 remains untouched and V3 flags off', () => {
    const sql021 = readFileSync(join(ROOT, FINANCIAL_021_MIGRATION_FILE), 'utf8');
    expect(sql021).toMatch(/numeric\(14, 2\)/);
    expect(assertV3FlagsRemainOffForRuntimeShadow()).toBe(true);
  });

  it('T60 allow-all is refused', () => {
    expect(resolveRuntimeShadowDecision({
      record: { id: 'x', tenant_id: PHASE_11M_TENANT_A },
      enabled: true,
      allowlist: ['all'],
      projectRef: STAGING_SUPABASE_PROJECT_REF,
    }).reason_code).toBe('ALLOWLIST_ALL_FORBIDDEN');
  });
});

function getFinancingStatus(id) {
  return (loadDb().financings || []).find((row) => row.id === id)?.status;
}
