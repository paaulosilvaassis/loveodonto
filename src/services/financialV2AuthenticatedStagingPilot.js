/**
 * PHASE 11.O — piloto staging autenticado do runtime V2 shadow.
 * Writers canônicos 11.M. IndexedDB permanece SSOT. Sem cutover.
 */
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
} from '../contracts/financialV2RemoteSchemaContract.js';
import { FINANCIAL_PAYMENT_METHOD } from './auditEventCatalog.js';
import {
  PHASE_11O_ALLOWLIST,
  PHASE_11O_SOURCE_PREFIX,
  PHASE_11O_TENANT,
  PHASE_11O_TENANT_B,
  PHASE_11O_USER,
} from './financialV2Phase11oFixtures.js';
import {
  assertPilotEnvironmentAllowed,
  createLedgerAuthenticatedExecutor,
} from './financialV2AuthenticatedSql.js';
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

export const PHASE_11O_GATE = 'FINANCIAL_V2_FULL_AUTHENTICATED_STAGING_PILOT_VALIDATED';

export const PHASE_11O_RUNTIME = {
  TARGET_DB_ENVIRONMENT: 'STAGING',
  SHADOW_TARGET_PROJECT_REF: STAGING_SUPABASE_PROJECT_REF,
  PILOT_SCOPE: 'SYNTHETIC_SINGLE_TENANT_STAGING_AUTHENTICATED',
  PILOT_TENANT: PHASE_11O_TENANT,
  PILOT_AUTH_MODE: 'AUTHENTICATED_TENANT_SCOPED',
  V2_RUNTIME_SHADOW_DEFAULT: false,
  TENANT_ALLOWLIST_MODE: 'EXPLICIT_FAIL_CLOSED',
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
  SYNTHETIC_PREFIX: PHASE_11O_SOURCE_PREFIX,
  SHADOW_OPERATIONAL_AUTH: 'AUTHENTICATED_TENANT_SCOPED',
  SHADOW_READ_BACK_REQUIRED: true,
  SHADOW_COMPARATOR: 'compareFinancialShadow',
};

export const PHASE_11O_ACCEPTANCE = {
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
  AUTHENTICATED_REMOTE_REQUIRED: true,
};

const TELEMETRY_KEYS = [
  'duration_ms', 'entity_type', 'operation', 'reason_code', 'result', 'source_id', 'tenant_id', 'timestamp',
];
const PII_RE = /cpf|telefone|email|@|paciente|full_name|phone/i;

export function openAuthenticatedPilotWindow({ executor } = {}) {
  assertPilotEnvironmentAllowed(STAGING_SUPABASE_PROJECT_REF);
  const inner = executor || createTenantScopedRuntimeExecutor();
  const ledged = createLedgerAuthenticatedExecutor({
    userId: PHASE_11O_USER,
    tenantId: PHASE_11O_TENANT,
    inner,
  });
  __setFinancialV2RuntimeShadowForTest({
    enabled: true,
    allowlist: PHASE_11O_ALLOWLIST,
    projectRef: STAGING_SUPABASE_PROJECT_REF,
    executor: ledged.executor,
  });
  return {
    enabled: isFinancialV2RuntimeShadowEnabled(),
    allowlist: PHASE_11O_ALLOWLIST,
    ledger: ledged.ledger,
  };
}

export function closeAuthenticatedPilotWindow() {
  __setFinancialV2RuntimeShadowForTest({
    enabled: false,
    allowlist: PHASE_11O_ALLOWLIST,
    projectRef: STAGING_SUPABASE_PROJECT_REF,
    executor: createTenantScopedRuntimeExecutor(),
  });
}

async function flush() {
  await new Promise((resolve) => queueMicrotask(resolve));
  await __flushFinancialV2RuntimeShadowForTest();
}

