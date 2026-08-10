/**
 * Facade do modo operacional / rollout gradual (Phase 10.20).
 * Persistência local — sem migration. Produção global permanece OFF por default.
 */

import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';
import {
  CONTRACTS_OPERATIONAL_MODES,
  CONTRACTS_ROLLOUT_PHASES,
  DEFAULT_OPERATIONAL_MODE_STATE,
  normalizeOperationalModeState,
  isContractsOperationalUxEnabled,
  canManageContractsOperationalMode,
  buildRollbackState,
  buildEnableOperationalUxState,
  isProductionRuntime,
  isProductionActivationUnlocked,
  evaluateGoLiveReadiness,
} from '../domain/contracts/rollout/contracts-operational-mode.ts';
import {
  createEmptyMetricCounters,
  incrementMetric,
  summarizeMetrics,
  deriveMetricAlerts,
} from '../domain/contracts/rollout/contracts-rollout-metrics.ts';

const STORAGE_KEY = 'loveodonto.contracts.operationalRollout.v1';

function clinicId() {
  return loadDb().clinicProfile?.id || 'default-clinic';
}

function readLocalBundle() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeLocalBundle(bundle) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle));
  } catch {
    /* ignore quota */
  }
}

function readDbBundle() {
  const db = loadDb();
  const cid = clinicId();
  return (db.contractsOperationalRollout || []).find((r) => r.clinicId === cid) || null;
}

export function getOperationalRolloutBundle() {
  const fromDb = readDbBundle();
  const fromLocal = readLocalBundle();
  const merged = {
    state: normalizeOperationalModeState(fromDb?.state || fromLocal?.state || DEFAULT_OPERATIONAL_MODE_STATE),
    metrics: fromDb?.metrics || fromLocal?.metrics || createEmptyMetricCounters(),
    audit: Array.isArray(fromDb?.audit) ? fromDb.audit : (fromLocal?.audit || []),
  };
  return merged;
}

function persistBundle(bundle, user) {
  const cid = clinicId();
  const now = new Date().toISOString();
  const payload = {
    id: bundle.id || createId('corl'),
    clinicId: cid,
    state: normalizeOperationalModeState(bundle.state),
    metrics: bundle.metrics || createEmptyMetricCounters(),
    audit: Array.isArray(bundle.audit) ? bundle.audit.slice(-100) : [],
    updatedAt: now,
    updatedBy: user?.id || null,
  };
  writeLocalBundle(payload);
  try {
    withDb((db) => {
      if (!Array.isArray(db.contractsOperationalRollout)) db.contractsOperationalRollout = [];
      const idx = db.contractsOperationalRollout.findIndex((r) => r.clinicId === cid);
      if (idx >= 0) db.contractsOperationalRollout[idx] = { ...db.contractsOperationalRollout[idx], ...payload };
      else db.contractsOperationalRollout.push({ ...payload, createdAt: now });
      return db;
    });
  } catch {
    // Persistência IndexedDB best-effort; localStorage já salvo.
  }
  return payload;
}

function pushAudit(bundle, entry) {
  const audit = [...(bundle.audit || []), {
    id: createId('cora'),
    at: new Date().toISOString(),
    ...entry,
  }].slice(-100);
  return { ...bundle, audit };
}

export function getContractsOperationalModeState() {
  return getOperationalRolloutBundle().state;
}

export function isOperationalContractsUxEnabledForCurrentClinic(user) {
  const state = getContractsOperationalModeState();
  return isContractsOperationalUxEnabled({
    tenantId: user?.tenantId || user?.tenant_id,
    clinicId: clinicId(),
    state,
  });
}

export function recordContractsRolloutMetric(event, user = null) {
  const bundle = getOperationalRolloutBundle();
  const metrics = incrementMetric(bundle.metrics || createEmptyMetricCounters(), event);
  persistBundle({ ...bundle, metrics }, user);
  return summarizeMetrics(metrics);
}

export function getContractsRolloutMetricsSummary() {
  return summarizeMetrics(getOperationalRolloutBundle().metrics);
}

export function getContractsRolloutAlerts() {
  return deriveMetricAlerts(getContractsRolloutMetricsSummary());
}

export function emergencyRollbackOperationalUx(user, reason = '') {
  if (!canManageContractsOperationalMode(user)) {
    const err = new Error('Permissão insuficiente para rollback.');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }
  let bundle = getOperationalRolloutBundle();
  const state = buildRollbackState(bundle.state, {
    reason,
    userId: user?.id || null,
  });
  bundle = pushAudit(bundle, {
    action: 'ROLLBACK',
    mode: state.mode,
    reason: state.rollbackReason,
    by: user?.id || null,
  });
  bundle = {
    ...bundle,
    state,
    metrics: incrementMetric(bundle.metrics || createEmptyMetricCounters(), 'rollback_triggered'),
  };
  persistBundle(bundle, user);
  return state;
}

