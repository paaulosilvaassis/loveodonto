/**
 * PHASE 11.H — Supabase financial persistence readiness (design/contract).
 * No remote DB. No migration apply.
 */
import { readFileSync, existsSync } from 'node:fs';
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
  AUTOMATIC_FINANCIAL_SIDE_EFFECTS_FROM_CONTRACTS,
  CHARGE_IDEMPOTENCY_CONSTRAINT,
  CUTOVER_STRATEGY,
  DELETE_POLICY,
  ELIGIBILITY_CLASSES,
  EXISTING_SCHEMA_CLASSIFICATION,
  EXISTING_SUPABASE_SCHEMA_COMPATIBILITY,
  FEATURE_FLAG_PLAN,
  FINANCING_IDEMPOTENCY_CONSTRAINT,
  FK_POLICY,
  GO_NO_GO,
  IDB_TO_SUPABASE_MAPPING,
  LEGACY_DUPLICATE_POLICY,
  LEGACY_OWNERSHIP_POLICY,
  MONEY_CONVERSION_RULE,
  PAYMENT_IDEMPOTENCY_CONSTRAINT,
  PHASE_11H_RUNTIME,
  RBAC_SERVER_BOUNDARY,
  READINESS_MATRIX,
  READINESS_MATRIX_DOMAINS,
  RECEIVABLE_IDEMPOTENCY_CONSTRAINT,
  RECONCILIATION_BEFORE_MIGRATION,
  REVERSAL_RULES,
  RLS_EXISTING_021,
  ROLLBACK_STRATEGY,
  TARGET_MONEY_STORAGE_MODEL,
  TARGET_TABLES,
  TARGET_TENANT_MODEL,
  roundToCentsForPersistence,
} from '../contracts/financialCoreV2PersistenceContract.js';
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
const DRAFT_SQL = join(ROOT, PHASE_11H_RUNTIME.DRAFT_SQL_PATH);

const TENANT_A = 'tenant-11h-a';
const TENANT_B = 'tenant-11h-b';
const PATIENT_A = 'patient-11h-a';
const APPT_A = 'apt-11h-a';

const adminA = {
  id: 'user-11h-admin-a', role: 'admin', tenant_id: TENANT_A, tenantId: TENANT_A, name: 'Admin 11H A',
};
const adminB = {
  id: 'user-11h-admin-b', role: 'admin', tenant_id: TENANT_B, tenantId: TENANT_B, name: 'Admin 11H B',
};

