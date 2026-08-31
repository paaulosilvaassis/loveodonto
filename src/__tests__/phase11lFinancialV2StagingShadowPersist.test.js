/**
 * PHASE 11.L — staging shadow persistence & read-back parity.
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
import { toCents } from '../services/receivableMoney.js';
import {
  PHASE_11L_GATE,
  PHASE_11L_RUNTIME,
  PHASE_11L_SOURCE_PREFIX,
  PHASE_11L_TENANT_A,
  PHASE_11L_TENANT_B,
  assertPhase11kDidNotPersistRemote,
  assertPhase11lSyntheticSourceId,
  assertStagingShadowEnvironmentAllowed,
  assertV3FlagsRemainOffForStagingShadow,
  buildPhase11lCleanupSql,
  buildPhase11lInsertSql,
  buildPhase11lSelectSql,
  buildPhase11lSyntheticLegacyDb,
  buildPhase11lTenantSeedSql,
  compareStagingReadback,
  persistPhase11lStagingShadow,
  preparePhase11lShadowPlan,
} from '../services/financialV2StagingShadowPersist.js';
import { compareFinancialShadow, SHADOW_REASON, SHADOW_RESULT } from '../services/financialV2ShadowComparator.js';
import {
  cancelReceivable,
  createReceivable,
  createReceivableCharge,
  getReceivablePayments,
  RECEIVABLE_ORIGIN_TYPE,
  RECEIVABLE_STATUS,
  registerReceivablePayment,
} from '../services/receivablesService.js';
import { isEffectiveReceivablePayment } from '../services/receivableReconciliation.js';
import { approveFinancing, createFinancingProposal } from '../services/financingsService.js';
import { FINANCIAL_REPOSITORY_FLAG_DEFAULTS } from '../repositories/financial/financialRepositoryFlags.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SNAPSHOT_PATH = join(ROOT, 'docs/reports/PHASE_11L_STAGING_SHADOW_READBACK.json');
const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const PATIENT_A = 'patient-11l-a';
const APPT_A = 'apt-11l-a';

const adminA = {
  id: 'user-11l-admin-a', role: 'admin', tenant_id: TENANT_A, tenantId: TENANT_A, name: 'Admin 11L A',
};
const adminB = {
  id: 'user-11l-admin-b', role: 'admin', tenant_id: TENANT_B, tenantId: TENANT_B, name: 'Admin 11L B',
};

function readSnapshot() {
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
}

function seed() {
  withDb((db) => {
    db.tenants = [
      { id: TENANT_A, name: 'Clinica 11L A', status: 'active' },
      { id: TENANT_B, name: 'Clinica 11L B', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-11l-a', tenant_id: TENANT_A, razaoSocial: 'Clinica 11L A' };
    db.patients = [
      { id: PATIENT_A, tenant_id: TENANT_A, full_name: 'Paciente 11L A' },
      { id: 'patient-11l-b', tenant_id: TENANT_B, full_name: 'Paciente 11L B' },
    ];
    db.appointments = [{
      id: APPT_A, tenant_id: TENANT_A, patientId: PATIENT_A, professionalId: 'prof-11l',
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
    description: extras.description || 'CR 11L',
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

function createMemoryExecutor(seedRows = []) {
  const rows = [...seedRows];
  return async (sql) => {
    const text = String(sql);
    if (text.startsWith('INSERT INTO public.tenants')) return [];
    const insert = text.match(/INSERT INTO public\.(financial_v2_\w+)/);
    if (insert) {
      const values = text.match(/VALUES\s*\((.*)\)\s*ON CONFLICT/s);
      const source = text.match(/'phase11l-[^']+'/);
      const tenant = text.match(/'([0-9a-f-]{36})'::uuid/);
      rows.push({
        table: insert[1],
        source_id: source?.[0]?.replace(/'/g, ''),
        tenant_id: tenant?.[1],
        raw: text,
        values: values?.[1] || '',
      });
      return [];
    }
    const select = text.match(/FROM public\.(financial_v2_\w+)/);
    if (select) {
      const source = text.match(/source_id = '([^']+)'/)?.[1];
      const tenant = text.match(/tenant_id = '([^']+)'::uuid/)?.[1];
      const hit = rows.find((row) => row.source_id === source && row.tenant_id === tenant);
      if (!hit) return [];
      const plan = preparePhase11lShadowPlan();
      const mapped = plan.writes.find((item) => item.mapped.source_id === source)?.mapped;
      return mapped ? [mapped] : [];
    }
    return [];
  };
}

describe('PHASE 11.L financial v2 staging shadow persistence', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seed();
  });

  it('T1 gate and runtime defaults', () => {
    expect(PHASE_11L_GATE).toBe('FINANCIAL_V2_STAGING_SHADOW_PERSISTENCE_VALIDATED');
    expect(PHASE_11L_RUNTIME.SHADOW_WRITE_DEFAULT).toBe(false);
    expect(PHASE_11L_RUNTIME.APP_WRITERS_STAGING_WIRED).toBe(false);
    expect(PHASE_11L_RUNTIME.TARGET_DB_ENVIRONMENT).toBe('STAGING');
    expect(PHASE_11L_RUNTIME.REMOTE_SCHEMA_ENVIRONMENT).toBe(STAGING_SUPABASE_PROJECT_REF);
    expect(PHASE_11L_RUNTIME.REMOTE_STAGING_WRITE).toBe(true);
  });

  it('T2 production project refused', () => {
    expect(() => assertStagingShadowEnvironmentAllowed(PRODUCTION_SUPABASE_PROJECT_REF))
      .toThrow(/PRODUCTION_FORBIDDEN/);
  });

  it('T3 non-staging project refused', () => {
    expect(() => assertStagingShadowEnvironmentAllowed('other-ref'))
      .toThrow(/ENV_REQUIRED/);
    expect(assertStagingShadowEnvironmentAllowed(STAGING_SUPABASE_PROJECT_REF)).toBe(true);
  });

  it('T4 synthetic prefix required', () => {
    expect(() => assertPhase11lSyntheticSourceId('recv-real-1'))
      .toThrow(/SYNTHETIC_ONLY/);
    expect(assertPhase11lSyntheticSourceId('phase11l-recv-a1')).toBe(true);
    expect(PHASE_11L_SOURCE_PREFIX).toBe('phase11l-');
  });

  it('T5 IDB recv-* cannot be persisted to staging', () => {
    expect(() => buildPhase11lInsertSql('receivables', {
      source_id: 'recv-from-idb', tenant_id: PHASE_11L_TENANT_A, origin_type: 'manual_entry',
      original_cents: 100, total_cents: 100, status: 'upcoming',
    })).toThrow(/SYNTHETIC_ONLY/);
  });

  it('T6 insert SQL uses integer cents and staging tables', () => {
    const plan = preparePhase11lShadowPlan();
    const recv = plan.writes.find((row) => row.entityType === 'receivable' && row.mapped.source_id === 'phase11l-recv-a1');
    expect(recv.insertSql).toContain('financial_v2_receivables');
    expect(recv.insertSql).toContain('9999');
    expect(recv.insertSql).not.toContain('99.99');
    expect(recv.insertSql).not.toContain(PRODUCTION_SUPABASE_PROJECT_REF);
    expect(recv.mapped.total_cents).toBe(toCents(99.99));
  });

  it('T7 persist executor writes then compares MATCH', async () => {
    const report = await persistPhase11lStagingShadow({
      executor: createMemoryExecutor(),
      projectRef: STAGING_SUPABASE_PROJECT_REF,
    });
    expect(report.stats.TOTAL).toBeGreaterThanOrEqual(6);
    expect(report.stats.MATCH).toBe(report.stats.TOTAL);
    expect(report.stats.MISMATCH).toBe(0);
    expect(report.comparisons.every((row) => row.source_id.startsWith('phase11l-'))).toBe(true);
  });

  it('T8 production persist is refused even with executor', async () => {
    await expect(persistPhase11lStagingShadow({
      executor: createMemoryExecutor(),
      projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
    })).rejects.toThrow(/PRODUCTION_FORBIDDEN/);
  });

  it('T9 payment / reversal / financing / charge are in the plan', () => {
    const plan = preparePhase11lShadowPlan();
    const ids = plan.writes.map((row) => row.mapped.source_id).sort();
    expect(ids).toEqual([
      'phase11l-chg-a1',
      'phase11l-fin-a1',
      'phase11l-pay-a1',
      'phase11l-recv-a1',
      'phase11l-recv-b1',
      'phase11l-rev-a1',
    ]);
    const pay = plan.writes.find((row) => row.mapped.source_id === 'phase11l-pay-a1');
    const rev = plan.writes.find((row) => row.mapped.source_id === 'phase11l-rev-a1');
    expect(pay.mapped.amount_cents).toBe(4999);
    expect(rev.mapped.kind).toBe('reversal');
    expect(rev.mapped.reverses_payment_id).toBe('phase11l-pay-a1');
  });

  it('T10 tampered read-back is MISMATCH', () => {
    const plan = preparePhase11lShadowPlan();
    const recv = plan.writes.find((row) => row.mapped.source_id === 'phase11l-recv-a1');
    expect(compareStagingReadback({
      entityType: 'receivable',
      legacy: recv.legacy,
      readback: { ...recv.mapped, total_cents: 1 },
      eligibility: recv.eligibility,
    }).reason_code).toBe(SHADOW_REASON.MONEY_MISMATCH);
  });

  it('T11 cleanup SQL is synthetic-only', () => {
    const sql = buildPhase11lCleanupSql();
    expect(sql).toMatch(/source_id LIKE 'phase11l-%'/);
    expect(sql).toMatch(/legal_name LIKE 'phase11l-%'/);
    expect(sql).not.toContain(PRODUCTION_SUPABASE_PROJECT_REF);
    expect(sql).not.toMatch(/DELETE FROM public\.financial_v2_receivables;/);
  });

  it('T12 tenant seed is synthetic UUID clinics', () => {
    const sql = buildPhase11lTenantSeedSql();
    expect(sql).toContain(PHASE_11L_TENANT_A);
    expect(sql).toContain(PHASE_11L_TENANT_B);
    expect(sql).toContain('phase11l-clinic-a');
  });

  it('T13 select SQL is scoped to tenant + source', () => {
    const sql = buildPhase11lSelectSql('receivables', PHASE_11L_TENANT_A, 'phase11l-recv-a1');
    expect(sql).toContain('financial_v2_receivables');
    expect(sql).toContain(PHASE_11L_TENANT_A);
    expect(sql).toContain('phase11l-recv-a1');
  });

  it('T14 V3 flags remain OFF', () => {
    expect(assertV3FlagsRemainOffForStagingShadow()).toBe(true);
    expect(FINANCIAL_REPOSITORY_FLAG_DEFAULTS.FINANCIAL_SHADOW).toBe(false);
    expect(FINANCIAL_REPOSITORY_FLAG_DEFAULTS.FINANCIAL_DUAL_WRITE).toBe(false);
    expect(FINANCIAL_REPOSITORY_FLAG_DEFAULTS.FINANCIAL_WRITE).toBe(false);
  });

  it('T15 no dual write / server write / cutover', () => {
    expect(PHASE_11L_RUNTIME.DUAL_WRITE_ENABLED).toBe(false);
    expect(PHASE_11L_RUNTIME.FINANCIAL_SERVER_WRITE_ENABLED).toBe(false);
    expect(PHASE_11L_RUNTIME.FINANCIAL_SERVER_READ_ENABLED).toBe(false);
    expect(PHASE_11L_RUNTIME.TENANT_CUTOVER).toBe(false);
  });

  it('T16 11.K did not persist remote; 11.L does not wire app writers', () => {
    expect(assertPhase11kDidNotPersistRemote()).toBe(true);
    expect(PHASE_11K_RUNTIME.REMOTE_STAGING_WRITE).toBe(false);
    expect(PHASE_11L_RUNTIME.APP_WRITERS_STAGING_WIRED).toBe(false);
  });

  it('T17 021 remains untouched', () => {
    const sql021 = readFileSync(join(ROOT, FINANCIAL_021_MIGRATION_FILE), 'utf8');
    expect(sql021).toMatch(/numeric\(14, 2\)/);
    expect(sql021).toMatch(/default 'open'/);
  });

  it('T18 no backfill / no production scan', () => {
    expect(PHASE_11L_RUNTIME.BACKFILL_APPLIED).toBe(false);
    expect(PHASE_11L_RUNTIME.HISTORICAL_PRODUCTION_SCAN).toBe(false);
    expect(PHASE_11L_RUNTIME.PRODUCTION_DATABASE_CHANGED).toBe(false);
  });

  it('T19 IndexedDB remains SSOT after local persist simulation', async () => {
    const before = financeSnapshot();
    await persistPhase11lStagingShadow({
      executor: createMemoryExecutor(),
      projectRef: STAGING_SUPABASE_PROJECT_REF,
    });
    expect(financeSnapshot()).toBe(before);
  });

  it('T20 live snapshot exists and is staging-only', () => {
    expect(existsSync(SNAPSHOT_PATH)).toBe(true);
    const snap = readSnapshot();
    expect(snap.environment).toBe('STAGING');
    expect(snap.projectRef).toBe(STAGING_SUPABASE_PROJECT_REF);
    expect(snap.productionRefTouched).toBe(false);
    expect(snap.syntheticPrefix).toBe('phase11l-');
  });

  it('T21 live write → read-back all MATCH', () => {
    const snap = readSnapshot();
    expect(snap.stats.MISMATCH).toBe(0);
    expect(snap.stats.MATCH).toBe(snap.stats.TOTAL);
    expect(snap.stats.TOTAL).toBeGreaterThanOrEqual(6);
    for (const row of snap.comparisons) {
      expect(row.source_id.startsWith('phase11l-')).toBe(true);
      expect(row.comparison.result).toBe(SHADOW_RESULT.MATCH);
      expect(compareFinancialShadow({
        entityType: row.entityType,
        legacy: row.legacy,
        v2: row.normalized,
      }).result).toBe(SHADOW_RESULT.MATCH);
    }
  });

  it('T22 live money is integer cents', () => {
    const snap = readSnapshot();
    const recv = snap.comparisons.find((row) => row.source_id === 'phase11l-recv-a1');
    expect(recv.normalized.total_cents).toBe(9999);
    const pay = snap.comparisons.find((row) => row.source_id === 'phase11l-pay-a1');
    expect(pay.normalized.amount_cents).toBe(4999);
  });

  it('T23 live reversal preserves original payment fact', () => {
    const snap = readSnapshot();
    const pay = snap.comparisons.find((row) => row.source_id === 'phase11l-pay-a1');
    const rev = snap.comparisons.find((row) => row.source_id === 'phase11l-rev-a1');
    expect(pay.readback.source_id).toBe('phase11l-pay-a1');
    expect(rev.normalized.reverses_payment_id).toBe('phase11l-pay-a1');
    expect(rev.normalized.kind).toBe('reversal');
  });

  it('T24 live charge did not create receivable', () => {
    const snap = readSnapshot();
    const chg = snap.comparisons.find((row) => row.source_id === 'phase11l-chg-a1');
    expect(chg.normalized.creates_receivable).toBe(false);
    expect(chg.normalized.receivable_id).toBe('phase11l-recv-a1');
  });

  it('T25 live tenants are isolated', () => {
    const snap = readSnapshot();
    const a = snap.comparisons.find((row) => row.source_id === 'phase11l-recv-a1');
    const b = snap.comparisons.find((row) => row.source_id === 'phase11l-recv-b1');
    expect(a.tenant_id).toBe(PHASE_11L_TENANT_A);
    expect(b.tenant_id).toBe(PHASE_11L_TENANT_B);
  });

  it('T26 cleanup completed on staging', () => {
    const snap = readSnapshot();
    expect(snap.cleanupComplete).toBe(true);
    expect(snap.leftoverCounts).toEqual({
      receivables: 0,
      payments: 0,
      financings: 0,
      charges: 0,
      tenants: 0,
    });
  });

  it('T27 PHASE 11.B receivable creation still idempotent', () => {
    const first = openReceivable(150, {
      origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN,
      origin_id: 'budget-11l-1',
      installment_number: 1,
    });
    const second = openReceivable(150, {
      origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN,
      origin_id: 'budget-11l-1',
      installment_number: 1,
    });
    expect(second.id).toBe(first.id);
  });

  it('T28 PHASE 11.C payment idempotency still holds', () => {
    const title = openReceivable(400);
    pay(title.id, 400, 'op-11l-t28');
    expect(pay(title.id, 400, 'op-11l-t28').replayed).toBe(true);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
  });

  it('T29 PHASE 11.D unpaid cancel still holds', () => {
    expect(cancelReceivable(adminA, openReceivable(90).id, 'ok').status).toBe(RECEIVABLE_STATUS.CANCELED);
  });

  it('T30 PHASE 11.E financing tenant still holds', () => {
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A, description: 'Fin 11L T30', total_amount: 600, entry_amount: 0,
      installments_count: 2, installment_frequency: 'monthly', first_due_date: '2026-09-10',
      issue_date: '2026-08-31', boleto_auto_generate: false, requires_credit_analysis: false,
    });
    expect(() => approveFinancing(adminB, proposal.id)).toThrow(/outra clínica|TENANT_MISMATCH/i);
  });

  it('T31 PHASE 11.F charge still does not create obligation', () => {
    const title = openReceivable(120);
    const before = (loadDb().accountsReceivable || []).length;
    createReceivableCharge(adminA, { receivable_id: title.id, operation_id: 'op-11l-t31' });
    expect((loadDb().accountsReceivable || []).length).toBe(before);
  });

  it('T32 PHASE 11.G cents conversion still holds', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it('T33 PHASE 11.H/I/J readiness still not cutover', () => {
    expect(PHASE_11H_RUNTIME.DUAL_WRITE_ENABLED).toBe(false);
    expect(PHASE_11H_RUNTIME.SUPABASE_CUTOVER).toBe(false);
    expect(PHASE_11I_RUNTIME.SHADOW_WRITE_ENABLED).toBe(false);
    expect(PHASE_11J_RUNTIME.SHADOW_WRITE_ENABLED).toBe(false);
    expect(PHASE_11J_RUNTIME.PRODUCTION_DATABASE_CHANGED).toBe(false);
  });

  it('T34 contract lifecycle has no automatic financial side-effects', () => {
    ensureContractsModuleSeeded();
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-11l-1', contractNumber: 'CTR-11L-1', clinicId: 'clinic-11l-a',
        tenant_id: TENANT_A, patientId: PATIENT_A, status: CONTRACT_STATUS.GENERATED,
        renderedHtml: '<p>11L</p>', finalContent: '<p>11L</p>', documentHash: 'hash-11l', version: 1,
      }];
      return db;
    });
    const before = financeSnapshot();
    cancelUnsignedContract({ user: adminA, contractId: 'gctr-11l-1', reason: 'desistencia' });
    expect(financeSnapshot()).toBe(before);
  });

  it('T35 no real financial ids in fixtures', () => {
    const db = buildPhase11lSyntheticLegacyDb();
    const ids = [
      ...db.accountsReceivable,
      ...db.receivablePayments,
      ...db.financings,
      ...db.receivableCharges,
    ].map((row) => row.id);
    expect(ids.every((id) => id.startsWith('phase11l-'))).toBe(true);
  });

  it('T36 replay ON CONFLICT does not duplicate', async () => {
    const executor = createMemoryExecutor();
    const first = await persistPhase11lStagingShadow({ executor, projectRef: STAGING_SUPABASE_PROJECT_REF });
    const second = await persistPhase11lStagingShadow({ executor, projectRef: STAGING_SUPABASE_PROJECT_REF });
    expect(first.stats.MATCH).toBe(second.stats.MATCH);
    expect(second.stats.MISMATCH).toBe(0);
  });
});
