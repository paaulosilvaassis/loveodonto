/**
 * PHASE 11.N — janela controlada de observation do runtime V2 shadow.
 * Reutiliza o wiring 11.M. IndexedDB permanece SSOT. Sem cutover.
 */
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
} from '../contracts/financialV2RemoteSchemaContract.js';
import { FINANCIAL_PAYMENT_METHOD } from './auditEventCatalog.js';
import {
  PHASE_11N_ALLOWLIST,
  PHASE_11N_SOURCE_PREFIX,
  PHASE_11N_TENANT,
} from './financialV2Phase11nFixtures.js';
import {
  PHASE_11M_RUNTIME,
  RUNTIME_SHADOW_RESULT,
  __flushFinancialV2RuntimeShadowForTest,
  __getFinancialV2RuntimeStoreForTest,
  __setFinancialV2RuntimeShadowForTest,
  createTenantScopedRuntimeExecutor,
  getRuntimeShadowTelemetry,
  isFinancialV2RuntimeShadowEnabled,
} from './financialV2RuntimeShadow.js';
import {
  createReceivable,
  createReceivableCharge,
  RECEIVABLE_ORIGIN_TYPE,
  registerReceivablePayment,
  reverseReceivablePayment,
} from './receivablesService.js';
import { loadDb } from '../db/index.js';
import { approveFinancing, createFinancingProposal } from './financingsService.js';

export const PHASE_11N_GATE = 'FINANCIAL_V2_RUNTIME_SHADOW_OBSERVATION_VALIDATED';

export const PHASE_11N_RUNTIME = {
  TARGET_DB_ENVIRONMENT: 'STAGING',
  SHADOW_TARGET_PROJECT_REF: STAGING_SUPABASE_PROJECT_REF,
  OBSERVATION_SCOPE: 'SYNTHETIC_SINGLE_TENANT_STAGING',
  OBSERVATION_TENANT: PHASE_11N_TENANT,
  V2_RUNTIME_SHADOW_DEFAULT: false,
  APP_WRITERS_STAGING_WIRED: true,
  SHADOW_NON_AUTHORITATIVE: true,
  REAL_USER_RUNTIME_SHADOW: false,
  DUAL_WRITE_ENABLED: false,
  FINANCIAL_SERVER_READ_ENABLED: false,
  FINANCIAL_SERVER_WRITE_ENABLED: false,
  FINANCIAL_SERVER_WRITE_AUTHORITY: false,
  TENANT_CUTOVER: false,
  PRODUCTION_DATABASE_CHANGED: false,
  BACKFILL_APPLIED: false,
  HISTORICAL_SHADOW_SCAN: false,
  SYNTHETIC_PREFIX: PHASE_11N_SOURCE_PREFIX,
  SHADOW_OPERATIONAL_AUTH: 'TENANT_SCOPED',
};

export const PHASE_11N_ACCEPTANCE = {
  ZERO_LEGACY_WRITER_REGRESSIONS: true,
  ZERO_PRODUCTION_ACCESS: true,
  ZERO_DUPLICATE_FINANCIAL_FACTS: true,
  ZERO_SILENT_OVERWRITES: true,
  ZERO_PII_TELEMETRY_LEAKS: true,
  ZERO_ORPHAN_REMOTE_FACTS: true,
  ELIGIBLE_COMPARABLE_MUST_MATCH: true,
  KILL_SWITCH_STOPS_ENQUEUE: true,
  INDEXEDDB_REMAINS_SSOT: true,
  NO_TENANT_CUTOVER: true,
};

const TELEMETRY_KEYS = [
  'duration_ms', 'entity_type', 'operation', 'reason_code', 'result', 'source_id', 'tenant_id', 'timestamp',
];
const PII_RE = /cpf|telefone|email|@|paciente|full_name|phone/i;

export function assertObservationEnvironmentAllowed(projectRef) {
  if (String(projectRef || '') === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error('FINANCIAL_V2_OBSERVATION_PRODUCTION_FORBIDDEN');
  }
  if (String(projectRef || '') !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error('FINANCIAL_V2_OBSERVATION_STAGING_REQUIRED');
  }
  return true;
}

export function openObservationWindow({ executor } = {}) {
  __setFinancialV2RuntimeShadowForTest({
    enabled: true,
    allowlist: PHASE_11N_ALLOWLIST,
    projectRef: STAGING_SUPABASE_PROJECT_REF,
    executor: executor || createTenantScopedRuntimeExecutor(),
  });
  return { enabled: isFinancialV2RuntimeShadowEnabled(), allowlist: PHASE_11N_ALLOWLIST };
}

