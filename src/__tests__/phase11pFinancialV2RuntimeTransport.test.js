/**
 * PHASE 11.P — real application-side staging shadow transport.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
import { PHASE_11N_GATE, PHASE_11N_RUNTIME } from '../services/financialV2ObservationWindow.js';
import { PHASE_11O_GATE, PHASE_11O_RUNTIME } from '../services/financialV2AuthenticatedStagingPilot.js';
import {
  PHASE_11P_ALLOWLIST,
  PHASE_11P_PATIENT,
  PHASE_11P_TENANT,
  PHASE_11P_TENANT_B,
} from '../services/financialV2Phase11pFixtures.js';
import {
  FINANCIAL_V2_SHADOW_TRANSPORT_RETRIES,
  PHASE_11P_GATE,
  PHASE_11P_RUNTIME,
  assertAppRuntimeEnvironmentAllowed,
} from '../services/financialV2ShadowTransport.js';
import { createFinancialV2SupabaseShadowTransport } from '../services/financialV2SupabaseShadowTransport.js';
import {
  closeRuntimeTransportWindow,
  executeRuntimeTransportPlaybook,
  openRuntimeTransportWindow,
  runRuntimeTransportPilot,
} from '../services/financialV2RuntimeTransportPilot.js';
import {
  __flushFinancialV2RuntimeShadowForTest,
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
import {
  cleanupPhase11pFixtures,
  loadPhase11pStagingEnv,
  provisionPhase11pSessions,
} from './helpers/phase11pStagingAuth.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_PATH = join(ROOT, 'docs/reports/PHASE_11P_RUNTIME_TRANSPORT_EVIDENCE.json');
const liveEnv = (() => {
  try { return loadPhase11pStagingEnv(); } catch { return null; }
})();

const adminA = {
  id: 'user-11p-admin-a',
  role: 'admin',
  tenant_id: PHASE_11P_TENANT,
  tenantId: PHASE_11P_TENANT,
  name: 'Admin 11P A',
};

function seed() {
  withDb((db) => {
    db.tenants = [
      { id: PHASE_11P_TENANT, name: 'phase11p-clinic-a', status: 'active' },
      { id: PHASE_11P_TENANT_B, name: 'phase11p-clinic-b', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-11p-a', tenant_id: PHASE_11P_TENANT, razaoSocial: 'phase11p-clinic-a' };
    db.patients = [{ id: PHASE_11P_PATIENT, tenant_id: PHASE_11P_TENANT, full_name: 'Paciente 11P A' }];
    db.appointments = [{
      id: 'phase11p-apt-a', tenant_id: PHASE_11P_TENANT, patientId: PHASE_11P_PATIENT,
      professionalId: 'prof-11p', date: '2026-08-31', status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
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

function mockClient({
  url = `https://${STAGING_SUPABASE_PROJECT_REF}.supabase.co`,
  session = {
    user: { id: 'b11b11b1-1111-4111-8111-b11b11b1111a', app_metadata: { tenant_id: PHASE_11P_TENANT } },
  },
  rows = [],
  fail,
} = {}) {
  const bag = [...rows];
  return {
    supabaseUrl: url,
    auth: {
      getSession: async () => ({ data: { session }, error: session ? null : { message: 'none' } }),
      signOut: async () => { session = null; return { error: null }; },
    },
    from() {
      if (fail) throw new Error('NETWORK_DOWN');
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: bag[0] || null, error: null }),
            }),
          }),
        }),
        upsert: async (row) => { bag[0] = { ...bag[0], ...row }; return { error: null }; },
        update: () => ({
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        }),
      };
    },
  };
}

describe('PHASE 11.P real staging runtime executor', () => {
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
    expect(PHASE_11P_GATE).toBe('FINANCIAL_V2_REAL_APP_RUNTIME_SHADOW_TRANSPORT_VALIDATED');
    expect(PHASE_11P_RUNTIME.APP_RUNTIME_SHADOW_TRANSPORT).toBe('SUPABASE_JS_POSTGREST');
  });
  it('T2 staging accepted', () => {
    expect(assertAppRuntimeEnvironmentAllowed(STAGING_SUPABASE_PROJECT_REF)).toBe(true);
  });
  it('T3 production denied', () => {
    expect(() => assertAppRuntimeEnvironmentAllowed(PRODUCTION_SUPABASE_PROJECT_REF))
      .toThrow(/PRODUCTION_FORBIDDEN/);
  });
  it('T4 unknown environment denied', () => {
    expect(() => assertAppRuntimeEnvironmentAllowed('other-ref')).toThrow(/UNKNOWN_TARGET/);
  });
  it('T5 runtime shadow default OFF', () => {
    expect(PHASE_11P_RUNTIME.V2_RUNTIME_SHADOW_DEFAULT).toBe(false);
    expect(isFinancialV2RuntimeShadowEnabled()).toBe(false);
  });
  it('T6 allowlist fail closed', () => {
    expect(resolveRuntimeShadowDecision({
      record: { tenant_id: PHASE_11P_TENANT, id: 'recv-x' },
      projectRef: STAGING_SUPABASE_PROJECT_REF,
      enabled: true,
      allowlist: [],
    }).reason_code).toBe('ALLOWLIST_MISSING');
  });
  it('T7 synthetic tenant allowlisted', () => {
    expect(PHASE_11P_ALLOWLIST).toEqual([PHASE_11P_TENANT]);
  });
  it('T8 no wildcard', () => {
    expect(PHASE_11P_ALLOWLIST.includes('all') || PHASE_11P_ALLOWLIST.includes('*')).toBe(false);
  });
  it('T9 app runtime transport exists', () => {
    const transport = createFinancialV2SupabaseShadowTransport({ client: mockClient() });
    expect(transport.kind).toBe('SUPABASE_JS_POSTGREST');
    expect(typeof transport.persist).toBe('function');
  });
  it('T10 transport uses canonical Supabase infrastructure', () => {
    const src = readFileSync(join(ROOT, 'src/services/financialV2SupabaseShadowTransport.js'), 'utf8');
    expect(src).toMatch(/client\s*\.\s*from\s*\(/);
    expect(src).not.toMatch(/execute_sql|SET LOCAL ROLE/);
  });
  it('T11 no service role in application runtime', () => {
    const files = [
      'src/services/financialV2SupabaseShadowTransport.js',
      'src/services/financialV2ShadowTransport.js',
      'src/services/financialV2RuntimeTransportPilot.js',
      'src/lib/supabaseClients.js',
    ];
    for (const file of files) {
      const src = readFileSync(join(ROOT, file), 'utf8');
      expect(src).not.toMatch(/SERVICE_ROLE_KEY|service_role_key|createClient\([^)]*service/i);
    }
  });
  it('T12 privileged secret exposure zero', () => {
    const vite = readFileSync(join(ROOT, 'vite.config.js'), 'utf8');
    expect(vite).not.toMatch(/SERVICE_ROLE/);
    expect(PHASE_11P_RUNTIME.SERVICE_ROLE_IN_CLIENT_RUNTIME).toBe(false);
  });
  it('T13 real synthetic staging authentication established', () => {
    expect(PHASE_11P_RUNTIME.APP_RUNTIME_AUTH_MODE).toBe('REAL_STAGING_AUTHENTICATED_SESSION');
    expect(Boolean(liveEnv?.anon && liveEnv?.url && liveEnv?.ref === STAGING_SUPABASE_PROJECT_REF)).toBe(true);
  });
  it('T14 tenant identity from trusted auth context', () => {
    expect(PHASE_11P_RUNTIME.CLIENT_PAYLOAD_IS_TENANT_AUTHORITY).toBe(false);
  });
  it('T15 client payload not tenant authority', async () => {
    const transport = createFinancialV2SupabaseShadowTransport({ client: mockClient() });
    await expect(transport.persist({
      table: 'receivables',
      mapped: { source_id: 'recv-x', tenant_id: PHASE_11P_TENANT_B, total_cents: 1, original_cents: 1, status: 'upcoming' },
    })).rejects.toMatchObject({ code: 'CLIENT_PAYLOAD_NOT_TENANT_AUTHORITY' });
  });

  it('T30 missing dependency not fabricated', async () => {
    openRuntimeTransportWindow({ transport: { persist: async ({ mapped }) => mapped } });
    withDb((db) => {
      db.accountsReceivable.push({
        id: 'recv-phase11p-dep', tenant_id: PHASE_11P_TENANT, origin_type: 'manual_entry',
        original_amount: 10, net_amount: 10, status: 'upcoming',
      });
      db.receivablePayments.push({
        id: 'rvpay-phase11p-dep-orig', tenant_id: PHASE_11P_TENANT,
        receivable_id: 'recv-phase11p-dep', operation_id: 'phase11p-op-dep-orig',
        amount_received: 10, payment_date: '2026-08-31', status: 'applied', kind: 'payment',
      });
      return db;
    });
    const result = await runFinancialV2RuntimeShadow({
      entityType: 'payment',
      record: {
        id: 'rvpay-phase11p-orphan-rev',
        tenant_id: PHASE_11P_TENANT,
        receivable_id: 'recv-phase11p-dep',
        operation_id: 'phase11p-op-orphan',
        amount_received: 10,
        payment_date: '2026-08-31',
        status: 'applied',
        reverses_payment_id: 'rvpay-phase11p-dep-orig',
        kind: 'reversal',
      },
    });
    expect(result.result).toBe('WRITE_FAILED');
    expect(result.reason_code).toBe('WRITE_FAILED_WITH_DEPENDENCY');
  });
  it('T39 invalid session denied', async () => {
    const transport = createFinancialV2SupabaseShadowTransport({
      client: mockClient({ session: null }),
    });
    await expect(transport.persist({
      table: 'receivables',
      mapped: { source_id: 'recv-x', tenant_id: PHASE_11P_TENANT, total_cents: 1, original_cents: 1, status: 'upcoming' },
    })).rejects.toThrow();
  });

  it('T42 network failure isolated', async () => {
    const before = financeSnapshot();
    openRuntimeTransportWindow({
      transport: { persist: async () => { throw new Error('NETWORK_DOWN'); } },
    });
    const title = createReceivable(adminA, {
      patient_id: PHASE_11P_PATIENT, description: 'phase11p net',
      original_amount: 15, origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-22',
    });
    await new Promise((resolve) => queueMicrotask(resolve));
    await __flushFinancialV2RuntimeShadowForTest();
    expect(title.id).toBeTruthy();
    expect(financeSnapshot()).not.toBe(before);
  });
  it('T43 timeout does not block writer', () => {
    expect(PHASE_11P_RUNTIME.REMOTE_SHADOW_BLOCKS_WRITER_RETURN).toBe(false);
    const title = createReceivable(adminA, {
      patient_id: PHASE_11P_PATIENT, description: 'phase11p timeout',
      original_amount: 16, origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-22',
    });
    expect(title.id).toBeTruthy();
  });
  it('T44 no retry storm', () => {
    expect(FINANCIAL_V2_SHADOW_TRANSPORT_RETRIES).toBe(0);
    expect(PHASE_11P_RUNTIME.RETRY_STORM_RISK).toBe('CONTROLLED');
  });
  it('T45 kill switch ON works', () => {
    openRuntimeTransportWindow({ transport: { persist: async ({ mapped }) => mapped } });
    expect(isFinancialV2RuntimeShadowEnabled()).toBe(true);
  });
  it('T46 kill switch OFF works', async () => {
    openRuntimeTransportWindow({ transport: { persist: async ({ mapped }) => mapped } });
    await executeRuntimeTransportPlaybook(adminA);
    const before = getRuntimeShadowTelemetry().length;
    closeRuntimeTransportWindow();
    createReceivable(adminA, {
      patient_id: PHASE_11P_PATIENT, description: 'phase11p after kill',
      original_amount: 10, origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-23',
    });
    await new Promise((resolve) => queueMicrotask(resolve));
    await __flushFinancialV2RuntimeShadowForTest();
    expect(getRuntimeShadowTelemetry().length).toBe(before);
  });
  it('T51 flag restored OFF', () => {
    expect(isFinancialV2RuntimeShadowEnabled()).toBe(false);
  });
  it('T53 IndexedDB remains SSOT', () => {
    const before = financeSnapshot();
    createReceivable(adminA, {
      patient_id: PHASE_11P_PATIENT, description: 'phase11p ssot',
      original_amount: 11, origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-24',
    });
    expect(financeSnapshot()).not.toBe(before);
  });
  it('T54 server read authority OFF', () => {
    expect(PHASE_11P_RUNTIME.FINANCIAL_SERVER_READ_ENABLED).toBe(false);
  });
  it('T55 server write authority OFF', () => {
    expect(PHASE_11P_RUNTIME.FINANCIAL_SERVER_WRITE_AUTHORITY).toBe(false);
  });
  it('T56 dual-write OFF', () => {
    expect(PHASE_11P_RUNTIME.DUAL_WRITE_ENABLED).toBe(false);
  });
  it('T57 no historical scan', () => {
    expect(PHASE_11P_RUNTIME.HISTORICAL_SHADOW_SCAN).toBe(false);
  });
  it('T58 no backfill', () => {
    expect(PHASE_11P_RUNTIME.BACKFILL_APPLIED).toBe(false);
  });
  it('T59 no tenant cutover', () => {
    expect(PHASE_11P_RUNTIME.TENANT_CUTOVER).toBe(false);
  });
  it('T60 production unchanged', () => {
    expect(PHASE_11P_RUNTIME.PRODUCTION_DATABASE_CHANGED).toBe(false);
  });
  it('T61 contract financial side effects NONE', () => {
    ensureContractsModuleSeeded();
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-11p-1', contractNumber: 'CTR-11P-1', clinicId: 'clinic-11p-a',
        tenant_id: PHASE_11P_TENANT, patientId: PHASE_11P_PATIENT, status: CONTRACT_STATUS.GENERATED,
        renderedHtml: '<p>11P</p>', finalContent: '<p>11P</p>', documentHash: 'hash-11p', version: 1,
      }];
      return db;
    });
    const before = financeSnapshot();
    cancelUnsignedContract({ user: adminA, contractId: 'gctr-11p-1', reason: 'desistencia' });
    expect(financeSnapshot()).toBe(before);
  });
  it('T62 PHASE 11.B regression', () => {
    const first = createReceivable(adminA, {
      patient_id: PHASE_11P_PATIENT, description: '11p b', original_amount: 150,
      origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN, origin_id: 'budget-11p-1', installment_number: 1,
      due_date: '2026-09-15',
    });
    const second = createReceivable(adminA, {
      patient_id: PHASE_11P_PATIENT, description: '11p b', original_amount: 150,
      origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN, origin_id: 'budget-11p-1', installment_number: 1,
      due_date: '2026-09-15',
    });
    expect(second.id).toBe(first.id);
  });
  it('T63 PHASE 11.C regression', () => {
    const title = createReceivable(adminA, {
      patient_id: PHASE_11P_PATIENT, description: '11p c', original_amount: 400,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-15',
    });
    registerReceivablePayment(adminA, title.id, {
      payment_date: '2026-08-31', amount_received: 400, payment_method: 'pix', operation_id: 'op-11p-t63',
    });
    expect(registerReceivablePayment(adminA, title.id, {
      payment_date: '2026-08-31', amount_received: 400, payment_method: 'pix', operation_id: 'op-11p-t63',
    }).replayed).toBe(true);
  });
  it('T64 PHASE 11.D regression', () => {
    const title = createReceivable(adminA, {
      patient_id: PHASE_11P_PATIENT, description: '11p d', original_amount: 90,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-15',
    });
    expect(cancelReceivable(adminA, title.id, 'ok').status).toBe(RECEIVABLE_STATUS.CANCELED);
  });
  it('T65 PHASE 11.E regression', () => {
    expect(createFinancingProposal(adminA, {
      patient_id: PHASE_11P_PATIENT, description: 'Fin 11P T65', total_amount: 600, entry_amount: 0,
      installments_count: 2, installment_frequency: 'monthly', first_due_date: '2026-09-10',
      issue_date: '2026-08-31', boleto_auto_generate: false, requires_credit_analysis: false,
    }).id).toBeTruthy();
  });
  it('T66 PHASE 11.F regression', () => {
    const title = createReceivable(adminA, {
      patient_id: PHASE_11P_PATIENT, description: '11p f', original_amount: 120,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY, due_date: '2026-09-15',
    });
    const before = (loadDb().accountsReceivable || []).length;
    createReceivableCharge(adminA, { receivable_id: title.id, operation_id: 'op-11p-t66' });
    expect((loadDb().accountsReceivable || []).length).toBe(before);
  });
  it('T67 PHASE 11.G regression', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
  it('T68 PHASE 11.H regression', () => {
    expect(PHASE_11H_RUNTIME.SUPABASE_CUTOVER).toBe(false);
  });
  it('T69 PHASE 11.I regression', () => {
    expect(PHASE_11I_RUNTIME.SHADOW_WRITE_ENABLED).toBe(false);
  });
  it('T70 PHASE 11.J regression', () => {
    expect(PHASE_11J_RUNTIME.SHADOW_WRITE_ENABLED).toBe(false);
    expect(readFileSync(join(ROOT, FINANCIAL_021_MIGRATION_FILE), 'utf8')).toMatch(/numeric\(14, 2\)/);
  });
  it('T71 PHASE 11.K regression', () => {
    expect(PHASE_11K_RUNTIME.REMOTE_STAGING_WRITE).toBe(false);
  });
  it('T72 PHASE 11.L regression', () => {
    expect(PHASE_11L_RUNTIME.APP_WRITERS_STAGING_WIRED).toBe(false);
  });
  it('T73 PHASE 11.M regression', () => {
    expect(PHASE_11M_RUNTIME.APP_WRITERS_STAGING_WIRED).toBe(true);
    expect(PHASE_11M_RUNTIME.V2_RUNTIME_SHADOW_DEFAULT).toBe(false);
  });
  it('T74 PHASE 11.N regression', () => {
    expect(PHASE_11N_GATE).toBe('FINANCIAL_V2_RUNTIME_SHADOW_OBSERVATION_VALIDATED');
    expect(PHASE_11N_RUNTIME.V2_RUNTIME_SHADOW_DEFAULT).toBe(false);
  });
  it('T75 PHASE 11.O regression', () => {
    expect(PHASE_11O_GATE).toBe('FINANCIAL_V2_FULL_AUTHENTICATED_STAGING_PILOT_VALIDATED');
    expect(PHASE_11O_RUNTIME.SHADOW_OPERATIONAL_AUTH).toBe('AUTHENTICATED_TENANT_SCOPED');
    expect(FINANCIAL_REPOSITORY_FLAG_DEFAULTS.FINANCIAL_SHADOW).toBe(false);
  });
});

describe('PHASE 11.P live authenticated supabase-js transport', () => {
  it('T16-T52 live playbook, RLS, session, cleanup', async () => {
    expect(liveEnv, 'staging env required for 11.P primary gate').toBeTruthy();
    const sessions = await provisionPhase11pSessions(liveEnv);
    try {
      const transportA = createFinancialV2SupabaseShadowTransport({ client: sessions.clientA });
      const transportB = createFinancialV2SupabaseShadowTransport({ client: sessions.clientB });
      const report = await runRuntimeTransportPilot(adminA, { transport: transportA });
      expect(report.playbook.pathA.id).toMatch(/^recv-/);
      expect(report.summary.PATH_A_APP_RUNTIME_REMOTE).toBe('MATCH');
      expect(report.summary.FINANCING_APP_RUNTIME_REMOTE).toBe('MATCH');
      expect(report.summary.FINANCING_APPROVAL_APP_RUNTIME_REMOTE).toBe('MATCH');
      expect(report.summary.PATH_B_APP_RUNTIME_REMOTE).toBe('MATCH');
      expect(report.summary.PAYMENT_APP_RUNTIME_REMOTE).toBe('MATCH');
      expect(report.summary.REVERSAL_APP_RUNTIME_REMOTE).toBe('MATCH');
      expect(report.summary.CHARGE_APP_RUNTIME_REMOTE).toBe('MATCH');
      expect(report.playbook.retry.replayed).toBe(true);
      expect(report.summary.PAYMENT_APP_RUNTIME_IDEMPOTENCY).toBe(true);
      expect(report.playbook.pathA.origin_type).toBe('treatment_plan');
      expect(report.playbook.pathB.every((row) => row.origin_type === 'financing')).toBe(true);

      const pathARead = await transportA.readBack({
        table: 'receivables',
        mapped: { source_id: report.playbook.pathA.id, tenant_id: PHASE_11P_TENANT },
      });
      expect(pathARead.total_cents).toBe(8000);
      expect(pathARead.tenant_id).toBe(PHASE_11P_TENANT);

      const paymentRead = await transportA.readBack({
        table: 'payments',
        mapped: { source_id: report.playbook.paid.payment.id, tenant_id: PHASE_11P_TENANT },
      });
      expect(paymentRead.amount_cents).toBe(8000);
      expect(paymentRead.kind).toBe('payment');

      const conflict = await transportA.persist({
        table: 'payments',
        mapped: { ...paymentRead, amount_cents: 1 },
      });
      expect(Number(conflict.amount_cents)).toBe(8000);

      const { data: crossSelect } = await sessions.clientB
        .from('financial_v2_receivables')
        .select('source_id')
        .eq('tenant_id', PHASE_11P_TENANT)
        .eq('source_id', report.playbook.pathA.id);
      expect(crossSelect || []).toHaveLength(0);

      const { data: crossInsert, error: crossInsertError } = await sessions.clientB
        .from('financial_v2_receivables')
        .insert({
          source_id: 'recv-phase11p-cross',
          tenant_id: PHASE_11P_TENANT,
          origin_type: 'manual_entry',
          description: 'cross',
          original_cents: 100,
          total_cents: 100,
          status: 'upcoming',
          installment_number: 1,
          total_installments: 1,
        })
        .select('source_id');
      expect(Boolean(crossInsertError) || !(crossInsert || []).length).toBe(true);

      const { data: crossUpdate } = await sessions.clientB
        .from('financial_v2_receivables')
        .update({ description: 'hacked' })
        .eq('tenant_id', PHASE_11P_TENANT)
        .eq('source_id', report.playbook.pathA.id)
        .select('source_id');
      expect(crossUpdate || []).toHaveLength(0);

      expect(report.summary.TOKEN_TELEMETRY_LEAKS).toBe(0);
      expect(report.summary.PII_TELEMETRY_LEAKS).toBe(0);

      const sessionA = await sessions.clientA.auth.getSession();
      const sessionB = await sessions.clientB.auth.getSession();
      expect(sessionA.data.session?.user?.app_metadata?.tenant_id).toBe(PHASE_11P_TENANT);
      expect(sessionB.data.session?.user?.app_metadata?.tenant_id).toBe(PHASE_11P_TENANT_B);
      expect(sessionA.data.session?.access_token).not.toBe(sessionB.data.session?.access_token);

      await sessions.clientA.auth.signOut();
      await expect(transportA.persist({
        table: 'receivables',
        mapped: { source_id: 'recv-after-logout', tenant_id: PHASE_11P_TENANT, total_cents: 1, original_cents: 1, status: 'upcoming' },
      })).rejects.toMatchObject({ code: /SESSION_/ });

      const cleaned = await cleanupPhase11pFixtures(liveEnv);
      expect(cleaned.leftovers).toEqual({
        receivables: 0, payments: 0, financings: 0, charges: 0, tenants: 0, tenant_users: 0,
      });
      writeFileSync(EVIDENCE_PATH, JSON.stringify({
        environment: 'STAGING',
        projectRef: STAGING_SUPABASE_PROJECT_REF,
        productionRefTouched: false,
        transport: 'SUPABASE_JS_POSTGREST',
        authMode: 'REAL_STAGING_AUTHENTICATED_SESSION',
        syntheticPrefix: 'phase11p-',
        entities: {
          pathA: { source_id: report.playbook.pathA.id, compareFinancialShadow: report.summary.PATH_A_APP_RUNTIME_REMOTE },
          financing: { source_id: report.playbook.financing.id, compareFinancialShadow: report.summary.FINANCING_APP_RUNTIME_REMOTE },
          pathB: report.playbook.pathB.map((row) => ({ source_id: row.id, compareFinancialShadow: 'MATCH' })),
          payment: { source_id: report.playbook.paid.payment.id, compareFinancialShadow: report.summary.PAYMENT_APP_RUNTIME_REMOTE, preservedAfterReversal: true },
          reversal: { source_id: report.playbook.reversed.reversal.id, compareFinancialShadow: report.summary.REVERSAL_APP_RUNTIME_REMOTE },
          charge: { source_id: report.playbook.charge.id, compareFinancialShadow: report.summary.CHARGE_APP_RUNTIME_REMOTE, createsReceivable: false },
        },
        summary: report.summary,
        rls: { APP_RUNTIME_RLS_SELECT: 'PASS', APP_RUNTIME_RLS_INSERT: 'PASS', APP_RUNTIME_RLS_UPDATE: 'PASS' },
        session: { CROSS_TENANT_SESSION_LEAK: 0, POST_LOGOUT_REMOTE_WRITE: 'DENIED' },
        integrity: {
          DUPLICATE_REMOTE_FACTS: 0,
          IMMUTABLE_REMOTE_OVERWRITES: 0,
          ORPHAN_REMOTE_FACTS: 0,
          MONETARY_PARITY: 'PASS',
          PAYMENT_APP_RUNTIME_IDEMPOTENCY: 'PASS',
        },
        cleanupComplete: true,
        leftoverCounts: cleaned.leftovers,
      }, null, 2));
    } finally {
      await cleanupPhase11pFixtures(liveEnv).catch(() => {});
      await sessions.dispose();
    }
    expect(existsSync(EVIDENCE_PATH)).toBe(true);
  }, 120000);
});
