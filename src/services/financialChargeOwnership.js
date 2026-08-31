import { loadDb } from '../db/index.js';
import { requireSessionTenantId, assertSameTenant, resolveUserTenantId } from './tenantWriteGuard.js';
import { assertPatientTenantForWrite, assertFinancingWriteOwnership, deriveFinancingTenantId } from './financingOwnership.js';
import { assertReceivableWriteOwnership, deriveReceivableTenantId } from './receivablePaymentLifecycle.js';

export const BOLETO_CREATE_PERMISSION = 'financeiro_boletos:create';
export const BOLETO_ISSUE_PERMISSION = 'financeiro_boletos:issue';
export const BOLETO_CANCEL_PERMISSION = 'financeiro_boletos:cancel';
export const BOLETO_RESEND_PERMISSION = 'financeiro_boletos:resend';

function normalizeTenant(value) {
  return String(value || '').trim();
}

export function deriveBoletoChargeTenantId(charge, db = loadDb()) {
  const direct = normalizeTenant(charge?.tenant_id || charge?.tenantId);
  if (direct) return direct;
  if (charge?.receivable_id) {
    const recv = (db.accountsReceivable || []).find((row) => row.id === charge.receivable_id);
    const fromRecv = deriveReceivableTenantId(recv, db);
    if (fromRecv) return fromRecv;
  }
  if (charge?.financing_id) {
    const financing = (db.financings || []).find((row) => row.id === charge.financing_id);
    const fromFin = deriveFinancingTenantId(financing, db);
    if (fromFin) return fromFin;
  }
  if (charge?.patient_id) {
    const patient = (db.patients || []).find((row) => row.id === charge.patient_id);
    return normalizeTenant(patient?.tenant_id || patient?.tenantId) || null;
  }
  return null;
}

export function boletoChargeMatchesListTenant(charge, tenantId, db = loadDb()) {
  const tid = normalizeTenant(tenantId);
  if (!tid) return true;
  const derived = deriveBoletoChargeTenantId(charge, db);
  if (!derived) return false;
  return derived === tid;
}

export function resolveListTenantId(filters = {}) {
  return filters.tenantId || filters.tenant_id || resolveUserTenantId(filters.user) || null;
}

export function resolveBoletoWriteTenant(user, payload = {}, db = loadDb()) {
  requireSessionTenantId(user);
  if (payload.receivable_id) {
    const receivable = (db.accountsReceivable || []).find((row) => row.id === payload.receivable_id);
    if (!receivable) throw new Error('Título de contas a receber não encontrado para cobrança.');
    return assertReceivableWriteOwnership(user, receivable, db);
  }
  if (payload.financing_id) {
    const financing = (db.financings || []).find((row) => row.id === payload.financing_id);
    if (!financing) throw new Error('Financiamento não encontrado para cobrança.');
    return assertFinancingWriteOwnership(user, financing, db);
  }
  if (payload.patient_id) {
    return assertPatientTenantForWrite(user, payload.patient_id, db);
  }
  const error = new Error('Cobrança sem vínculo de clínica comprovável.');
  error.code = 'CHARGE_UNOWNED';
  throw error;
}

export function assertBoletoChargeWriteOwnership(user, charge, db = loadDb()) {
  requireSessionTenantId(user);
  const derived = deriveBoletoChargeTenantId(charge, db);
  if (!derived) {
    const error = new Error('Cobrança sem vínculo de clínica comprovável. Mutação bloqueada.');
    error.code = 'LEGACY_CHARGE_UNOWNED';
    throw error;
  }
  assertSameTenant(user, derived, { action: 'write' });
  return derived;
}

export { resolveUserTenantId };
