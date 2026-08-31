/**
 * PHASE 11.I — financial v2 local foundation, classifier, mapper, shadow, dry-run.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDb, loadDb, peekDb, resetDb, withDb } from '../db/index.js';
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
  DELETE_POLICY,
  FINANCIAL_V2_MIGRATION_ORDER,
  PHASE_11I_RUNTIME,
  RLS_TARGET_V2,
  V2_RBAC_OPERATIONS,
  assertV3FlagsRemainOff,
  financingActiveIdentity,
  paymentV2Identity,
  receivableV2Identity,
  validateReceivableV2Contract,
  v2Cents,
} from '../services/financialV2Foundation.js';
import {
  ELIGIBILITY,
  LEGACY_CLASSIFICATION,
  classifyLegacyFinancialRecord,
  evaluateFinancialMigrationEligibility,
} from '../services/financialV2LegacyClassifier.js';
import {
  mapChargeToV2,
  mapFinancingToV2,
  mapPaymentToV2,
  mapReceivableToV2,
} from '../services/financialV2Mapper.js';
import { SHADOW_REASON, SHADOW_RESULT, compareFinancialShadow } from '../services/financialV2ShadowComparator.js';
import { dryRunFinancialV2Migration } from '../services/financialV2DryRun.js';
import { toCents } from '../services/receivableMoney.js';
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
import {
  PATIENT_A,
  TENANT_A,
  TENANT_B,
  cleanReceivable,
  emptyFinanceDb,
} from './fixtures/financialV2Phase11iFixtures.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const APPT_A = 'apt-11i-a';
const adminA = {
  id: 'user-11i-admin-a', role: 'admin', tenant_id: TENANT_A, tenantId: TENANT_A, name: 'Admin 11I A',
};
const adminB = {
  id: 'user-11i-admin-b', role: 'admin', tenant_id: TENANT_B, tenantId: TENANT_B, name: 'Admin 11I B',
};

function seed() {
  withDb((db) => {
    db.tenants = [
      { id: TENANT_A, name: 'Clinica 11I A', status: 'active' },
      { id: TENANT_B, name: 'Clinica 11I B', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-11i-a', tenant_id: TENANT_A, razaoSocial: 'Clinica 11I A' };
    db.patients = [
      { id: PATIENT_A, tenant_id: TENANT_A, full_name: 'Paciente 11I A' },
      { id: 'patient-11i-b', tenant_id: TENANT_B, full_name: 'Paciente 11I B' },
    ];
    db.appointments = [{
      id: APPT_A, tenant_id: TENANT_A, patientId: PATIENT_A, professionalId: 'prof-11i',
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
    description: extras.description || 'CR 11I',
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

function eligibleDirect(record, entityType, db) {
  const classified = classifyLegacyFinancialRecord(record, { entityType, db });
  return evaluateFinancialMigrationEligibility(classified);
}

function financeSnapshot() {
  const db = loadDb();
  return JSON.stringify({
    accountsReceivable: db.accountsReceivable || [],
    receivablePayments: db.receivablePayments || [],
    financings: db.financings || [],
  });
}

describe('PHASE 11.I financial v2 local foundation', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seed();
  });
  afterEach(() => {});

  it('T1 V2 receivable requires tenant', () => {
    expect(() => validateReceivableV2Contract({ source_id: 'recv-x', total_cents: 1, status: 'pending' }))
      .toThrow(/tenant_id/);
  });

  it('T2 receivable identity deterministic', () => {
    const a = receivableV2Identity({ tenant_id: TENANT_A, origin_type: 'treatment_plan', origin_id: 'b1', installment_number: 1 });
    const b = receivableV2Identity({ tenant_id: TENANT_A, origin_type: 'treatment_plan', origin_id: 'b1', installment_number: 1 });
    expect(a).toBe(b);
  });

  it('T3 PATH A and PATH B identities remain distinct', () => {
    const pathA = receivableV2Identity({ tenant_id: TENANT_A, origin_type: 'treatment_plan', origin_id: 'same', installment_number: 1 });
    const pathB = receivableV2Identity({ tenant_id: TENANT_A, origin_type: 'financing', origin_id: 'same', installment_number: 1 });
    expect(pathA).not.toBe(pathB);
  });

  it('T4 payment operation identity deterministic', () => {
    expect(paymentV2Identity({ tenant_id: TENANT_A, operation_id: 'op-1' }))
      .toBe(paymentV2Identity({ tenant_id: TENANT_A, operation_id: 'op-1' }));
  });

  it('T5 financing identity constraint represented', () => {
    expect(financingActiveIdentity({ tenant_id: TENANT_A, budget_id: 'bud-1' }))
      .toBe(`${TENANT_A}::bud-1`);
  });

  it('T6 charge separate from obligation', () => {
    expect(TARGET_TABLES.financial_v2_charges.createsReceivable).toBe(false);
  });

  it('T7 FLOAT → cents exactly matches 11.G', () => {
    expect(v2Cents(0.1 + 0.2)).toBe(toCents(0.1 + 0.2));
    expect(v2Cents(10.1000000000001)).toBe(1010);
  });

  it('T8 source_id preserved', () => {
    const title = openReceivable(50);
    const v2 = mapReceivableToV2(title, { eligibility: eligibleDirect(title, 'receivable', loadDb()) });
    expect(v2.source_id).toBe(title.id);
  });

  it('T9 OWNED_DIRECT', () => {
    const title = openReceivable(40);
    const classified = classifyLegacyFinancialRecord(title, { entityType: 'receivable', db: loadDb() });
    expect(classified.classification).toBe(LEGACY_CLASSIFICATION.OWNED_DIRECT);
  });

  it('T10 OWNED_DERIVED with proof', () => {
    const title = openReceivable(40);
    const live = peekDb();
    delete live.accountsReceivable.find((row) => row.id === title.id).tenant_id;
    const classified = classifyLegacyFinancialRecord(
      live.accountsReceivable.find((row) => row.id === title.id),
      { entityType: 'receivable', db: live },
    );
    expect(classified.classification).toBe(LEGACY_CLASSIFICATION.OWNED_DERIVED);
    expect(classified.proof.via).toBe('patient');
    expect(classified.tenant_id).toBe(TENANT_A);
  });

  it('T11 UNOWNED quarantined', () => {
    const db = emptyFinanceDb({
      patients: [{ id: 'orphan', full_name: 'Sem tenant' }],
      accountsReceivable: [cleanReceivable({ id: 'recv-unowned', tenant_id: null, patient_id: 'orphan' })],
    });
    const classified = classifyLegacyFinancialRecord(db.accountsReceivable[0], { entityType: 'receivable', db });
    expect(evaluateFinancialMigrationEligibility(classified).decision).toBe(ELIGIBILITY.QUARANTINE);
    expect(classified.classification).toBe(LEGACY_CLASSIFICATION.UNOWNED);
  });

  it('T12 CONFLICTED quarantined', () => {
    const db = emptyFinanceDb({
      accountsReceivable: [cleanReceivable({ tenant_id: TENANT_A, patient_id: 'patient-11i-b' })],
    });
    const classified = classifyLegacyFinancialRecord(db.accountsReceivable[0], { entityType: 'receivable', db });
    expect(classified.classification).toBe(LEGACY_CLASSIFICATION.CONFLICTED);
    expect(evaluateFinancialMigrationEligibility(classified).decision).toBe(ELIGIBILITY.QUARANTINE);
  });

  it('T13 duplicate receivable quarantined', () => {
    const db = emptyFinanceDb({
      accountsReceivable: [
        cleanReceivable({ id: 'recv-dup-1', origin_type: 'treatment_plan', origin_id: 'bud-dup', installment_number: 1 }),
        cleanReceivable({ id: 'recv-dup-2', origin_type: 'treatment_plan', origin_id: 'bud-dup', installment_number: 1 }),
      ],
    });
    const report = dryRunFinancialV2Migration(db);
    expect(report.stats.DUPLICATES).toBe(2);
    expect(report.quarantined.every((item) => item.classification === 'DUPLICATE')).toBe(true);
  });

  it('T14 duplicate payment operation quarantined', () => {
    const db = emptyFinanceDb({
      accountsReceivable: [cleanReceivable({ id: 'recv-pay' })],
      receivablePayments: [
        { id: 'rvpay-1', tenant_id: TENANT_A, receivable_id: 'recv-pay', operation_id: 'op-dup', amount_received: 10, kind: 'payment', status: 'applied' },
        { id: 'rvpay-2', tenant_id: TENANT_A, receivable_id: 'recv-pay', operation_id: 'op-dup', amount_received: 10, kind: 'payment', status: 'applied' },
      ],
    });
    const report = dryRunFinancialV2Migration(db);
    expect(report.quarantined.filter((item) => item.entity_type === 'payment').length).toBe(2);
  });

  it('T15 reconciliation mismatch quarantined', () => {
    const title = openReceivable(100);
    const live = peekDb();
    const row = live.accountsReceivable.find((item) => item.id === title.id);
    row.remaining_amount = 50;
    row.received_amount = 40;
    const report = dryRunFinancialV2Migration(live);
    expect(report.quarantined.some((item) => item.classification === 'RECONCILIATION_MISMATCH')).toBe(true);
  });

  it('T16 clean record eligible', () => {
    const title = openReceivable(80);
    const eligibility = eligibleDirect(title, 'receivable', loadDb());
    expect(eligibility.decision).toBe(ELIGIBILITY.ELIGIBLE);
  });

  it('T17 derived clean record eligible with evidence', () => {
    const title = openReceivable(80);
    const live = peekDb();
    delete live.accountsReceivable.find((row) => row.id === title.id).tenant_id;
    const row = live.accountsReceivable.find((item) => item.id === title.id);
    const eligibility = evaluateFinancialMigrationEligibility(
      classifyLegacyFinancialRecord(row, { entityType: 'receivable', db: live }),
    );
    expect(eligibility.decision).toBe(ELIGIBILITY.ELIGIBLE_WITH_DERIVED_OWNERSHIP);
    expect(eligibility.proof.via).toBe('patient');
  });

  it('T18 payment mapper', () => {
    const title = openReceivable(90);
    const { payment } = pay(title.id, 30, 'op-11i-t18');
    const v2 = mapPaymentToV2(payment, { eligibility: eligibleDirect(payment, 'payment', loadDb()) });
    expect(v2.source_id).toBe(payment.id);
    expect(v2.amount_cents).toBe(3000);
    expect(v2.receivable_id).toBe(title.id);
    expect(v2.kind).toBe('payment');
  });

  it('T19 reversal mapper preserves original fact reference', () => {
    const title = openReceivable(90);
    const { payment } = pay(title.id, 90, 'op-11i-t19');
    reverseReceivablePayment(adminA, payment.id, { reversal_reason: 'teste' });
    const reversal = getReceivablePayments(title.id).find((row) => row.kind === 'reversal');
    const v2 = mapPaymentToV2(reversal, { eligibility: eligibleDirect(reversal, 'payment', loadDb()) });
    expect(v2.kind).toBe('reversal');
    expect(v2.reverses_payment_id).toBe(payment.id);
    expect(payment.id).toBeTruthy();
  });

  it('T20 financing mapper', () => {
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A,
      description: 'Fin 11I T20',
      total_amount: 400,
      entry_amount: 40,
      installments_count: 2,
      installment_frequency: 'monthly',
      first_due_date: '2026-09-10',
      issue_date: '2026-08-31',
      boleto_auto_generate: false,
      requires_credit_analysis: false,
    });
    const v2 = mapFinancingToV2(proposal, { eligibility: eligibleDirect(proposal, 'financing', loadDb()) });
    expect(v2.source_id).toBe(proposal.id);
    expect(v2.total_cents).toBe(40000);
    expect(v2.entry_cents).toBe(4000);
  });

  it('T21 charge mapper', () => {
    const title = openReceivable(70);
    const charge = createReceivableCharge(adminA, { receivable_id: title.id, operation_id: 'op-11i-t21' });
    const v2 = mapChargeToV2(charge, { eligibility: eligibleDirect(charge, 'charge', loadDb()) });
    expect(v2.source_id).toBe(charge.id);
    expect(v2.receivable_id).toBe(title.id);
    expect(v2.creates_receivable).toBe(false);
    expect((loadDb().accountsReceivable || []).length).toBe(1);
  });

  it('T22 shadow money equivalence', () => {
    const legacy = cleanReceivable({ net_amount: 10.1, original_amount: 10.1, remaining_amount: 10.1 });
    const v2 = mapReceivableToV2(legacy, { eligibility: { decision: ELIGIBILITY.ELIGIBLE, tenant_id: TENANT_A } });
    expect(v2.total_cents).toBe(1010);
    expect(compareFinancialShadow({ entityType: 'receivable', legacy, v2 }).result).toBe(SHADOW_RESULT.MATCH);
  });

  it('T23 shadow tenant mismatch detected', () => {
    const title = openReceivable(20);
    const v2 = mapReceivableToV2(title, { eligibility: eligibleDirect(title, 'receivable', loadDb()) });
    v2.tenant_id = TENANT_B;
    expect(compareFinancialShadow({ entityType: 'receivable', legacy: title, v2 }).reason_code)
      .toBe(SHADOW_REASON.TENANT_MISMATCH);
  });

  it('T24 shadow status mismatch detected', () => {
    const title = openReceivable(20);
    const v2 = mapReceivableToV2(title, { eligibility: eligibleDirect(title, 'receivable', loadDb()) });
    v2.status = 'paid';
    expect(compareFinancialShadow({ entityType: 'receivable', legacy: title, v2 }).reason_code)
      .toBe(SHADOW_REASON.STATUS_MISMATCH);
  });

  it('T25 shadow payment mismatch detected', () => {
    const title = openReceivable(50);
    const { payment } = pay(title.id, 20, 'op-11i-t25');
    const v2 = mapPaymentToV2(payment, { eligibility: eligibleDirect(payment, 'payment', loadDb()) });
    v2.amount_cents = 1;
    expect(compareFinancialShadow({ entityType: 'payment', legacy: payment, v2 }).reason_code)
      .toBe(SHADOW_REASON.MONEY_MISMATCH);
  });

  it('T26 shadow reversal mismatch detected', () => {
    const title = openReceivable(50);
    const { payment } = pay(title.id, 50, 'op-11i-t26');
    reverseReceivablePayment(adminA, payment.id, { reversal_reason: 'x' });
    const reversal = getReceivablePayments(title.id).find((row) => row.kind === 'reversal');
    const v2 = mapPaymentToV2(reversal, { eligibility: eligibleDirect(reversal, 'payment', loadDb()) });
    v2.reverses_payment_id = 'rvpay-other';
    expect(compareFinancialShadow({ entityType: 'payment', legacy: reversal, v2 }).reason_code)
      .toBe(SHADOW_REASON.REVERSAL_MISMATCH);
  });

  it('T27 V2 delete contract deny', () => {
    expect(DELETE_POLICY.payments).toBe('DENY');
    expect(DELETE_POLICY.reversals).toBe('DENY');
    expect(DELETE_POLICY.receivables).toBe('DENY');
    expect(DELETE_POLICY.approved_financings).toBe('DENY');
  });

  it('T28 RLS design tenant scoped', () => {
    expect(RLS_TARGET_V2.SELECT).toMatch(/tenant/i);
    expect(RLS_TARGET_V2.INSERT).toMatch(/tenant/i);
    expect(RLS_TARGET_V2.DELETE).toMatch(/NO POLICY|REVOKE DELETE/i);
  });

  it('T29 server RBAC contract represented', () => {
    expect(V2_RBAC_OPERATIONS.registerPayment).toBe('financeiro_contas_receber:edit');
    expect(V2_RBAC_OPERATIONS.reversePayment).toBe('financeiro_contas_receber:reverse');
    expect(V2_RBAC_OPERATIONS.createFinancing).toBe('financeiro_financiamentos:create');
    expect(V2_RBAC_OPERATIONS.createCharge).toBe('financeiro_boletos:create');
  });

  it('T30 migration order deterministic', () => {
    expect(FINANCIAL_V2_MIGRATION_ORDER[0]).toBe('financings');
    expect(FINANCIAL_V2_MIGRATION_ORDER.indexOf('receivables'))
      .toBeLessThan(FINANCIAL_V2_MIGRATION_ORDER.indexOf('payments'));
    expect(FINANCIAL_V2_MIGRATION_ORDER.indexOf('payments'))
      .toBeLessThan(FINANCIAL_V2_MIGRATION_ORDER.indexOf('reversals'));
    expect(FINANCIAL_V2_MIGRATION_ORDER.indexOf('charges'))
      .toBeGreaterThan(FINANCIAL_V2_MIGRATION_ORDER.indexOf('receivables'));
  });

  it('T31 dry-run statistics deterministic', () => {
    const db = emptyFinanceDb({ accountsReceivable: [cleanReceivable()] });
    const a = dryRunFinancialV2Migration(db);
    const b = dryRunFinancialV2Migration(db);
    expect(a.stats).toEqual(b.stats);
    expect(a.stats.ELIGIBLE).toBe(1);
    expect(a.stats.QUARANTINED).toBe(0);
  });

  it('T32 no remote DB mutation', () => {
    expect(PHASE_11I_RUNTIME.REMOTE_DATABASE_CHANGED).toBe(false);
  });

  it('T33 no migration applied', () => {
    expect(PHASE_11I_RUNTIME.MIGRATION_APPLIED).toBe(false);
    expect(PHASE_11H_RUNTIME.APPLY_SQL).toBe(false);
    const draft = join(ROOT, PHASE_11H_RUNTIME.DRAFT_SQL_PATH);
    expect(existsSync(draft)).toBe(true);
    expect(relative(ROOT, draft)).not.toMatch(/^supabase\/migrations/);
    expect(readFileSync(draft, 'utf8').slice(0, 80)).toMatch(/DRAFT ONLY/);
  });

  it('T34 no backfill', () => {
    expect(PHASE_11I_RUNTIME.BACKFILL_APPLIED).toBe(false);
    expect(PHASE_11I_RUNTIME.HISTORICAL_PRODUCTION_SCAN).toBe(false);
  });

  it('T35 no shadow write enabled', () => {
    expect(PHASE_11I_RUNTIME.SHADOW_WRITE_ENABLED).toBe(false);
    expect(PHASE_11I_RUNTIME.DUAL_WRITE_ENABLED).toBe(false);
    expect(assertV3FlagsRemainOff(FINANCIAL_REPOSITORY_FLAG_DEFAULTS)).toBe(true);
  });

  it('T36 PHASE 11.B receivable creation still idempotent', () => {
    const first = openReceivable(150, { origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN, origin_id: 'budget-11i-1', installment_number: 1 });
    const second = openReceivable(150, { origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN, origin_id: 'budget-11i-1', installment_number: 1 });
    expect(second.id).toBe(first.id);
  });

  it('T37 PHASE 11.C payment idempotency still holds', () => {
    const title = openReceivable(400);
    pay(title.id, 400, 'op-11i-t37');
    expect(pay(title.id, 400, 'op-11i-t37').replayed).toBe(true);
    expect(getReceivablePayments(title.id).filter(isEffectiveReceivablePayment)).toHaveLength(1);
  });

  it('T38 PHASE 11.D unpaid cancel still holds', () => {
    expect(cancelReceivable(adminA, openReceivable(90).id, 'ok').status).toBe(RECEIVABLE_STATUS.CANCELED);
  });

  it('T39 PHASE 11.E financing tenant still holds', () => {
    const proposal = createFinancingProposal(adminA, {
      patient_id: PATIENT_A, description: 'Fin 11I T39', total_amount: 600, entry_amount: 0,
      installments_count: 2, installment_frequency: 'monthly', first_due_date: '2026-09-10',
      issue_date: '2026-08-31', boleto_auto_generate: false, requires_credit_analysis: false,
    });
    expect(() => approveFinancing(adminB, proposal.id)).toThrow(/outra clínica|TENANT_MISMATCH/i);
  });

  it('T40 PHASE 11.F charge still does not create obligation', () => {
    const title = openReceivable(120);
    const before = (loadDb().accountsReceivable || []).length;
    createReceivableCharge(adminA, { receivable_id: title.id, operation_id: 'op-11i-t40' });
    expect((loadDb().accountsReceivable || []).length).toBe(before);
  });

  it('T41 PHASE 11.G cents conversion still holds', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it('T42 PHASE 11.H readiness contract regression', () => {
    expect(PHASE_11H_RUNTIME.DUAL_WRITE_ENABLED).toBe(false);
    expect(PHASE_11H_RUNTIME.SUPABASE_CUTOVER).toBe(false);
  });

  it('T43 contract lifecycle has no automatic financial side-effects', () => {
    ensureContractsModuleSeeded();
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-11i-1', contractNumber: 'CTR-11I-1', clinicId: 'clinic-11i-a',
        tenant_id: TENANT_A, patientId: PATIENT_A, status: CONTRACT_STATUS.GENERATED,
        renderedHtml: '<p>11I</p>', finalContent: '<p>11I</p>', documentHash: 'hash-11i', version: 1,
      }];
      return db;
    });
    const before = financeSnapshot();
    cancelUnsignedContract({ user: adminA, contractId: 'gctr-11i-1', reason: 'desistencia' });
    expect(financeSnapshot()).toBe(before);
  });
});