function seed() {
  withDb((db) => {
    db.tenants = [
      { id: TENANT_A, name: 'Clinica 11H A', status: 'active' },
      { id: TENANT_B, name: 'Clinica 11H B', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-11h-a', tenant_id: TENANT_A, razaoSocial: 'Clinica 11H A' };
    db.patients = [
      { id: PATIENT_A, tenant_id: TENANT_A, full_name: 'Paciente 11H A' },
      { id: 'patient-11h-b', tenant_id: TENANT_B, full_name: 'Paciente 11H B' },
    ];
    db.appointments = [{
      id: APPT_A, tenant_id: TENANT_A, patientId: PATIENT_A, professionalId: 'prof-11h',
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
    description: extras.description || 'CR 11H',
    original_amount: amount,
    origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY,
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

function readDraftSql() {
  return readFileSync(DRAFT_SQL, 'utf8');
}

describe('PHASE 11.H supabase financial persistence readiness', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seed();
  });

  afterEach(() => {});

  it('T1 receivable target requires tenant', () => {
    expect(TARGET_TABLES.financial_v2_receivables.tenant_id).toBe('NOT NULL');
    expect(TARGET_TENANT_MODEL).toBe('TENANT_ID_NOT_NULL');
    expect(readDraftSql()).toMatch(/financial_v2_receivables[\s\S]*tenant_id uuid not null/i);
  });

  it('T2 unique financial obligation identity exists in design', () => {
    expect(RECEIVABLE_IDEMPOTENCY_CONSTRAINT).toMatch(/UNIQUE \(tenant_id, origin_type, origin_id, installment_number\)/);
    expect(readDraftSql()).toContain('fv2_recv_obligation_identity_uq');
  });

  it('T3 payment operation unique per tenant', () => {
    expect(PAYMENT_IDEMPOTENCY_CONSTRAINT).toBe('UNIQUE (tenant_id, operation_id)');
    expect(readDraftSql()).toContain('fv2_pay_operation_uq');
  });

  it('T4 money fields use cents target model', () => {
    expect(TARGET_MONEY_STORAGE_MODEL).toBe('INTEGER_CENTS');
    expect(TARGET_TABLES.financial_v2_receivables.money.every((f) => f.endsWith('_cents'))).toBe(true);
    expect(readDraftSql()).toMatch(/total_cents bigint/);
    expect(readDraftSql()).not.toMatch(/financial_v2_receivables[\s\S]*numeric\(14, 2\)/i);
  });

  it('T5 reversal references original payment', () => {
    expect(TARGET_TABLES.financial_v2_payments.reversalFk).toMatch(/RESTRICT/);
    expect(readDraftSql()).toMatch(/reverses_payment_id/);
    expect(readDraftSql()).toContain('fv2_pay_reverses_fk');
  });

  it('T6 cross-tenant FK/service design rejected', () => {
    expect(REVERSAL_RULES.crossTenantFk).toBe('REJECTED');
    expect(REVERSAL_RULES.serviceInvariants).toContain('reversal.tenant_id === original.tenant_id');
    expect(readDraftSql()).toMatch(/foreign key \(tenant_id, reverses_payment_id\)/);
  });

  it('T7 hard delete not part of payment lifecycle', () => {
    expect(DELETE_POLICY.payments).toBe('DENY');
    expect(DELETE_POLICY.reversals).toBe('DENY');
    expect(readDraftSql()).toMatch(/REVOKE DELETE/i);
  });

  it('T8 hard delete not part of receivable lifecycle', () => {
    expect(DELETE_POLICY.receivables).toBe('DENY');
    expect(TARGET_TABLES.financial_v2_receivables.deletePolicy).toBe('DENY');
  });

  it('T9 financing tenant mandatory', () => {
    expect(TARGET_TABLES.financial_v2_financings.tenant_id).toBe('NOT NULL');
    expect(readDraftSql()).toMatch(/financial_v2_financings[\s\S]*tenant_id uuid not null/i);
  });

  it('T10 budget binding represented', () => {
    expect(TARGET_TABLES.financial_v2_financings.budgetBinding).toMatch(/budget_id/);
    expect(FK_POLICY.budget_id).toMatch(/NO FK/);
    expect(FINANCING_IDEMPOTENCY_CONSTRAINT).toMatch(/tenant_id, budget_id/);
    expect(readDraftSql()).toContain('fv2_fin_active_budget_uq');
  });

  it('T11 charge separate from receivable', () => {
    expect(TARGET_TABLES.financial_v2_charges.createsReceivable).toBe(false);
    expect(IDB_TO_SUPABASE_MAPPING.receivableCharges.transformation).toMatch(/never create receivable/i);
    expect(CHARGE_IDEMPOTENCY_CONSTRAINT).toBe('UNIQUE (tenant_id, operation_id)');
  });

  it('T12 legacy unowned classified quarantine', () => {
    expect(LEGACY_OWNERSHIP_POLICY.UNOWNED).toBe('quarantine/report');
    expect(LEGACY_OWNERSHIP_POLICY.silentAssignToActiveTenant).toBe(false);
    expect(readDraftSql()).toMatch(/financial_v2_migration_quarantine[\s\S]*UNOWNED/);
  });

  it('T13 legacy duplicate classified, not deleted', () => {
    expect(LEGACY_DUPLICATE_POLICY).toBe('QUARANTINE_NOT_DELETE');
    expect(ELIGIBILITY_CLASSES).toContain('DUPLICATE');
  });

  it('T14 float → cents rule equivalent to 11.G', () => {
    expect(MONEY_CONVERSION_RULE).toBe('SAME_AS_11G_TO_CENTS');
    expect(roundToCentsForPersistence(0.1 + 0.2)).toBe(toCents(0.1 + 0.2));
    expect(roundToCentsForPersistence(10.1000000000001)).toBe(toCents(10.1000000000001));
    expect(roundToCentsForPersistence(10.1000000000001)).toBe(1010);
  });

  it('T15 RLS inventory complete', () => {
    expect(RLS_EXISTING_021.financial_accounts_receivable.DELETE).toMatch(/ALLOWED/);
    expect(RLS_EXISTING_021.financial_financings.SELECT).toBeTruthy();
    expect(RLS_EXISTING_021.financial_payables.INSERT).toBeTruthy();
    expect(RBAC_SERVER_BOUNDARY.rlsSubstitutesRbac).toBe(false);
  });

  it('T16 readiness matrix complete', () => {
    for (const domain of READINESS_MATRIX_DOMAINS) {
      const row = READINESS_MATRIX[domain];
      expect(row, domain).toBeTruthy();
      expect(row.currentIdb).toBeTruthy();
      expect(row.target).toBeTruthy();
      expect(row.schemaReady).toBeTruthy();
      expect(row.rlsReady).toBeTruthy();
      expect(row.moneyReady).toBeTruthy();
      expect(row.idempotencyReady).toBeTruthy();
      expect(row.legacyMigrationReady).toBeTruthy();
      expect(row.blockers).toBeTruthy();
    }
  });

  it('T17 rollback strategy documented', () => {
    expect(ROLLBACK_STRATEGY).toBe('FLAG_OFF_PRESERVE_IDB_AND_SERVER_ROWS');
    expect(GO_NO_GO.goForProductionCutover).toBe(false);
  });

  it('T18 cutover strategy documented', () => {
    expect(CUTOVER_STRATEGY).toBe('SHADOW_COMPARE_THEN_TENANT_CUTOVER');
    expect(FEATURE_FLAG_PLAN.implementIn11H).toBe(false);
    expect(RECONCILIATION_BEFORE_MIGRATION).toBe('REQUIRED');
  });

  it('T19 no database command executed', () => {
    expect(PHASE_11H_RUNTIME.APPLY_SQL).toBe(false);
    expect(PHASE_11H_RUNTIME.REMOTE_DATABASE_CHANGED).toBe(false);
    expect(PHASE_11H_RUNTIME.MIGRATION_APPLIED).toBe(false);
    expect(existsSync(DRAFT_SQL)).toBe(true);
    const header = readDraftSql().slice(0, 400);
    expect(header).toMatch(/DRAFT ONLY/);
    expect(header).toMatch(/DO NOT APPLY IN PHASE 11\.H/);
    expect(relative(ROOT, DRAFT_SQL)).not.toMatch(/^supabase\/migrations/);
    expect(EXISTING_SCHEMA_CLASSIFICATION.financial_accounts_receivable).toBe('INCOMPATIBLE');
    expect(EXISTING_SUPABASE_SCHEMA_COMPATIBILITY).toBe('INCOMPATIBLE');
  });

  it('T20 PHASE 11.B receivable creation still idempotent', () => {
    const first = openReceivable(150, {
      origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN,
      origin_id: 'budget-11h-1',
      installment_number: 1,
    });
    const second = openReceivable(150, {
      origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN,
      origin_id: 'budget-11h-1',
      installment_number: 1,
    });
    expect(second.id).toBe(first.id);
  });

  it('T21 PHASE 11.C payment idempotency still holds', () => {
    const title = openReceivable(400);
    pay(title.id, 400, 'op-11h-t21');
    const second = pay(title.id, 400, 'op-11h-t21');
    expect(second.replayed).toBe(true);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
  });

  it('T22 PHASE 11.D unpaid cancel still holds', () => {
    const title = openReceivable(90);
    expect(cancelReceivable(adminA, title.id, 'ok').status).toBe(RECEIVABLE_STATUS.CANCELED);
  });

  it('T23 PHASE 11.E financing tenant still holds', () => {
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A,
      description: 'Fin 11H T23',
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

  it('T24 PHASE 11.F charge still does not create obligation', () => {
    const title = openReceivable(120);
    const before = (loadDb().accountsReceivable || []).length;
    const first = createReceivableCharge(adminA, { receivable_id: title.id, operation_id: 'op-11h-t24' });
    const second = createReceivableCharge(adminA, { receivable_id: title.id, operation_id: 'op-11h-t24' });
    expect(second.id).toBe(first.id);
    expect((loadDb().accountsReceivable || []).length).toBe(before);
  });

  it('T25 PHASE 11.G cents conversion still holds', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(roundToCentsForPersistence(1000 / 3 * 3)).toBe(toCents(1000));
  });

  it('T26 contract lifecycle has no automatic financial side-effects', () => {
    expect(AUTOMATIC_FINANCIAL_SIDE_EFFECTS_FROM_CONTRACTS).toBe('NONE');
    ensureContractsModuleSeeded();
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-11h-1',
        contractNumber: 'CTR-11H-1',
        clinicId: 'clinic-11h-a',
        tenant_id: TENANT_A,
        patientId: PATIENT_A,
        status: CONTRACT_STATUS.GENERATED,
        renderedHtml: '<p>11H</p>',
        finalContent: '<p>11H</p>',
        documentHash: 'hash-11h',
        version: 1,
      }];
      return db;
    });
    const before = financeSnapshot();
    cancelUnsignedContract({ user: adminA, contractId: 'gctr-11h-1', reason: 'desistencia' });
    expect(financeSnapshot()).toBe(before);
  });
});