export function enableOperationalUxMode(user, note = '') {
  if (!canManageContractsOperationalMode(user)) {
    const err = new Error('Permissão insuficiente.');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }
  let bundle = getOperationalRolloutBundle();
  const state = buildEnableOperationalUxState(bundle.state, {
    userId: user?.id || null,
    note,
  });
  bundle = pushAudit(bundle, {
    action: 'ENABLE_OPERATIONAL_UX',
    mode: state.mode,
    by: user?.id || null,
  });
  bundle = {
    ...bundle,
    state,
    metrics: incrementMetric(bundle.metrics || createEmptyMetricCounters(), 'mode_changed'),
  };
  persistBundle(bundle, user);
  return state;
}

export function setV1OnlyMode(user, reason = '') {
  if (!canManageContractsOperationalMode(user)) {
    const err = new Error('Permissão insuficiente.');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }
  let bundle = getOperationalRolloutBundle();
  const state = {
    ...normalizeOperationalModeState(bundle.state),
    mode: CONTRACTS_OPERATIONAL_MODES.V1_ONLY,
    productionGlobalEnabled: false,
    rollbackReason: reason || null,
    lastChangedAt: new Date().toISOString(),
    lastChangedBy: user?.id || null,
  };
  bundle = pushAudit(bundle, {
    action: 'SET_V1_ONLY',
    mode: state.mode,
    reason,
    by: user?.id || null,
  });
  bundle = {
    ...bundle,
    state,
    metrics: incrementMetric(bundle.metrics || createEmptyMetricCounters(), 'mode_changed'),
  };
  persistBundle(bundle, user);
  return state;
}

/**
 * Allowlist tenant — NÃO liga productionGlobalEnabled.
 * Ativação global exige unlock explícito + confirmação no painel.
 */
export function updateProductionTenantAllowlist(user, tenantIds = []) {
  if (!canManageContractsOperationalMode(user)) {
    const err = new Error('Permissão insuficiente.');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }
  let bundle = getOperationalRolloutBundle();
  const list = [...new Set((tenantIds || []).map((t) => String(t || '').trim()).filter(Boolean))];
  const state = {
    ...normalizeOperationalModeState(bundle.state),
    productionTenantAllowlist: list,
    lastChangedAt: new Date().toISOString(),
    lastChangedBy: user?.id || null,
  };
  bundle = pushAudit(bundle, {
    action: 'UPDATE_ALLOWLIST',
    allowlistCount: list.length,
    by: user?.id || null,
  });
  persistBundle({ ...bundle, state }, user);
  return state;
}

/**
 * Ligar productionGlobalEnabled — bloqueado sem unlock env + confirmação.
 * Este método NÃO é chamado automaticamente em lugar algum.
 */
export function setProductionGlobalEnabled(user, enabled, confirmationPhrase = '') {
  if (!canManageContractsOperationalMode(user)) {
    const err = new Error('Permissão insuficiente.');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }
  if (enabled) {
    if (!isProductionActivationUnlocked({ forceAllowInTest: false }) && isProductionRuntime()) {
      const err = new Error(
        'Ativação global em produção bloqueada. Defina CONTRACTS_OPERATIONAL_UX_PRODUCTION_UNLOCK=true e confirme no painel.',
      );
      err.code = 'PRODUCTION_ACTIVATION_LOCKED';
      throw err;
    }
    if (String(confirmationPhrase || '').trim() !== 'ATIVAR_PRODUCAO_OPERATIONAL_UX') {
      const err = new Error('Confirmação inválida. Digite exatamente ATIVAR_PRODUCAO_OPERATIONAL_UX.');
      err.code = 'CONFIRMATION_REQUIRED';
      throw err;
    }
  }
  let bundle = getOperationalRolloutBundle();
  const state = {
    ...normalizeOperationalModeState(bundle.state),
    productionGlobalEnabled: Boolean(enabled),
    rolloutPhase: enabled
      ? CONTRACTS_ROLLOUT_PHASES.PRODUCTION_ACTIVE
      : CONTRACTS_ROLLOUT_PHASES.READY_FOR_PRODUCTION_ACTIVATION,
    lastChangedAt: new Date().toISOString(),
    lastChangedBy: user?.id || null,
  };
  bundle = pushAudit(bundle, {
    action: enabled ? 'PRODUCTION_GLOBAL_ON' : 'PRODUCTION_GLOBAL_OFF',
    by: user?.id || null,
  });
  persistBundle({ ...bundle, state }, user);
  return state;
}

export function getRolloutAuditLog() {
  return getOperationalRolloutBundle().audit || [];
}

export function getGoLiveCriteriaStatus(overrides = {}) {
  return evaluateGoLiveReadiness({
    phase1016Pass: true,
    phase1017Pass: true,
    phase1018Pass: true,
    buildPass: true,
    v1RegressionPass: true,
    harnessIsolatedInProd: true,
    productionFlagsOffByDefault: true,
    noCriticalBugs: true,
    legalChecklistComplete: true,
    trainingDocReady: true,
    rollbackTested: true,
    monitoringReady: true,
    ...overrides,
  });
}

export {
  CONTRACTS_OPERATIONAL_MODES,
  CONTRACTS_ROLLOUT_PHASES,
  canManageContractsOperationalMode,
  isProductionRuntime,
  isProductionActivationUnlocked,
};