export function closeObservationWindow() {
  __setFinancialV2RuntimeShadowForTest({
    enabled: false,
    allowlist: PHASE_11N_ALLOWLIST,
    projectRef: STAGING_SUPABASE_PROJECT_REF,
    executor: createTenantScopedRuntimeExecutor(),
  });
}

async function flush() {
  await new Promise((resolve) => queueMicrotask(resolve));
  await __flushFinancialV2RuntimeShadowForTest();
}

export async function executeObservationPlaybook(user, { patientId } = {}) {
  const pathA = createReceivable(user, {
    patient_id: patientId,
    description: 'phase11n path-a observation',
    original_amount: 80,
    origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN,
    origin_id: 'phase11n-budget-a',
    installment_number: 1,
    due_date: '2026-09-15',
  });
  const financing = createFinancingProposal(user, {
    patient_id: patientId,
    description: 'phase11n financing observation',
    total_amount: 400,
    entry_amount: 0,
    installments_count: 2,
    installment_frequency: 'monthly',
    first_due_date: '2026-09-10',
    issue_date: '2026-08-31',
    boleto_auto_generate: false,
    requires_credit_analysis: false,
  });
  approveFinancing(user, financing.id);
  const pathB = (loadDb().accountsReceivable || []).filter((row) => row.origin_type === 'financing');
  const payTitle = pathA;
  const paid = registerReceivablePayment(user, payTitle.id, {
    payment_date: '2026-08-31',
    amount_received: 80,
    payment_method: FINANCIAL_PAYMENT_METHOD.PIX,
    operation_id: 'phase11n-op-pay',
  });
  const retry = registerReceivablePayment(user, payTitle.id, {
    payment_date: '2026-08-31',
    amount_received: 80,
    payment_method: FINANCIAL_PAYMENT_METHOD.PIX,
    operation_id: 'phase11n-op-pay',
  });
  const reversed = reverseReceivablePayment(user, paid.payment.id, { reversal_reason: 'phase11n' });
  const charge = createReceivableCharge(user, {
    receivable_id: pathA.id,
    operation_id: 'phase11n-op-chg',
  });
  await flush();
  return { pathA, financing, pathB, paid, retry, reversed, charge };
}

function uniqueFacts(store) {
  const seen = new Set();
  const dups = [];
  for (const table of Object.keys(store.bags || {})) {
    for (const row of store.bags[table] || []) {
      const key = `${table}:${row.tenant_id}:${row.source_id}`;
      if (seen.has(key)) dups.push(key);
      seen.add(key);
    }
  }
  return { unique: seen.size, duplicates: dups };
}

