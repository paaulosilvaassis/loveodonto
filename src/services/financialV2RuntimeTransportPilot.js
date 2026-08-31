/**
 * PHASE 11.P — playbook canônico sobre o transport supabase-js autenticado.
 */
import { STAGING_SUPABASE_PROJECT_REF } from '../contracts/financialV2RemoteSchemaContract.js';
import { FINANCIAL_PAYMENT_METHOD } from './auditEventCatalog.js';
import {
  PHASE_11P_ALLOWLIST,
  PHASE_11P_PATIENT,
  PHASE_11P_SOURCE_PREFIX,
  PHASE_11P_TENANT,
  PHASE_11P_TENANT_B,
} from './financialV2Phase11pFixtures.js';
import {
  PHASE_11P_GATE,
  PHASE_11P_RUNTIME,
  assertAppRuntimeEnvironmentAllowed,
} from './financialV2ShadowTransport.js';
import {
  RUNTIME_SHADOW_RESULT,
  __flushFinancialV2RuntimeShadowForTest,
  __getFinancialV2RuntimeStoreForTest,
  __setFinancialV2RuntimeShadowForTest,
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

export { PHASE_11P_GATE, PHASE_11P_RUNTIME };

const TELEMETRY_KEYS = [
  'duration_ms', 'entity_type', 'operation', 'reason_code', 'result', 'source_id', 'tenant_id', 'timestamp',
];
const TOKEN_RE = /eyJ[a-zA-Z0-9_-]{8,}|authorization|bearer |refresh_token|access_token/i;
const PII_RE = /cpf|telefone|phone|paciente|full_name/i;

export function openRuntimeTransportWindow({ transport } = {}) {
  assertAppRuntimeEnvironmentAllowed(STAGING_SUPABASE_PROJECT_REF);
  if (!transport || typeof transport.persist !== 'function') {
    throw new Error('FINANCIAL_V2_APP_RUNTIME_TRANSPORT_REQUIRED');
  }
  __setFinancialV2RuntimeShadowForTest({
    enabled: true,
    allowlist: PHASE_11P_ALLOWLIST,
    projectRef: STAGING_SUPABASE_PROJECT_REF,
    transport,
  });
  return { enabled: isFinancialV2RuntimeShadowEnabled(), allowlist: PHASE_11P_ALLOWLIST };
}

export function closeRuntimeTransportWindow() {
  __setFinancialV2RuntimeShadowForTest({
    enabled: false,
    allowlist: PHASE_11P_ALLOWLIST,
    projectRef: STAGING_SUPABASE_PROJECT_REF,
    transport: null,
  });
}

async function flush() {
  await new Promise((resolve) => queueMicrotask(resolve));
  await __flushFinancialV2RuntimeShadowForTest();
}

export async function executeRuntimeTransportPlaybook(user, { patientId = PHASE_11P_PATIENT } = {}) {
  const pathA = createReceivable(user, {
    patient_id: patientId,
    description: 'phase11p path-a transport',
    original_amount: 80,
    origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN,
    origin_id: 'phase11p-budget-a',
    installment_number: 1,
    due_date: '2026-09-15',
  });
  const financing = createFinancingProposal(user, {
    patient_id: patientId,
    description: 'phase11p financing transport',
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
    operation_id: 'phase11p-op-pay',
  });
  const retry = registerReceivablePayment(user, pathA.id, {
    payment_date: '2026-08-31',
    amount_received: 80,
    payment_method: FINANCIAL_PAYMENT_METHOD.PIX,
    operation_id: 'phase11p-op-pay',
  });
  const reversed = reverseReceivablePayment(user, paid.payment.id, { reversal_reason: 'phase11p' });
  const charge = createReceivableCharge(user, {
    receivable_id: pathA.id,
    operation_id: 'phase11p-op-chg',
  });
  await flush();
  return { pathA, financing, pathB, paid, retry, reversed, charge };
}

export function summarizeRuntimeTransport({ telemetry, playbook }) {
  const eligible = telemetry.filter((row) => row.result !== RUNTIME_SHADOW_RESULT.DISABLED);
  const by = (entity, pred) => telemetry.filter((row) => row.entity_type === entity && pred(row));
  const last = (rows) => rows.at(-1)?.result || null;
  const blob = JSON.stringify(telemetry);
  const extraKeys = telemetry.flatMap((row) => Object.keys(row).filter((key) => !TELEMETRY_KEYS.includes(key)));
  return {
    APP_RUNTIME_OPERATIONS_TOTAL: telemetry.length,
    APP_RUNTIME_ELIGIBLE: eligible.length,
    APP_RUNTIME_MATCH: eligible.filter((row) => row.result === RUNTIME_SHADOW_RESULT.MATCH).length,
    APP_RUNTIME_MISMATCH: eligible.filter((row) => row.result === RUNTIME_SHADOW_RESULT.MISMATCH).length,
    APP_RUNTIME_WRITE_FAILED: eligible.filter((row) => row.result === RUNTIME_SHADOW_RESULT.WRITE_FAILED).length,
    APP_RUNTIME_QUARANTINED: eligible.filter((row) => row.result === RUNTIME_SHADOW_RESULT.QUARANTINED).length,
    APP_RUNTIME_NOT_COMPARABLE: eligible.filter((row) => row.result === RUNTIME_SHADOW_RESULT.NOT_COMPARABLE).length,
    PATH_A_APP_RUNTIME_REMOTE: last(by('receivable', (row) => row.source_id === playbook.pathA.id)),
    FINANCING_APP_RUNTIME_REMOTE: last(by('financing', (row) => row.source_id === playbook.financing.id)),
    FINANCING_APPROVAL_APP_RUNTIME_REMOTE: last(by('financing', (row) => row.source_id === playbook.financing.id)),
    PATH_B_APP_RUNTIME_REMOTE: playbook.pathB.every((item) => (
      telemetry.some((row) => row.source_id === item.id && row.result === RUNTIME_SHADOW_RESULT.MATCH)
    )) ? 'MATCH' : 'FAIL',
    PAYMENT_APP_RUNTIME_REMOTE: last(by('payment', (row) => row.source_id === playbook.paid.payment.id)),
    REVERSAL_APP_RUNTIME_REMOTE: last(by('payment', (row) => row.source_id === playbook.reversed.reversal.id)),
    CHARGE_APP_RUNTIME_REMOTE: last(by('charge', (row) => row.source_id === playbook.charge.id)),
    PAYMENT_APP_RUNTIME_IDEMPOTENCY: playbook.retry?.replayed === true,
    TOKEN_TELEMETRY_LEAKS: TOKEN_RE.test(blob) ? 1 : 0,
    PII_TELEMETRY_LEAKS: (PII_RE.test(blob) || extraKeys.length) ? 1 : 0,
  };
}

export async function runRuntimeTransportPilot(user, { transport, patientId } = {}) {
  assertAppRuntimeEnvironmentAllowed(STAGING_SUPABASE_PROJECT_REF);
  openRuntimeTransportWindow({ transport });
  const playbook = await executeRuntimeTransportPlaybook(user, { patientId });
  const telemetry = getRuntimeShadowTelemetry();
  const summary = summarizeRuntimeTransport({ telemetry, playbook });
  return {
    playbook,
    telemetry,
    summary,
    store: __getFinancialV2RuntimeStoreForTest(),
  };
}

export {
  PHASE_11P_ALLOWLIST,
  PHASE_11P_SOURCE_PREFIX,
  PHASE_11P_TENANT,
  PHASE_11P_TENANT_B,
};
