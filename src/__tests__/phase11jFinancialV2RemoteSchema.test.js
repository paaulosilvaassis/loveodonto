/**
 * PHASE 11.J — financial v2 remote schema, RLS & constraint validation.
 * Live apply is staging-only. Suite is deterministic against SQL + snapshot.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
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
  TARGET_TABLES,
} from '../contracts/financialCoreV2PersistenceContract.js';
import {
  CURRENT_TENANT_ID_FORMAT,
  DELETE_POLICY,
  FINANCIAL_021_MIGRATION_FILE,
  FINANCIAL_REPOSITORY_FLAG_DEFAULTS,
  FINANCIAL_V2_DRAFT_FILE,
  FINANCIAL_V2_MIGRATION_FILE,
  FINANCIAL_V2_TENANT_ID_TYPE,
  PHASE_11J_RUNTIME,
  PRODUCTION_SUPABASE_PROJECT_REF,
  RBAC_SERVER_BOUNDARY,
  REVERSAL_SERVICE_INVARIANTS,
  REVERSAL_SQL_INVARIANTS,
  STAGING_SUPABASE_PROJECT_REF,
  SUPABASE_TENANT_ID_FORMAT,
  TENANT_ID_MAPPING_REQUIRED,
  TENANT_ID_TYPE_RESOLVED,
  V2_CANONICAL_RECEIVABLE_STATUSES,
  V2_DESTRUCTIVE_CASCADE_PATHS,
  V2_FORBIDDEN_RECEIVABLE_STATUSES,
  V2_SQL_CONTRACT_PARITY_NOTES,
  V2_TABLES,
  isFinancialV2TenantId,
} from '../contracts/financialV2RemoteSchemaContract.js';
import { PHASE_11I_RUNTIME as FOUNDATION_11I_RUNTIME } from '../services/financialV2Foundation.js';
import { detectFinancialV2SchemaDrift, inspectFinancialV2MigrationSql } from '../services/financialV2SchemaDrift.js';
import { toCents } from '../services/receivableMoney.js';
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
import {
  approveFinancing,
  createFinancingProposal,
} from '../services/financingsService.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION_SQL_PATH = join(ROOT, FINANCIAL_V2_MIGRATION_FILE);
const DRAFT_SQL_PATH = join(ROOT, FINANCIAL_V2_DRAFT_FILE);
const LEGACY_021_PATH = join(ROOT, FINANCIAL_021_MIGRATION_FILE);
const SNAPSHOT_PATH = join(ROOT, 'docs/reports/PHASE_11J_STAGING_INTROSPECTION.json');

const TENANT_A = 'tenant-11j-a';
const TENANT_B = 'tenant-11j-b';
const PATIENT_A = 'patient-11j-a';
const APPT_A = 'apt-11j-a';

const adminA = {
  id: 'user-11j-admin-a', role: 'admin', tenant_id: TENANT_A, tenantId: TENANT_A, name: 'Admin 11J A',
};
const adminB = {
  id: 'user-11j-admin-b', role: 'admin', tenant_id: TENANT_B, tenantId: TENANT_B, name: 'Admin 11J B',
};

function readSql(path) {
  return readFileSync(path, 'utf8');
}

function snapshot() {
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
}

function seed() {
  withDb((db) => {
    db.tenants = [
      { id: TENANT_A, name: 'Clinica 11J A', status: 'active' },
      { id: TENANT_B, name: 'Clinica 11J B', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-11j-a', tenant_id: TENANT_A, razaoSocial: 'Clinica 11J A' };
    db.patients = [
      { id: PATIENT_A, tenant_id: TENANT_A, full_name: 'Paciente 11J A' },
      { id: 'patient-11j-b', tenant_id: TENANT_B, full_name: 'Paciente 11J B' },
    ];
    db.appointments = [{
      id: APPT_A, tenant_id: TENANT_A, patientId: PATIENT_A, professionalId: 'prof-11j',
      date: '2026-08-31', status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
    }];
    db.accountsReceivable = [];
    db.receivablePayments = [];
    db.financings = [];
    return db;
  });
}

function openReceivable(amount, extras = {}) {
  return createReceivable(adminA, {
    patient_id: PATIENT_A,
    description: extras.description || 'CR 11J',
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

describe('PHASE 11.J financial v2 remote schema', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seed();
  });
  afterEach(() => {});

  it('T1 SQL/local contract parity', () => {
    const migration = inspectFinancialV2MigrationSql(readSql(MIGRATION_SQL_PATH));
    const draft = readSql(DRAFT_SQL_PATH);
    expect(migration.ok).toBe(true);
    for (const table of Object.keys(TARGET_TABLES)) {
      expect(V2_TABLES).toContain(table);
      expect(migration.tablesFound).toContain(table);
      expect(draft).toMatch(new RegExp(`create table if not exists public\\.${table}`));
    }
    expect(V2_SQL_CONTRACT_PARITY_NOTES.draftQuarantineTable).toBe('OMITTED_FROM_APPLIED_MIGRATION');
    expect(draft).toMatch(/financial_v2_migration_quarantine/);
    expect(readSql(MIGRATION_SQL_PATH)).not.toMatch(/financial_v2_migration_quarantine/);
  });

  it('T2 tenant ID type resolved', () => {
    expect(TENANT_ID_TYPE_RESOLVED).toBe(true);
    expect(FINANCIAL_V2_TENANT_ID_TYPE).toBe('UUID');
    expect(SUPABASE_TENANT_ID_FORMAT).toBe('UUID');
    expect(FINANCIAL_V2_TENANT_ID_TYPE).toBe('UUID');
    expect(CURRENT_TENANT_ID_FORMAT).toMatch(/UUID/);
    expect(TENANT_ID_MAPPING_REQUIRED).toBe('YES_FOR_NON_UUID_IDB_QUARANTINE_ONLY');
    expect(isFinancialV2TenantId('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isFinancialV2TenantId('tenant-11i-a')).toBe(false);
    expect(isFinancialV2TenantId(TENANT_A)).toBe(false);
  });

  it('T3 V2 tables exist', () => {
    const live = snapshot();
    expect(live.environment).toBe('STAGING');
    expect(live.projectRef).toBe(STAGING_SUPABASE_PROJECT_REF);
    expect(live.projectRef).not.toBe(PRODUCTION_SUPABASE_PROJECT_REF);
    expect(live.tables.sort()).toEqual([...V2_TABLES].sort());
    expect(PHASE_11J_RUNTIME.FINANCIAL_V2_SCHEMA_APPLIED).toBe(true);
  });

  it('T4 tenant_id NOT NULL', () => {
    const inspected = inspectFinancialV2MigrationSql(readSql(MIGRATION_SQL_PATH));
    expect(inspected.tenantUuidNotNull).toBe(true);
    expect(snapshot().tenantIdNullable).toEqual([]);
  });

  it('T5 money BIGINT', () => {
    const inspected = inspectFinancialV2MigrationSql(readSql(MIGRATION_SQL_PATH));
    expect(inspected.floatMoneyColumns).toBe(0);
    expect(inspected.hasNumericMoney).toBe(false);
    expect(inspected.hasDouble).toBe(false);
    expect(snapshot().floatMoneyColumns).toBe(0);
  });

  it('T6 no legacy open default', () => {
    const sql = readSql(MIGRATION_SQL_PATH);
    expect(sql).not.toMatch(/default\s+'open'/i);
    for (const status of V2_CANONICAL_RECEIVABLE_STATUSES) {
      expect(sql).toMatch(new RegExp(`'${status}'`));
    }
    for (const status of V2_FORBIDDEN_RECEIVABLE_STATUSES) {
      expect(sql).not.toMatch(new RegExp(`fv2_recv_status_chk[\\s\\S]{0,400}'${status}'`));
    }
  });

  it('T7 receivable identity unique', () => {
    expect(inspectFinancialV2MigrationSql(readSql(MIGRATION_SQL_PATH)).identities.receivableObligation).toBe(true);
    expect(snapshot().synthetic.receivableDuplicateRejected).toBe(true);
    expect(snapshot().synthetic.receivableCrossTenantAllowed).toBe(true);
  });

  it('T8 payment operation unique', () => {
    expect(inspectFinancialV2MigrationSql(readSql(MIGRATION_SQL_PATH)).identities.paymentOperation).toBe(true);
    expect(snapshot().synthetic.paymentDuplicateRejected).toBe(true);
    expect(snapshot().synthetic.paymentCrossTenantAllowed).toBe(true);
  });

  it('T9 financing active identity unique', () => {
    expect(inspectFinancialV2MigrationSql(readSql(MIGRATION_SQL_PATH)).identities.financingActive).toBe(true);
    expect(snapshot().synthetic.financingDuplicateActiveRejected).toBe(true);
    expect(snapshot().synthetic.financingCanceledAllowsSuccessor).toBe(true);
  });

  it('T10 charge separate', () => {
    expect(TARGET_TABLES.financial_v2_charges.createsReceivable).toBe(false);
    expect(snapshot().synthetic.chargeDidNotCreateReceivable).toBe(true);
  });

  it('T11 payment original preserved', () => {
    expect(snapshot().synthetic.originalPaymentRemained).toBe(true);
    expect(DELETE_POLICY.payments).toBe('DENY');
  });

  it('T12 reversal relation', () => {
    for (const rule of REVERSAL_SQL_INVARIANTS) expect(rule).toBeTruthy();
    expect(snapshot().synthetic.reversalInserted).toBe(true);
  });

  it('T13 cross-tenant reversal blocked', () => {
    expect(snapshot().synthetic.crossTenantReversalRejected).toBe(true);
    expect(REVERSAL_SERVICE_INVARIANTS.length).toBeGreaterThan(0);
  });

  it('T14 RLS enabled', () => {
    expect(inspectFinancialV2MigrationSql(readSql(MIGRATION_SQL_PATH)).rlsEnabled).toBe(true);
    expect(snapshot().rlsEnabled).toBe(true);
    expect(snapshot().forceRls).toBe(true);
  });

  it('T15 select tenant scoped', () => {
    expect(snapshot().synthetic.selectCrossTenantEmpty).toBe(true);
  });

  it('T16 insert tenant scoped', () => {
    expect(snapshot().synthetic.insertCrossTenantDenied).toBe(true);
  });

  it('T17 update tenant scoped', () => {
    expect(snapshot().synthetic.updateCrossTenantDenied).toBe(true);
  });

  it('T18 DELETE financial facts denied', () => {
    const sql = readSql(MIGRATION_SQL_PATH);
    expect(sql).not.toMatch(/for delete\b/i);
    expect(snapshot().deletePolicies).toEqual([]);
    expect(snapshot().synthetic.deleteDeniedAsAuthenticated).toBe(true);
    expect(DELETE_POLICY.receivables).toBe('DENY');
  });

  it('T19 no destructive cascades', () => {
    const inspected = inspectFinancialV2MigrationSql(readSql(MIGRATION_SQL_PATH));
    expect(inspected.destructiveCascades).toEqual([]);
    expect(V2_DESTRUCTIVE_CASCADE_PATHS).toBe('NONE');
    expect(snapshot().destructiveCascades).toEqual([]);
  });

  it('T20 status invalid rejected', () => {
    expect(snapshot().synthetic.invalidStatusOpenRejected).toBe(true);
    expect(snapshot().synthetic.unknownStatusRejected).toBe(true);
    expect(snapshot().synthetic.validStatusAccepted).toBe(true);
  });

  it('T21 source_id preserved as compatible type', () => {
    expect(inspectFinancialV2MigrationSql(readSql(MIGRATION_SQL_PATH)).sourceIdText).toBe(true);
    expect(snapshot().sourceIdTypes.every((row) => row.data_type === 'text')).toBe(true);
  });

  it('T22 no backfill', () => {
    expect(PHASE_11J_RUNTIME.BACKFILL_APPLIED).toBe(false);
    expect(PHASE_11J_RUNTIME.HISTORICAL_DATA_CHANGED).toBe(false);
  });

  it('T23 no live writer enabled', () => {
    expect(PHASE_11J_RUNTIME.FINANCIAL_SERVER_WRITE_ENABLED).toBe(false);
    expect(PHASE_11J_RUNTIME.FINANCIAL_SERVER_READ_ENABLED).toBe(false);
    expect(Object.values(FINANCIAL_REPOSITORY_FLAG_DEFAULTS).every((v) => v === false)).toBe(true);
  });

  it('T24 no shadow write', () => {
    expect(PHASE_11J_RUNTIME.SHADOW_WRITE_ENABLED).toBe(false);
    expect(FINANCIAL_REPOSITORY_FLAG_DEFAULTS.FINANCIAL_SHADOW).toBe(false);
  });

  it('T25 no dual write', () => {
    expect(PHASE_11J_RUNTIME.DUAL_WRITE_ENABLED).toBe(false);
    expect(FINANCIAL_REPOSITORY_FLAG_DEFAULTS.FINANCIAL_DUAL_WRITE).toBe(false);
  });

  it('T26 old 021 remains untouched', () => {
    const sql021 = readSql(LEGACY_021_PATH);
    expect(sql021).toMatch(/numeric\(14, 2\)/);
    expect(sql021).toMatch(/default 'open'/);
    expect(PHASE_11J_RUNTIME.OLD_FINANCIAL_021_CHANGED).toBe(false);
    expect(snapshot().legacy021TablesPresent).toBe(false);
  });

  it('T27 PHASE 11.B receivable creation still idempotent', () => {
    const first = openReceivable(150, { origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN, origin_id: 'budget-11j-1', installment_number: 1 });
    const second = openReceivable(150, { origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN, origin_id: 'budget-11j-1', installment_number: 1 });
    expect(second.id).toBe(first.id);
  });

  it('T28 PHASE 11.C payment idempotency still holds', () => {
    const title = openReceivable(400);
    pay(title.id, 400, 'op-11j-t28');
    expect(pay(title.id, 400, 'op-11j-t28').replayed).toBe(true);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
  });

  it('T29 PHASE 11.D unpaid cancel still holds', () => {
    expect(cancelReceivable(adminA, openReceivable(90).id, 'ok').status).toBe(RECEIVABLE_STATUS.CANCELED);
  });

  it('T30 PHASE 11.E financing tenant still holds', () => {
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A, description: 'Fin 11J T30', total_amount: 600, entry_amount: 0,
      installments_count: 2, installment_frequency: 'monthly', first_due_date: '2026-09-10',
      issue_date: '2026-08-31', boleto_auto_generate: false, requires_credit_analysis: false,
    });
    expect(() => approveFinancing(adminB, proposal.id)).toThrow(/outra clínica|TENANT_MISMATCH/i);
  });

  it('T31 PHASE 11.F charge still does not create obligation', () => {
    const title = openReceivable(120);
    const before = (loadDb().accountsReceivable || []).length;
    createReceivableCharge(adminA, { receivable_id: title.id, operation_id: 'op-11j-t31' });
    expect((loadDb().accountsReceivable || []).length).toBe(before);
  });

  it('T32 PHASE 11.G cents conversion still holds', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it('T33 PHASE 11.H readiness contract regression', () => {
    expect(PHASE_11H_RUNTIME.DUAL_WRITE_ENABLED).toBe(false);
    expect(PHASE_11H_RUNTIME.SUPABASE_CUTOVER).toBe(false);
    expect(relative(ROOT, DRAFT_SQL_PATH)).not.toMatch(/^supabase\/migrations/);
  });

  it('T34 PHASE 11.I local foundation regression', () => {
    expect(FOUNDATION_11I_RUNTIME.SHADOW_WRITE_ENABLED).toBe(false);
    expect(FOUNDATION_11I_RUNTIME.BACKFILL_APPLIED).toBe(false);
    expect(existsSync(join(ROOT, 'src/services/financialV2Mapper.js'))).toBe(true);
  });

  it('T35 contract lifecycle has no automatic financial side-effects', () => {
    ensureContractsModuleSeeded();
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-11j-1', contractNumber: 'CTR-11J-1', clinicId: 'clinic-11j-a',
        tenant_id: TENANT_A, patientId: PATIENT_A, status: CONTRACT_STATUS.GENERATED,
        renderedHtml: '<p>11J</p>', finalContent: '<p>11J</p>', documentHash: 'hash-11j', version: 1,
      }];
      return db;
    });
    const before = financeSnapshot();
    cancelUnsignedContract({ user: adminA, contractId: 'gctr-11j-1', reason: 'desistencia' });
    expect(financeSnapshot()).toBe(before);
  });

  it('schema drift contract + environment guards', () => {
    const drift = detectFinancialV2SchemaDrift(readSql(MIGRATION_SQL_PATH), snapshot().driftProbe);
    expect(drift.ok).toBe(true);
    expect(PHASE_11J_RUNTIME.TARGET_DB_ENVIRONMENT).toBe('STAGING');
    expect(PHASE_11J_RUNTIME.PRODUCTION_DATABASE_CHANGED).toBe(false);
    expect(RBAC_SERVER_BOUNDARY.rlsSubstitutesRbac).toBe(false);
  });
});