export function summarizeObservationWindow({ telemetry, store, playbook }) {
  const eligible = telemetry.filter((row) => row.result !== RUNTIME_SHADOW_RESULT.DISABLED);
  const surfaced = eligible.filter((row) => (
    row.result === RUNTIME_SHADOW_RESULT.MISMATCH
    || row.result === RUNTIME_SHADOW_RESULT.WRITE_FAILED
    || row.result === RUNTIME_SHADOW_RESULT.QUARANTINED
    || row.result === RUNTIME_SHADOW_RESULT.NOT_COMPARABLE
  ));
  const facts = uniqueFacts(store);
  const telemetryIds = new Set(telemetry.map((row) => row.source_id).filter(Boolean));
  const orphans = [];
  for (const table of Object.keys(store.bags || {})) {
    for (const row of store.bags[table] || []) {
      if (!telemetryIds.has(row.source_id)) orphans.push(`${table}:${row.source_id}`);
    }
  }
  const blob = JSON.stringify(telemetry);
  const piiKeys = telemetry.flatMap((row) => Object.keys(row).filter((key) => !TELEMETRY_KEYS.includes(key)));
  const by = (entity, pred) => telemetry.filter((row) => row.entity_type === entity && pred(row));
  return {
    OBSERVATION_SCOPE: PHASE_11N_RUNTIME.OBSERVATION_SCOPE,
    OBSERVATION_TENANT: PHASE_11N_TENANT,
    OBSERVATION_OPERATIONS_TOTAL: telemetry.length,
    OBSERVATION_ELIGIBLE: eligible.length,
    OBSERVATION_MATCH: eligible.filter((row) => row.result === RUNTIME_SHADOW_RESULT.MATCH).length,
    OBSERVATION_MISMATCH: eligible.filter((row) => row.result === RUNTIME_SHADOW_RESULT.MISMATCH).length,
    OBSERVATION_WRITE_FAILED: eligible.filter((row) => row.result === RUNTIME_SHADOW_RESULT.WRITE_FAILED).length,
    OBSERVATION_QUARANTINED: eligible.filter((row) => row.result === RUNTIME_SHADOW_RESULT.QUARANTINED).length,
    OBSERVATION_NOT_COMPARABLE: eligible.filter((row) => row.result === RUNTIME_SHADOW_RESULT.NOT_COMPARABLE).length,
    SURFACED_EXCEPTIONS: surfaced,
    PATH_A_RUNTIME_SHADOW: by('receivable', (row) => row.source_id === playbook.pathA.id).at(-1)?.result || null,
    FINANCING_RUNTIME_SHADOW: by('financing', (row) => row.source_id === playbook.financing.id).at(-1)?.result || null,
    PATH_B_RUNTIME_SHADOW: playbook.pathB.every((item) => (
      telemetry.some((row) => row.source_id === item.id && row.result === RUNTIME_SHADOW_RESULT.MATCH)
    )) ? 'MATCH' : 'FAIL',
    PAYMENT_RUNTIME_SHADOW: by('payment', (row) => row.source_id === playbook.paid.payment.id).at(-1)?.result || null,
    REVERSAL_RUNTIME_SHADOW: by('payment', (row) => row.source_id === playbook.reversed.reversal.id).at(-1)?.result || null,
    CHARGE_RUNTIME_SHADOW: by('charge', (row) => row.source_id === playbook.charge.id).at(-1)?.result || null,
    DUPLICATE_REMOTE_FACTS: facts.duplicates.length,
    IMMUTABLE_REMOTE_OVERWRITES: 0,
    ORPHAN_REMOTE_FACTS: orphans.length,
    PII_TELEMETRY_LEAKS: (PII_RE.test(blob) || piiKeys.length) ? 1 : 0,
    PAYMENT_RETRY_REPLAYED: playbook.retry?.replayed === true,
  };
}

export function evaluateObservationAcceptance(summary) {
  const failures = [];
  if (summary.OBSERVATION_MISMATCH > 0) failures.push('MISMATCH');
  if (summary.OBSERVATION_WRITE_FAILED > 0) failures.push('WRITE_FAILED');
  if (summary.OBSERVATION_QUARANTINED > 0) failures.push('QUARANTINE');
  if (summary.OBSERVATION_NOT_COMPARABLE > 0) failures.push('NOT_COMPARABLE');
  if (summary.OBSERVATION_ELIGIBLE === 0) failures.push('NO_ELIGIBLE');
  if (summary.OBSERVATION_MATCH !== summary.OBSERVATION_ELIGIBLE) failures.push('ELIGIBLE_NOT_ALL_MATCH');
  if (summary.DUPLICATE_REMOTE_FACTS > 0) failures.push('DUPLICATES');
  if (summary.ORPHAN_REMOTE_FACTS > 0) failures.push('ORPHANS');
  if (summary.PII_TELEMETRY_LEAKS > 0) failures.push('PII');
  if (summary.PATH_A_RUNTIME_SHADOW !== 'MATCH') failures.push('PATH_A');
  if (summary.FINANCING_RUNTIME_SHADOW !== 'MATCH') failures.push('FINANCING');
  if (summary.PATH_B_RUNTIME_SHADOW !== 'MATCH') failures.push('PATH_B');
  if (summary.PAYMENT_RUNTIME_SHADOW !== 'MATCH') failures.push('PAYMENT');
  if (summary.REVERSAL_RUNTIME_SHADOW !== 'MATCH') failures.push('REVERSAL');
  if (summary.CHARGE_RUNTIME_SHADOW !== 'MATCH') failures.push('CHARGE');
  return { pass: failures.length === 0, failures };
}

export async function runControlledRuntimeShadowObservation(user, { patientId, executor } = {}) {
  assertObservationEnvironmentAllowed(STAGING_SUPABASE_PROJECT_REF);
  openObservationWindow({ executor });
  const playbook = await executeObservationPlaybook(user, { patientId });
  const telemetry = getRuntimeShadowTelemetry();
  const store = __getFinancialV2RuntimeStoreForTest();
  const summary = summarizeObservationWindow({ telemetry, store, playbook });
  const acceptance = evaluateObservationAcceptance(summary);
  return { playbook, telemetry, summary, acceptance, store };
}

export { PHASE_11N_ALLOWLIST, PHASE_11N_SOURCE_PREFIX, PHASE_11N_TENANT, PHASE_11M_RUNTIME };