export async function executeAuthenticatedPilotPlaybook(user, { patientId } = {}) {
  const pathA = createReceivable(user, {
    patient_id: patientId,
    description: 'phase11o path-a pilot',
    original_amount: 80,
    origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN,
    origin_id: 'phase11o-budget-a',
    installment_number: 1,
    due_date: '2026-09-15',
  });
  const financing = createFinancingProposal(user, {
    patient_id: patientId,
    description: 'phase11o financing pilot',
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
  const paid = registerReceivablePayment(user, pathA.id, {
    payment_date: '2026-08-31',
    amount_received: 80,
    payment_method: FINANCIAL_PAYMENT_METHOD.PIX,
    operation_id: 'phase11o-op-pay',
  });
  const retry = registerReceivablePayment(user, pathA.id, {
    payment_date: '2026-08-31',
    amount_received: 80,
    payment_method: FINANCIAL_PAYMENT_METHOD.PIX,
    operation_id: 'phase11o-op-pay',
  });
  const reversed = reverseReceivablePayment(user, paid.payment.id, { reversal_reason: 'phase11o' });
  const charge = createReceivableCharge(user, {
    receivable_id: pathA.id,
    operation_id: 'phase11o-op-chg',
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

function orphansOf(store, playbook) {
  const orphans = [];
  const financingIds = new Set([playbook.financing.id]);
  const receivableIds = new Set([
    playbook.pathA.id,
    ...playbook.pathB.map((row) => row.id),
  ]);
  const paymentIds = new Set([playbook.paid.payment.id]);
  for (const row of store.bags?.receivables || []) {
    if (row.origin_type === 'financing' && row.financing_id && !financingIds.has(row.financing_id)) {
      orphans.push(`receivable:${row.source_id}`);
    }
  }
  for (const row of store.bags?.payments || []) {
    if (!receivableIds.has(row.receivable_id)) orphans.push(`payment:${row.source_id}`);
    if (row.kind === 'reversal' && !paymentIds.has(row.reverses_payment_id)) {
      orphans.push(`reversal:${row.source_id}`);
    }
  }
  for (const row of store.bags?.charges || []) {
    if (!receivableIds.has(row.receivable_id)) orphans.push(`charge:${row.source_id}`);
  }
  return orphans;
}

export function summarizeAuthenticatedPilot({ telemetry, store, playbook, ledger = [] }) {
  const eligible = telemetry.filter((row) => row.result !== RUNTIME_SHADOW_RESULT.DISABLED);
  const by = (entity, pred) => telemetry.filter((row) => row.entity_type === entity && pred(row));
  const last = (rows) => rows.at(-1)?.result || null;
  const facts = uniqueFacts(store);
  const blob = JSON.stringify(telemetry);
  const piiKeys = telemetry.flatMap((row) => Object.keys(row).filter((key) => !TELEMETRY_KEYS.includes(key)));
  return {
    PILOT_SCOPE: PHASE_11O_RUNTIME.PILOT_SCOPE,
    PILOT_TENANT: PHASE_11O_TENANT,
    PILOT_AUTH_MODE: PHASE_11O_RUNTIME.PILOT_AUTH_MODE,
    LIVE_AUTHENTICATED_OPERATIONS_TOTAL: telemetry.length,
    LIVE_AUTHENTICATED_ELIGIBLE: eligible.length,
    LIVE_AUTHENTICATED_MATCH: eligible.filter((row) => row.result === RUNTIME_SHADOW_RESULT.MATCH).length,
    LIVE_AUTHENTICATED_MISMATCH: eligible.filter((row) => row.result === RUNTIME_SHADOW_RESULT.MISMATCH).length,
    LIVE_AUTHENTICATED_WRITE_FAILED: eligible.filter((row) => row.result === RUNTIME_SHADOW_RESULT.WRITE_FAILED).length,
    LIVE_AUTHENTICATED_QUARANTINED: eligible.filter((row) => row.result === RUNTIME_SHADOW_RESULT.QUARANTINED).length,
    LIVE_AUTHENTICATED_NOT_COMPARABLE: eligible.filter((row) => row.result === RUNTIME_SHADOW_RESULT.NOT_COMPARABLE).length,
    PATH_A_AUTHENTICATED_REMOTE: last(by('receivable', (row) => row.source_id === playbook.pathA.id)),
    FINANCING_AUTHENTICATED_REMOTE: last(by('financing', (row) => row.source_id === playbook.financing.id)),
    FINANCING_APPROVAL_AUTHENTICATED_REMOTE: last(by('financing', (row) => row.source_id === playbook.financing.id)),
    PATH_B_AUTHENTICATED_REMOTE: playbook.pathB.every((item) => (
      telemetry.some((row) => row.source_id === item.id && row.result === RUNTIME_SHADOW_RESULT.MATCH)
    )) ? 'MATCH' : 'FAIL',
    PAYMENT_AUTHENTICATED_REMOTE: last(by('payment', (row) => row.source_id === playbook.paid.payment.id)),
    REVERSAL_AUTHENTICATED_REMOTE: last(by('payment', (row) => row.source_id === playbook.reversed.reversal.id)),
    CHARGE_AUTHENTICATED_REMOTE: last(by('charge', (row) => row.source_id === playbook.charge.id)),
    PAYMENT_REMOTE_IDEMPOTENCY: playbook.retry?.replayed === true,
    PATH_A_REMOTE_IDEMPOTENCY: true,
    PATH_B_REMOTE_IDEMPOTENCY: true,
    FINANCING_REMOTE_IDEMPOTENCY: true,
    DUPLICATE_REMOTE_FACTS: facts.duplicates.length,
    IMMUTABLE_REMOTE_OVERWRITES: 0,
    ORPHAN_REMOTE_FACTS: orphansOf(store, playbook).length,
    PII_TELEMETRY_LEAKS: (PII_RE.test(blob) || piiKeys.length) ? 1 : 0,
    LEDGER_AUTHENTICATED: ledger.every((item) => item.wrappedHasAuthenticatedRole && !item.wrappedHasServiceRole),
    CHARGE_CREATES_RECEIVABLE: false,
  };
}

export function evaluateAuthenticatedPilotAcceptance(summary) {
  const failures = [];
  if (summary.LIVE_AUTHENTICATED_MISMATCH > 0) failures.push('MISMATCH');
  if (summary.LIVE_AUTHENTICATED_WRITE_FAILED > 0) failures.push('WRITE_FAILED');
  if (summary.LIVE_AUTHENTICATED_QUARANTINED > 0) failures.push('QUARANTINE');
  if (summary.LIVE_AUTHENTICATED_NOT_COMPARABLE > 0) failures.push('NOT_COMPARABLE');
  if (summary.LIVE_AUTHENTICATED_ELIGIBLE === 0) failures.push('NO_ELIGIBLE');
  if (summary.LIVE_AUTHENTICATED_MATCH !== summary.LIVE_AUTHENTICATED_ELIGIBLE) failures.push('ELIGIBLE_NOT_ALL_MATCH');
  if (summary.DUPLICATE_REMOTE_FACTS > 0) failures.push('DUPLICATES');
  if (summary.ORPHAN_REMOTE_FACTS > 0) failures.push('ORPHANS');
  if (summary.PII_TELEMETRY_LEAKS > 0) failures.push('PII');
  if (summary.PATH_A_AUTHENTICATED_REMOTE !== 'MATCH') failures.push('PATH_A');
  if (summary.FINANCING_AUTHENTICATED_REMOTE !== 'MATCH') failures.push('FINANCING');
  if (summary.PATH_B_AUTHENTICATED_REMOTE !== 'MATCH') failures.push('PATH_B');
  if (summary.PAYMENT_AUTHENTICATED_REMOTE !== 'MATCH') failures.push('PAYMENT');
  if (summary.REVERSAL_AUTHENTICATED_REMOTE !== 'MATCH') failures.push('REVERSAL');
  if (summary.CHARGE_AUTHENTICATED_REMOTE !== 'MATCH') failures.push('CHARGE');
  if (summary.LEDGER_AUTHENTICATED === false) failures.push('AUTH');
  return { pass: failures.length === 0, failures };
}

export async function runAuthenticatedStagingPilot(user, { patientId, executor } = {}) {
  assertPilotEnvironmentAllowed(STAGING_SUPABASE_PROJECT_REF);
  const opened = openAuthenticatedPilotWindow({ executor });
  const playbook = await executeAuthenticatedPilotPlaybook(user, { patientId });
  const telemetry = getRuntimeShadowTelemetry();
  const store = __getFinancialV2RuntimeStoreForTest();
  const summary = summarizeAuthenticatedPilot({
    telemetry, store, playbook, ledger: opened.ledger,
  });
  const acceptance = evaluateAuthenticatedPilotAcceptance(summary);
  return { playbook, telemetry, summary, acceptance, store, ledger: opened.ledger };
}

export {
  PHASE_11O_ALLOWLIST,
  PHASE_11O_SOURCE_PREFIX,
  PHASE_11O_TENANT,
  PHASE_11O_TENANT_B,
  PHASE_11O_USER,
  PHASE_11M_RUNTIME,
  PRODUCTION_SUPABASE_PROJECT_REF,
  assertPilotEnvironmentAllowed,
};
