import { loadDb } from '../db/index.js';
import { requireSessionTenantId, assertSameTenant, resolveUserTenantId } from './tenantWriteGuard.js';
import { FINANCING_STATUS } from './auditEventCatalog.js';

export const FINANCING_CREATE_PERMISSION = 'financeiro_financiamentos:create';
export const FINANCING_APPROVE_PERMISSION = 'financeiro_financiamentos:approve';
export const FINANCING_CANCEL_PERMISSION = 'financeiro_financiamentos:cancel';
export const FINANCING_EDIT_PERMISSION = 'financeiro_financiamentos:edit';

const TERMINAL_FINANCING = new Set([FINANCING_STATUS.CANCELED, FINANCING_STATUS.RENEGOTIATED]);

function normalizeTenant(value) {
  return String(value || '').trim();
}

function patientIdForAppointment(db, appointmentId, fallback = null) {
  if (fallback) return fallback;
  const apt = (db.appointments || []).find((row) => row.id === appointmentId);
  return apt?.patientId || apt?.patient_id || null;
}

export function findBudgetRecord(budgetId, db = loadDb()) {
  const oid = String(budgetId || '').trim();
  if (!oid) return null;
  for (const ca of db.clinicalAppointments || []) {
    if (ca.budget?.id === oid) {
      return {
        budget: ca.budget,
        appointmentId: ca.appointmentId,
        patientId: patientIdForAppointment(db, ca.appointmentId, ca.patientId || null),
        isHistorical: ca.budget.status === 'HISTORICO',
      };
    }
    for (const archived of ca.budgetHistory || []) {
      if (archived?.id === oid) {
        return {
          budget: archived,
          appointmentId: ca.appointmentId,
          patientId: patientIdForAppointment(db, ca.appointmentId, ca.patientId || null),
          isHistorical: true,
        };
      }
    }
  }
  return null;
}

export function deriveFinancingTenantId(financing, db = loadDb()) {
  const direct = normalizeTenant(financing?.tenant_id || financing?.tenantId);
  if (direct) return direct;
  const patient = (db.patients || []).find((row) => row.id === financing?.patient_id);
  const fromPatient = normalizeTenant(patient?.tenant_id || patient?.tenantId);
  if (fromPatient) return fromPatient;
  const budgetId = financing?.budget_id || financing?.treatment_plan_id;
  const found = findBudgetRecord(budgetId, db);
  const fromBudget = normalizeTenant(found?.budget?.tenant_id || found?.budget?.tenantId);
  if (fromBudget) return fromBudget;
  if (found?.patientId) {
    const budgetPatient = (db.patients || []).find((row) => row.id === found.patientId);
    return normalizeTenant(budgetPatient?.tenant_id || budgetPatient?.tenantId) || null;
  }
  return null;
}

/**
 * LEGACY_FINANCING_WRITE_POLICY = DERIVE_FROM_BUDGET_OR_PATIENT_OR_FAIL_CLOSED
 */
export function assertFinancingWriteOwnership(user, financing, db = loadDb()) {
  requireSessionTenantId(user);
  const derived = deriveFinancingTenantId(financing, db);
  if (!derived) {
    const error = new Error('Financiamento sem vínculo de clínica comprovável. Mutação bloqueada.');
    error.code = 'LEGACY_FINANCING_UNOWNED';
    throw error;
  }
  assertSameTenant(user, derived, { action: 'write' });
  return derived;
}

export function assertPatientTenantForWrite(user, patientId, db = loadDb()) {
  const patient = (db.patients || []).find((row) => row.id === patientId);
  if (!patient) throw new Error('Paciente não encontrado.');
  const patientTenant = normalizeTenant(patient.tenant_id || patient.tenantId);
  if (!patientTenant) {
    const error = new Error('Paciente sem vínculo de clínica comprovável.');
    error.code = 'LEGACY_PATIENT_UNOWNED';
    throw error;
  }
  assertSameTenant(user, patientTenant, { action: 'write' });
  return patientTenant;
}

export function isActiveFinancingRecord(financing) {
  return Boolean(financing) && !TERMINAL_FINANCING.has(financing.status);
}

export function findActiveFinancingForBudget(db, { tenantId, budgetId }) {
  const tid = normalizeTenant(tenantId);
  const oid = String(budgetId || '').trim();
  if (!tid || !oid) return null;
  return (db.financings || []).find((row) => {
    if (!isActiveFinancingRecord(row)) return false;
    const rowBudget = String(row.budget_id || row.treatment_plan_id || '').trim();
    if (rowBudget !== oid) return false;
    const rowTenant = deriveFinancingTenantId(row, db);
    return rowTenant === tid;
  }) || null;
}

export function financingMatchesListTenant(item, tenantId, db) {
  const tid = normalizeTenant(tenantId);
  if (!tid) return true;
  const derived = deriveFinancingTenantId(item, db);
  if (!derived) return false;
  return derived === tid;
}

export function resolveListTenantId(filters = {}) {
  return filters.tenantId || filters.tenant_id || resolveUserTenantId(filters.user) || null;
}
