/**
 * PHASE 11.N — controlled runtime shadow observation window.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
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
import { PHASE_11M_RUNTIME } from '../services/financialV2RuntimeShadow.js';
import {
  PHASE_11N_ACCEPTANCE,
  PHASE_11N_GATE,
  PHASE_11N_RUNTIME,
  PHASE_11N_TENANT,
  assertObservationEnvironmentAllowed,
  closeObservationWindow,
  executeObservationPlaybook,
  openObservationWindow,
  runControlledRuntimeShadowObservation,
} from '../services/financialV2ObservationWindow.js';
import {
  PHASE_11N_PATIENT,
} from '../services/financialV2Phase11nFixtures.js';
import {
  __flushFinancialV2RuntimeShadowForTest,
  __resetFinancialV2RuntimeShadowForTest,
  getRuntimeShadowTelemetry,
  isFinancialV2RuntimeShadowEnabled,
} from '../services/financialV2RuntimeShadow.js';
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
import { toCents } from '../services/receivableMoney.js';
import { FINANCIAL_REPOSITORY_FLAG_DEFAULTS } from '../repositories/financial/financialRepositoryFlags.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SNAPSHOT_PATH = join(ROOT, 'docs/reports/PHASE_11N_OBSERVATION_SNAPSHOT.json');

const adminA = {
  id: 'user-11n-admin-a',
  role: 'admin',
  tenant_id: PHASE_11N_TENANT,
  tenantId: PHASE_11N_TENANT,
  name: 'Admin 11N A',
};

function seed() {
  withDb((db) => {
    db.tenants = [{ id: PHASE_11N_TENANT, name: 'phase11n-clinic-a', status: 'active' }];
    db.clinicProfile = { id: 'clinic-11n-a', tenant_id: PHASE_11N_TENANT, razaoSocial: 'phase11n-clinic-a' };
    db.patients = [{ id: PHASE_11N_PATIENT, tenant_id: PHASE_11N_TENANT, full_name: 'Paciente 11N A' }];
    db.appointments = [{
      id: 'phase11n-apt-a', tenant_id: PHASE_11N_TENANT, patientId: PHASE_11N_PATIENT,
      professionalId: 'prof-11n', date: '2026-08-31', status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
    }];
    db.accountsReceivable = [];
    db.receivablePayments = [];
    db.financings = [];
    db.receivableCharges = [];
    return db;
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

describe('PHASE 11.N controlled runtime shadow observation', () => {
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

  it('T1 baseline and acceptance contract', () => {
    expect(PHASE_11N_GATE).toBe('FINANCIAL_V2_RUNTIME_SHADOW_OBSERVATION_VALIDATED');
    expect(PHASE_11N_RUNTIME.OBSERVATION_SCOPE).toBe('SYNTHETIC_SINGLE_TENANT_STAGING');
    expect(PHASE_11N_RUNTIME.OBSERVATION_TENANT).toBe(PHASE_11N_TENANT);
    expect(PHASE_11N_ACCEPTANCE.ELIGIBLE_COMPARABLE_MUST_MATCH).toBe(true);
    expect(PHASE_11N_ACCEPTANCE.NO_TENANT_CUTOVER).toBe(true);
  });

  it('T2 staging accepted and production blocked', () => {
    expect(assertObservationEnvironmentAllowed(STAGING_SUPABASE_PROJECT_REF)).toBe(true);
    expect(() => assertObservationEnvironmentAllowed(PRODUCTION_SUPABASE_PROJECT_REF))
      .toThrow(/PRODUCTION_FORBIDDEN/);
  });

  it('T3 unknown target blocked', () => {
    expect(() => assertObservationEnvironmentAllowed('other-ref')).toThrow(/STAGING_REQUIRED/);
  });

  it('T4 runtime flag default OFF before window', () => {
    expect(PHASE_11N_RUNTIME.V2_RUNTIME_SHADOW_DEFAULT).toBe(false);
    expect(isFinancialV2RuntimeShadowEnabled()).toBe(false);
    expect(PHASE_11M_RUNTIME.V2_RUNTIME_SHADOW_DEFAULT).toBe(false);
  });

  it('T5 allowlist is a single synthetic tenant', () => {
    const opened = openObservationWindow();
    expect(opened.allowlist).toEqual([PHASE_11N_TENANT]);
    expect(opened.allowlist).toHaveLength(1);
    expect(opened.allowlist.includes('all')).toBe(false);
  });

  it('T6 full observation window: writers real + all eligible MATCH', async () => {
    const report = await runControlledRuntimeShadowObservation(adminA, { patientId: PHASE_11N_PATIENT });
    expect(report.acceptance.pass).toBe(true);
    expect(report.acceptance.failures).toEqual([]);
    expect(report.summary.OBSERVATION_MATCH).toBe(report.summary.OBSERVATION_ELIGIBLE);
    expect(report.summary.OBSERVATION_MISMATCH).toBe(0);
    expect(report.summary.OBSERVATION_WRITE_FAILED).toBe(0);
    expect(report.summary.OBSERVATION_QUARANTINED).toBe(0);
    expect(report.summary.PATH_A_RUNTIME_SHADOW).toBe('MATCH');
    expect(report.summary.FINANCING_RUNTIME_SHADOW).toBe('MATCH');
    expect(report.summary.PATH_B_RUNTIME_SHADOW).toBe('MATCH');
    expect(report.summary.PAYMENT_RUNTIME_SHADOW).toBe('MATCH');
    expect(report.summary.REVERSAL_RUNTIME_SHADOW).toBe('MATCH');
    expect(report.summary.CHARGE_RUNTIME_SHADOW).toBe('MATCH');
    expect(report.summary.PAYMENT_RETRY_REPLAYED).toBe(true);
  });

  it('T7 zero duplicates / orphans / PII', async () => {
    const report = await runControlledRuntimeShadowObservation(adminA, { patientId: PHASE_11N_PATIENT });
    expect(report.summary.DUPLICATE_REMOTE_FACTS).toBe(0);
    expect(report.summary.ORPHAN_REMOTE_FACTS).toBe(0);
    expect(report.summary.PII_TELEMETRY_LEAKS).toBe(0);
    expect(report.summary.IMMUTABLE_REMOTE_OVERWRITES).toBe(0);
  });

  it('T8 kill switch stops enqueue immediately', async () => {
    const report = await runControlledRuntimeShadowObservation(adminA, { patientId: PHASE_11N_PATIENT });
    const before = getRuntimeShadowTelemetry().length;
    closeObservationWindow();
    expect(isFinancialV2RuntimeShadowEnabled()).toBe(false);
    createReceivable(adminA, {
      patient_id: PHASE_11N_PATIENT,
      description: 'phase11n after kill',
      original_amount: 10,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY,
      due_date: '2026-09-20',
    });
    await new Promise((resolve) => queueMicrotask(resolve));
    await __flushFinancialV2RuntimeShadowForTest();
    expect(getRuntimeShadowTelemetry().length).toBe(before);
    expect(report.playbook.pathA.id).toBeTruthy();
  });

  it('T9 IndexedDB remains SSOT when shadow later disabled', async () => {
    await runControlledRuntimeShadowObservation(adminA, { patientId: PHASE_11N_PATIENT });
    closeObservationWindow();
    const before = financeSnapshot();
    createReceivable(adminA, {
      patient_id: PHASE_11N_PATIENT,
      description: 'phase11n ssot',
      original_amount: 11,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY,
      due_date: '2026-09-21',
    });
    expect(financeSnapshot()).not.toBe(before);
    expect((loadDb().accountsReceivable || []).length).toBeGreaterThan(1);
  });

  it('T10 authority flags remain off', () => {
    expect(PHASE_11N_RUNTIME.FINANCIAL_SERVER_READ_ENABLED).toBe(false);
    expect(PHASE_11N_RUNTIME.FINANCIAL_SERVER_WRITE_AUTHORITY).toBe(false);
    expect(PHASE_11N_RUNTIME.DUAL_WRITE_ENABLED).toBe(false);
    expect(PHASE_11N_RUNTIME.SHADOW_NON_AUTHORITATIVE).toBe(true);
    expect(PHASE_11N_RUNTIME.TENANT_CUTOVER).toBe(false);
    expect(PHASE_11N_RUNTIME.REAL_USER_RUNTIME_SHADOW).toBe(false);
    expect(FINANCIAL_REPOSITORY_FLAG_DEFAULTS.FINANCIAL_SHADOW).toBe(false);
  });

  it('T11 no backfill / historical scan / production change', () => {
    expect(PHASE_11N_RUNTIME.BACKFILL_APPLIED).toBe(false);
    expect(PHASE_11N_RUNTIME.HISTORICAL_SHADOW_SCAN).toBe(false);
    expect(PHASE_11N_RUNTIME.PRODUCTION_DATABASE_CHANGED).toBe(false);
  });

  it('T12 observation snapshot cleanup complete', () => {
    expect(existsSync(SNAPSHOT_PATH)).toBe(true);
    const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
    expect(snap.environment).toBe('STAGING');
    expect(snap.projectRef).toBe(STAGING_SUPABASE_PROJECT_REF);
    expect(snap.productionRefTouched).toBe(false);
    expect(snap.cleanupComplete).toBe(true);
    expect(snap.leftoverCounts).toEqual({
      receivables: 0, payments: 0, financings: 0, charges: 0, tenants: 0, tenant_users: 0,
    });
    expect(snap.acceptance.pass).toBe(true);
  });

  it('T13 PHASE 11.B receivable creation still idempotent', () => {
    const first = createReceivable(adminA, {
      patient_id: PHASE_11N_PATIENT, description: '11n b', original_amount: 150,
      origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN, origin_id: 'budget-11n-1', installment_number: 1,
      due_date: '2026-09-15',
    });
    const second = createReceivable(adminA, {
      patient_id: PHASE_11N_PATIENT, description: '11n b', original_amount: 150,
      origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN, origin_id: 'budget-11n-1', installment_number: 1,
      due_date: '2026-09-15',
    });
    expect(second.id).toBe(first.id);
  });

  it('T14 PHASE 11.C payment idempotency still holds', () => {
    const title = createReceivable(adminA, {
      patient_id: PHASE_11N_PATIENT, description: '11n c', original_amount: 400,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-15',
    });
    registerReceivablePayment(adminA, title.id, {
      payment_date: '2026-08-31', amount_received: 400, payment_method: 'pix', operation_id: 'op-11n-t14',
    });
    expect(registerReceivablePayment(adminA, title.id, {
      payment_date: '2026-08-31', amount_received: 400, payment_method: 'pix', operation_id: 'op-11n-t14',
    }).replayed).toBe(true);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
  });

  it('T15 PHASE 11.D unpaid cancel still holds', () => {
    const title = createReceivable(adminA, {
      patient_id: PHASE_11N_PATIENT, description: '11n d', original_amount: 90,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-15',
    });
    expect(cancelReceivable(adminA, title.id, 'ok').status).toBe(RECEIVABLE_STATUS.CANCELED);
  });

  it('T16 PHASE 11.E/F/G still hold', () => {
    const proposal = createFinancingProposal(adminA, {
      patient_id: PHASE_11N_PATIENT, description: 'Fin 11N T16', total_amount: 600, entry_amount: 0,
      installments_count: 2, installment_frequency: 'monthly', first_due_date: '2026-09-10',
      issue_date: '2026-08-31', boleto_auto_generate: false, requires_credit_analysis: false,
    });
    expect(proposal.id).toBeTruthy();
    const title = createReceivable(adminA, {
      patient_id: PHASE_11N_PATIENT, description: '11n f', original_amount: 120,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-15',
    });
    const before = (loadDb().accountsReceivable || []).length;
    createReceivableCharge(adminA, { receivable_id: title.id, operation_id: 'op-11n-t16' });
    expect((loadDb().accountsReceivable || []).length).toBe(before);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it('T17 PHASE 11.H–11.M runtimes remain non-authoritative', () => {
    expect(PHASE_11H_RUNTIME.SUPABASE_CUTOVER).toBe(false);
    expect(PHASE_11I_RUNTIME.SHADOW_WRITE_ENABLED).toBe(false);
    expect(PHASE_11J_RUNTIME.SHADOW_WRITE_ENABLED).toBe(false);
    expect(PHASE_11K_RUNTIME.REMOTE_STAGING_WRITE).toBe(false);
    expect(PHASE_11L_RUNTIME.APP_WRITERS_STAGING_WIRED).toBe(false);
    expect(PHASE_11M_RUNTIME.APP_WRITERS_STAGING_WIRED).toBe(true);
    expect(PHASE_11M_RUNTIME.V2_RUNTIME_SHADOW_DEFAULT).toBe(false);
  });

  it('T18 contracts automatic financial side effect NONE', () => {
    ensureContractsModuleSeeded();
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-11n-1', contractNumber: 'CTR-11N-1', clinicId: 'clinic-11n-a',
        tenant_id: PHASE_11N_TENANT, patientId: PHASE_11N_PATIENT, status: CONTRACT_STATUS.GENERATED,
        renderedHtml: '<p>11N</p>', finalContent: '<p>11N</p>', documentHash: 'hash-11n', version: 1,
      }];
      return db;
    });
    const before = financeSnapshot();
    cancelUnsignedContract({ user: adminA, contractId: 'gctr-11n-1', reason: 'desistencia' });
    expect(financeSnapshot()).toBe(before);
  });

  it('T19 021 remains untouched', () => {
    const sql021 = readFileSync(join(ROOT, FINANCIAL_021_MIGRATION_FILE), 'utf8');
    expect(sql021).toMatch(/numeric\(14, 2\)/);
    expect(sql021).toMatch(/default 'open'/);
  });

  it('T20 playbook uses canonical writers not a parallel engine', async () => {
    openObservationWindow();
    const playbook = await executeObservationPlaybook(adminA, { patientId: PHASE_11N_PATIENT });
    expect(playbook.pathA.origin_type).toBe(RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN);
    expect(playbook.pathB.every((row) => row.origin_type === 'financing')).toBe(true);
    expect(playbook.paid.payment.id).toBeTruthy();
    expect(playbook.reversed.reversal.reverses_payment_id).toBe(playbook.paid.payment.id);
    expect(playbook.charge.receivable_id).toBe(playbook.pathA.id);
  });
});
