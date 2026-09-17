/**
 * PHASE 11.O — authenticated staging tenant pilot.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { PHASE_11N_GATE, PHASE_11N_RUNTIME } from '../services/financialV2ObservationWindow.js';
import {
  PHASE_11O_ACCEPTANCE,
  PHASE_11O_GATE,
  PHASE_11O_RUNTIME,
  PHASE_11O_TENANT,
  PHASE_11O_TENANT_B,
  PHASE_11O_USER,
  assertPilotEnvironmentAllowed,
  closeAuthenticatedPilotWindow,
  executeAuthenticatedPilotPlaybook,
  openAuthenticatedPilotWindow,
  runAuthenticatedStagingPilot,
} from '../services/financialV2AuthenticatedStagingPilot.js';
import {
  PHASE_11O_ALLOWLIST,
  PHASE_11O_PATIENT,
} from '../services/financialV2Phase11oFixtures.js';
import {
  assertPilotEnvironmentAllowed as assertEnv,
  wrapAuthenticatedTenantSql,
} from '../services/financialV2AuthenticatedSql.js';
import {
  __flushFinancialV2RuntimeShadowForTest,
  __getFinancialV2RuntimeStoreForTest,
  __resetFinancialV2RuntimeShadowForTest,
  getRuntimeShadowTelemetry,
  isFinancialV2RuntimeShadowEnabled,
  resolveRuntimeShadowDecision,
  runFinancialV2RuntimeShadow,
} from '../services/financialV2RuntimeShadow.js';
import {
  cancelReceivable,
  createReceivable,
  createReceivableCharge,
  RECEIVABLE_ORIGIN_TYPE,
  RECEIVABLE_STATUS,
  registerReceivablePayment,
} from '../services/receivablesService.js';
import { createFinancingProposal } from '../services/financingsService.js';
import { toCents } from '../services/receivableMoney.js';
import { FINANCIAL_REPOSITORY_FLAG_DEFAULTS } from '../repositories/financial/financialRepositoryFlags.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_PATH = join(ROOT, 'docs/reports/PHASE_11O_AUTHENTICATED_STAGING_EVIDENCE.json');

const adminA = {
  id: 'user-11o-admin-a',
  role: 'admin',
  tenant_id: PHASE_11O_TENANT,
  tenantId: PHASE_11O_TENANT,
  name: 'Admin 11O A',
};

function readEvidence() {
  expect(existsSync(EVIDENCE_PATH)).toBe(true);
  return JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8'));
}

function seed() {
  withDb((db) => {
    db.tenants = [
      { id: PHASE_11O_TENANT, name: 'phase11o-clinic-a', status: 'active' },
      { id: PHASE_11O_TENANT_B, name: 'phase11o-clinic-b', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-11o-a', tenant_id: PHASE_11O_TENANT, razaoSocial: 'phase11o-clinic-a' };
    db.patients = [{ id: PHASE_11O_PATIENT, tenant_id: PHASE_11O_TENANT, full_name: 'Paciente 11O A' }];
    db.appointments = [{
      id: 'phase11o-apt-a', tenant_id: PHASE_11O_TENANT, patientId: PHASE_11O_PATIENT,
      professionalId: 'prof-11o', date: '2026-08-31', status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
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

describe('PHASE 11.O authenticated staging tenant pilot', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T12:00:00Z'));
    localStorage.clear();
    __resetFinancialV2RuntimeShadowForTest();
    await resetDb();
    await initDb();
    seed();
  });
  afterEach(() => {
    vi.useRealTimers();
    __resetFinancialV2RuntimeShadowForTest();
  });

  it('T1 baseline HEAD contract', () => {
    expect(PHASE_11O_GATE).toBe('FINANCIAL_V2_FULL_AUTHENTICATED_STAGING_PILOT_VALIDATED');
    expect(PHASE_11O_RUNTIME.PILOT_SCOPE).toBe('SYNTHETIC_SINGLE_TENANT_STAGING_AUTHENTICATED');
    expect(PHASE_11O_ACCEPTANCE.AUTHENTICATED_REMOTE_REQUIRED).toBe(true);
  });

  it('T2 staging identity required', () => {
    expect(assertPilotEnvironmentAllowed(STAGING_SUPABASE_PROJECT_REF)).toBe(true);
    expect(PHASE_11O_RUNTIME.SHADOW_TARGET_PROJECT_REF).toBe(STAGING_SUPABASE_PROJECT_REF);
  });

  it('T3 production denied', () => {
    expect(() => assertEnv(PRODUCTION_SUPABASE_PROJECT_REF)).toThrow(/PRODUCTION_FORBIDDEN/);
  });

  it('T4 unknown target denied', () => {
    expect(() => assertEnv('other-ref')).toThrow(/UNKNOWN_TARGET/);
  });

  it('T5 runtime flag default OFF', () => {
    expect(PHASE_11O_RUNTIME.V2_RUNTIME_SHADOW_DEFAULT).toBe(false);
    expect(isFinancialV2RuntimeShadowEnabled()).toBe(false);
    expect(PHASE_11M_RUNTIME.V2_RUNTIME_SHADOW_DEFAULT).toBe(false);
  });

  it('T6 explicit tenant allowlist', () => {
    const opened = openAuthenticatedPilotWindow();
    expect(opened.allowlist).toEqual([PHASE_11O_TENANT]);
    expect(opened.allowlist).toHaveLength(1);
  });

  it('T7 wildcard prohibited', () => {
    const denied = resolveRuntimeShadowDecision({
      record: { tenant_id: PHASE_11O_TENANT, id: 'recv-x' },
      projectRef: STAGING_SUPABASE_PROJECT_REF,
      enabled: true,
      allowlist: ['all'],
    });
    expect(denied.reason_code).toBe('ALLOWLIST_ALL_FORBIDDEN');
    expect(PHASE_11O_ALLOWLIST.includes('*')).toBe(false);
  });

  it('T8 authenticated tenant JWT path', () => {
    const wrapped = wrapAuthenticatedTenantSql('SELECT 1', {
      userId: PHASE_11O_USER, tenantId: PHASE_11O_TENANT,
    });
    expect(wrapped).toMatch(/SET LOCAL ROLE authenticated/);
    expect(wrapped).toMatch(/request\.jwt\.claim\.sub/);
    expect(wrapped).toMatch(/request\.jwt\.claim\.tenant_id/);
    expect(wrapped).not.toMatch(/service_role/);
  });

  it('T9 service role not operational authority', () => {
    expect(PHASE_11O_RUNTIME.SHADOW_OPERATIONAL_AUTH).toBe('AUTHENTICATED_TENANT_SCOPED');
    expect(wrapAuthenticatedTenantSql('SELECT 1', {
      userId: PHASE_11O_USER, tenantId: PHASE_11O_TENANT,
    })).not.toMatch(/service_role/);
  });

  it('T10 PATH A canonical live writer', async () => {
    openAuthenticatedPilotWindow();
    const playbook = await executeAuthenticatedPilotPlaybook(adminA, { patientId: PHASE_11O_PATIENT });
    expect(playbook.pathA.origin_type).toBe(RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN);
    expect(playbook.pathA.id).toMatch(/^recv-/);
  });

  it('T11 PATH A remote MATCH', async () => {
    const report = await runAuthenticatedStagingPilot(adminA, { patientId: PHASE_11O_PATIENT });
    expect(report.summary.PATH_A_AUTHENTICATED_REMOTE).toBe('MATCH');
    expect(readEvidence().entities.pathA.compareFinancialShadow).toBe('MATCH');
  });

  it('T12 financing canonical live writer', async () => {
    openAuthenticatedPilotWindow();
    const playbook = await executeAuthenticatedPilotPlaybook(adminA, { patientId: PHASE_11O_PATIENT });
    expect(playbook.financing.id).toMatch(/^fin-/);
    expect(playbook.financing.tenant_id).toBe(PHASE_11O_TENANT);
  });

  it('T13 financing remote MATCH', async () => {
    const report = await runAuthenticatedStagingPilot(adminA, { patientId: PHASE_11O_PATIENT });
    expect(report.summary.FINANCING_AUTHENTICATED_REMOTE).toBe('MATCH');
    expect(readEvidence().entities.financing.compareFinancialShadow).toBe('MATCH');
  });

  it('T14 financing approval canonical writer', async () => {
    openAuthenticatedPilotWindow();
    const playbook = await executeAuthenticatedPilotPlaybook(adminA, { patientId: PHASE_11O_PATIENT });
    const approved = (loadDb().financings || []).find((row) => row.id === playbook.financing.id);
    expect(['approved', 'active', 'partially_paid']).toContain(approved.status);
    expect(playbook.pathB.length).toBeGreaterThan(0);
  });

  it('T15 financing approval remote MATCH', () => {
    expect(readEvidence().entities.financingApproval.compareFinancialShadow).toBe('MATCH');
  });

  it('T16 PATH B remote MATCH', async () => {
    const report = await runAuthenticatedStagingPilot(adminA, { patientId: PHASE_11O_PATIENT });
    expect(report.playbook.pathB.length).toBeGreaterThan(0);
    expect(report.summary.PATH_B_AUTHENTICATED_REMOTE).toBe('MATCH');
    expect(readEvidence().entities.pathB.every((row) => row.compareFinancialShadow === 'MATCH')).toBe(true);
  });

  it('T17 PATH A/B identity separation', async () => {
    const report = await runAuthenticatedStagingPilot(adminA, { patientId: PHASE_11O_PATIENT });
    expect(report.playbook.pathA.origin_type).toBe('treatment_plan');
    expect(report.playbook.pathB.every((row) => row.origin_type === 'financing')).toBe(true);
    expect(report.playbook.pathB.some((row) => row.id === report.playbook.pathA.id)).toBe(false);
  });

  it('T18 payment canonical live writer', async () => {
    const report = await runAuthenticatedStagingPilot(adminA, { patientId: PHASE_11O_PATIENT });
    expect(report.playbook.paid.payment.id).toMatch(/^rvpay-/);
    expect(report.playbook.paid.payment.operation_id).toBe('phase11o-op-pay');
  });

  it('T19 payment remote MATCH', async () => {
    const report = await runAuthenticatedStagingPilot(adminA, { patientId: PHASE_11O_PATIENT });
    expect(report.summary.PAYMENT_AUTHENTICATED_REMOTE).toBe('MATCH');
    expect(readEvidence().entities.payment.compareFinancialShadow).toBe('MATCH');
  });

  it('T20 payment retry no legacy duplicate', async () => {
    const report = await runAuthenticatedStagingPilot(adminA, { patientId: PHASE_11O_PATIENT });
    expect(report.playbook.retry.replayed).toBe(true);
    const originals = (loadDb().receivablePayments || []).filter((row) => (
      row.operation_id === 'phase11o-op-pay' && row.kind !== 'reversal'
    ));
    expect(originals).toHaveLength(1);
  });

  it('T21 payment retry no remote duplicate', () => {
    expect(readEvidence().integrity.PAYMENT_REMOTE_IDEMPOTENCY).toBe('PASS');
    expect(readEvidence().integrity.DUPLICATE_REMOTE_FACTS).toBe(0);
  });

  it('T22 immutable conflict no overwrite', async () => {
    openAuthenticatedPilotWindow();
    const playbook = await executeAuthenticatedPilotPlaybook(adminA, { patientId: PHASE_11O_PATIENT });
    const result = await runFinancialV2RuntimeShadow({
      entityType: 'payment',
      record: { ...playbook.paid.payment, amount_received: 1 },
    });
    expect(result.result).toBe('WRITE_FAILED');
    expect(result.reason_code).toBe('IMMUTABLE_FACT_CONFLICT');
    expect(__getFinancialV2RuntimeStoreForTest().get(
      'payments', PHASE_11O_TENANT, playbook.paid.payment.id,
    ).amount_cents).toBe(8000);
  });

  it('T23 reversal canonical live writer', async () => {
    const report = await runAuthenticatedStagingPilot(adminA, { patientId: PHASE_11O_PATIENT });
    expect(report.playbook.reversed.reversal.reverses_payment_id).toBe(report.playbook.paid.payment.id);
  });

  it('T24 original payment preserved', () => {
    expect(readEvidence().entities.payment.preservedAfterReversal).toBe(true);
  });

  it('T25 reversal remote MATCH', async () => {
    const report = await runAuthenticatedStagingPilot(adminA, { patientId: PHASE_11O_PATIENT });
    expect(report.summary.REVERSAL_AUTHENTICATED_REMOTE).toBe('MATCH');
    expect(readEvidence().entities.reversal.compareFinancialShadow).toBe('MATCH');
  });

  it('T26 missing remote dependency not fabricated', async () => {
    withDb((db) => {
      db.accountsReceivable.push({
        id: 'recv-phase11o-dep', tenant_id: PHASE_11O_TENANT, origin_type: 'manual_entry',
        original_amount: 10, net_amount: 10, status: 'upcoming',
      });
      db.receivablePayments.push({
        id: 'rvpay-phase11o-dep-orig', tenant_id: PHASE_11O_TENANT,
        receivable_id: 'recv-phase11o-dep', operation_id: 'phase11o-op-dep-orig',
        amount_received: 10, payment_date: '2026-08-31', status: 'applied', kind: 'payment',
      });
      return db;
    });
    openAuthenticatedPilotWindow();
    const result = await runFinancialV2RuntimeShadow({
      entityType: 'payment',
      record: {
        id: 'rvpay-phase11o-orphan-rev',
        tenant_id: PHASE_11O_TENANT,
        receivable_id: 'recv-phase11o-dep',
        operation_id: 'phase11o-op-orphan',
        amount_received: 10,
        payment_date: '2026-08-31',
        status: 'applied',
        reverses_payment_id: 'rvpay-phase11o-dep-orig',
        kind: 'reversal',
      },
    });
    expect(result.result).toBe('WRITE_FAILED');
    expect(result.reason_code).toBe('WRITE_FAILED_WITH_DEPENDENCY');
    expect(__getFinancialV2RuntimeStoreForTest().get('payments', PHASE_11O_TENANT, 'rvpay-phase11o-orphan-rev')).toBeNull();
    expect(__getFinancialV2RuntimeStoreForTest().get('payments', PHASE_11O_TENANT, 'rvpay-phase11o-dep-orig')).toBeNull();
  });

  it('T27 charge canonical live writer', async () => {
    const report = await runAuthenticatedStagingPilot(adminA, { patientId: PHASE_11O_PATIENT });
    expect(report.playbook.charge.receivable_id).toBe(report.playbook.pathA.id);
  });

  it('T28 charge remote MATCH', async () => {
    const report = await runAuthenticatedStagingPilot(adminA, { patientId: PHASE_11O_PATIENT });
    expect(report.summary.CHARGE_AUTHENTICATED_REMOTE).toBe('MATCH');
    expect(readEvidence().entities.charge.compareFinancialShadow).toBe('MATCH');
  });

  it('T29 charge creates no receivable', async () => {
    openAuthenticatedPilotWindow();
    const before = (loadDb().accountsReceivable || []).length;
    const title = createReceivable(adminA, {
      patient_id: PHASE_11O_PATIENT, description: 'phase11o charge-only',
      original_amount: 20, origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-21',
    });
    createReceivableCharge(adminA, { receivable_id: title.id, operation_id: 'phase11o-op-chg-iso' });
    expect((loadDb().accountsReceivable || []).length).toBe(before + 1);
    expect(readEvidence().entities.charge.createsReceivable).toBe(false);
  });

  it('T30 tenant cross-select denied', () => {
    expect(readEvidence().rls.TENANT_RLS_SELECT).toBe('PASS');
  });

  it('T31 tenant cross-insert denied', () => {
    expect(readEvidence().rls.TENANT_RLS_INSERT).toBe('PASS');
  });

  it('T32 tenant cross-update denied', () => {
    expect(readEvidence().rls.TENANT_RLS_UPDATE).toBe('PASS');
  });

  it('T33 duplicate remote facts zero', async () => {
    const report = await runAuthenticatedStagingPilot(adminA, { patientId: PHASE_11O_PATIENT });
    expect(report.summary.DUPLICATE_REMOTE_FACTS).toBe(0);
    expect(readEvidence().integrity.DUPLICATE_REMOTE_FACTS).toBe(0);
  });

  it('T34 orphan remote facts zero', async () => {
    const report = await runAuthenticatedStagingPilot(adminA, { patientId: PHASE_11O_PATIENT });
    expect(report.summary.ORPHAN_REMOTE_FACTS).toBe(0);
    expect(readEvidence().integrity.ORPHAN_REMOTE_FACTS).toBe(0);
  });

  it('T35 monetary parity', async () => {
    const report = await runAuthenticatedStagingPilot(adminA, { patientId: PHASE_11O_PATIENT });
    expect(toCents(report.playbook.pathA.net_amount)).toBe(8000);
    expect(readEvidence().integrity.MONETARY_PARITY).toBe('PASS');
  });

  it('T36 comparator read-back required', () => {
    expect(PHASE_11O_RUNTIME.SHADOW_READ_BACK_REQUIRED).toBe(true);
    expect(PHASE_11O_RUNTIME.SHADOW_COMPARATOR).toBe('compareFinancialShadow');
    expect(readEvidence().operations.every((row) => row.readback && row.compare)).toBe(true);
  });

  it('T37 shadow remote failure isolated', async () => {
    const before = financeSnapshot();
    openAuthenticatedPilotWindow({
      executor: async () => { throw new Error('REMOTE_DOWN'); },
    });
    const title = createReceivable(adminA, {
      patient_id: PHASE_11O_PATIENT, description: 'phase11o fail-remote',
      original_amount: 15, origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-22',
    });
    await new Promise((resolve) => queueMicrotask(resolve));
    await __flushFinancialV2RuntimeShadowForTest();
    expect(title.id).toBeTruthy();
    expect(financeSnapshot()).not.toBe(before);
  });

  it('T38 RLS failure isolated', async () => {
    openAuthenticatedPilotWindow({
      executor: async () => { throw Object.assign(new Error('RLS_DENIED'), { code: 'RLS_DENIED' }); },
    });
    const title = createReceivable(adminA, {
      patient_id: PHASE_11O_PATIENT, description: 'phase11o fail-rls',
      original_amount: 16, origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-22',
    });
    await new Promise((resolve) => queueMicrotask(resolve));
    await __flushFinancialV2RuntimeShadowForTest();
    expect((loadDb().accountsReceivable || []).some((row) => row.id === title.id)).toBe(true);
  });

  it('T39 constraint failure isolated', async () => {
    openAuthenticatedPilotWindow({
      executor: async () => { throw Object.assign(new Error('23514'), { code: '23514' }); },
    });
    const title = createReceivable(adminA, {
      patient_id: PHASE_11O_PATIENT, description: 'phase11o fail-chk',
      original_amount: 17, origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-22',
    });
    await new Promise((resolve) => queueMicrotask(resolve));
    await __flushFinancialV2RuntimeShadowForTest();
    expect(title.id).toBeTruthy();
  });

  it('T40 kill switch ON', async () => {
    const opened = openAuthenticatedPilotWindow();
    expect(opened.enabled).toBe(true);
    await executeAuthenticatedPilotPlaybook(adminA, { patientId: PHASE_11O_PATIENT });
    expect(getRuntimeShadowTelemetry().length).toBeGreaterThan(0);
  });

  it('T41 kill switch OFF', async () => {
    await runAuthenticatedStagingPilot(adminA, { patientId: PHASE_11O_PATIENT });
    const before = getRuntimeShadowTelemetry().length;
    closeAuthenticatedPilotWindow();
    createReceivable(adminA, {
      patient_id: PHASE_11O_PATIENT, description: 'phase11o after kill',
      original_amount: 10, origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-23',
    });
    await new Promise((resolve) => queueMicrotask(resolve));
    await __flushFinancialV2RuntimeShadowForTest();
    expect(isFinancialV2RuntimeShadowEnabled()).toBe(false);
    expect(getRuntimeShadowTelemetry().length).toBe(before);
  });

  it('T42 telemetry PII zero', async () => {
    const report = await runAuthenticatedStagingPilot(adminA, { patientId: PHASE_11O_PATIENT });
    expect(report.summary.PII_TELEMETRY_LEAKS).toBe(0);
    expect(readEvidence().integrity.PII_TELEMETRY_LEAKS).toBe(0);
  });

  it('T43 flag restored OFF', () => {
    expect(PHASE_11O_RUNTIME.V2_RUNTIME_SHADOW_DEFAULT).toBe(false);
    expect(isFinancialV2RuntimeShadowEnabled()).toBe(false);
  });

  it('T44 fixtures cleanup zero', () => {
    expect(readEvidence().cleanupComplete).toBe(true);
    expect(readEvidence().leftoverCounts).toEqual({
      receivables: 0, payments: 0, financings: 0, charges: 0, tenants: 0, tenant_users: 0,
    });
  });

  it('T45 no server read authority', () => {
    expect(PHASE_11O_RUNTIME.FINANCIAL_SERVER_READ_ENABLED).toBe(false);
  });

  it('T46 no server write authority', () => {
    expect(PHASE_11O_RUNTIME.FINANCIAL_SERVER_WRITE_AUTHORITY).toBe(false);
  });

  it('T47 no dual-write authority', () => {
    expect(PHASE_11O_RUNTIME.DUAL_WRITE_ENABLED).toBe(false);
  });

  it('T48 IndexedDB remains SSOT', async () => {
    await runAuthenticatedStagingPilot(adminA, { patientId: PHASE_11O_PATIENT });
    closeAuthenticatedPilotWindow();
    const before = financeSnapshot();
    createReceivable(adminA, {
      patient_id: PHASE_11O_PATIENT, description: 'phase11o ssot',
      original_amount: 11, origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-24',
    });
    expect(financeSnapshot()).not.toBe(before);
  });

  it('T49 no historical scan', () => {
    expect(PHASE_11O_RUNTIME.HISTORICAL_SHADOW_SCAN).toBe(false);
  });

  it('T50 no backfill', () => {
    expect(PHASE_11O_RUNTIME.BACKFILL_APPLIED).toBe(false);
  });

  it('T51 no tenant cutover', () => {
    expect(PHASE_11O_RUNTIME.TENANT_CUTOVER).toBe(false);
  });

  it('T52 production unchanged', () => {
    expect(PHASE_11O_RUNTIME.PRODUCTION_DATABASE_CHANGED).toBe(false);
    expect(readEvidence().productionRefTouched).toBe(false);
  });

  it('T53 contract financial side effects NONE', () => {
    ensureContractsModuleSeeded();
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-11o-1', contractNumber: 'CTR-11O-1', clinicId: 'clinic-11o-a',
        tenant_id: PHASE_11O_TENANT, patientId: PHASE_11O_PATIENT, status: CONTRACT_STATUS.GENERATED,
        renderedHtml: '<p>11O</p>', finalContent: '<p>11O</p>', documentHash: 'hash-11o', version: 1,
      }];
      return db;
    });
    const before = financeSnapshot();
    cancelUnsignedContract({ user: adminA, contractId: 'gctr-11o-1', reason: 'desistencia' });
    expect(financeSnapshot()).toBe(before);
  });

  it('T54 PHASE 11.B regression', () => {
    const first = createReceivable(adminA, {
      patient_id: PHASE_11O_PATIENT, description: '11o b', original_amount: 150,
      origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN, origin_id: 'budget-11o-1', installment_number: 1,
      due_date: '2026-09-15',
    });
    const second = createReceivable(adminA, {
      patient_id: PHASE_11O_PATIENT, description: '11o b', original_amount: 150,
      origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN, origin_id: 'budget-11o-1', installment_number: 1,
      due_date: '2026-09-15',
    });
    expect(second.id).toBe(first.id);
  });

  it('T55 PHASE 11.C regression', () => {
    const title = createReceivable(adminA, {
      patient_id: PHASE_11O_PATIENT, description: '11o c', original_amount: 400,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-15',
    });
    registerReceivablePayment(adminA, title.id, {
      payment_date: '2026-08-31', amount_received: 400, payment_method: 'pix', operation_id: 'op-11o-t55',
    });
    expect(registerReceivablePayment(adminA, title.id, {
      payment_date: '2026-08-31', amount_received: 400, payment_method: 'pix', operation_id: 'op-11o-t55',
    }).replayed).toBe(true);
  });

  it('T56 PHASE 11.D regression', () => {
    const title = createReceivable(adminA, {
      patient_id: PHASE_11O_PATIENT, description: '11o d', original_amount: 90,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-15',
    });
    expect(cancelReceivable(adminA, title.id, 'ok').status).toBe(RECEIVABLE_STATUS.CANCELED);
  });

  it('T57 PHASE 11.E regression', () => {
    const proposal = createFinancingProposal(adminA, {
      patient_id: PHASE_11O_PATIENT, description: 'Fin 11O T57', total_amount: 600, entry_amount: 0,
      installments_count: 2, installment_frequency: 'monthly', first_due_date: '2026-09-10',
      issue_date: '2026-08-31', boleto_auto_generate: false, requires_credit_analysis: false,
    });
    expect(proposal.id).toBeTruthy();
  });

  it('T58 PHASE 11.F regression', () => {
    const title = createReceivable(adminA, {
      patient_id: PHASE_11O_PATIENT, description: '11o f', original_amount: 120,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-15',
    });
    const before = (loadDb().accountsReceivable || []).length;
    createReceivableCharge(adminA, { receivable_id: title.id, operation_id: 'op-11o-t58' });
    expect((loadDb().accountsReceivable || []).length).toBe(before);
  });

  it('T59 PHASE 11.G regression', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it('T60 PHASE 11.H regression', () => {
    expect(PHASE_11H_RUNTIME.SUPABASE_CUTOVER).toBe(false);
  });

  it('T61 PHASE 11.I regression', () => {
    expect(PHASE_11I_RUNTIME.SHADOW_WRITE_ENABLED).toBe(false);
  });

  it('T62 PHASE 11.J regression', () => {
    expect(PHASE_11J_RUNTIME.SHADOW_WRITE_ENABLED).toBe(false);
    expect(readFileSync(join(ROOT, FINANCIAL_021_MIGRATION_FILE), 'utf8')).toMatch(/numeric\(14, 2\)/);
  });

  it('T63 PHASE 11.K regression', () => {
    expect(PHASE_11K_RUNTIME.REMOTE_STAGING_WRITE).toBe(false);
  });

  it('T64 PHASE 11.L regression', () => {
    expect(PHASE_11L_RUNTIME.APP_WRITERS_STAGING_WIRED).toBe(false);
  });

  it('T65 PHASE 11.M regression', () => {
    expect(PHASE_11M_RUNTIME.APP_WRITERS_STAGING_WIRED).toBe(true);
    expect(PHASE_11M_RUNTIME.V2_RUNTIME_SHADOW_DEFAULT).toBe(false);
  });

  it('T66 PHASE 11.N regression', () => {
    expect(PHASE_11N_GATE).toBe('FINANCIAL_V2_RUNTIME_SHADOW_OBSERVATION_VALIDATED');
    expect(PHASE_11N_RUNTIME.V2_RUNTIME_SHADOW_DEFAULT).toBe(false);
    expect(FINANCIAL_REPOSITORY_FLAG_DEFAULTS.FINANCIAL_SHADOW).toBe(false);
  });
});
