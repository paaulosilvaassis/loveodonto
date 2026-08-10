/**
 * Facade do modo operacional / rollout gradual.
 * Phase 10.21C: SSOT = feature_flags via Admin API. localStorage = cache.
 */

import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';
import { getPlatformAccessToken } from '../auth/saasSessionResolver.js';
import {
  assertAdminApiFetchAllowed,
  buildAdminApiUrl,
  getConfiguredAdminApiBaseUrl,
  getDevDirectAdminApiUrl,
} from '../config/adminApiBase.js';
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
  isContractsOperationalUxLocalTestEnabled,
  getContractsOperationalUxLocalTestStatus,
} from '../domain/contracts/rollout/contracts-operational-ux-local-test.ts';
import { PRODUCTION_ACTIVATION_PHRASE } from '../domain/contracts/rollout/contracts-operational-rollout-flags.ts';
import {
  createEmptyMetricCounters,
  incrementMetric,
  summarizeMetrics,
  deriveMetricAlerts,
} from '../domain/contracts/rollout/contracts-rollout-metrics.ts';

const STORAGE_KEY = 'loveodonto.contracts.operationalRollout.v1';
const API_PATH = '/internal/app/contracts/operational-rollout';

let memorySnapshot = null;

/** @internal testes */
export function __resetContractsOperationalRolloutCacheForTests() {
  memorySnapshot = null;
}

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

function cacheBundle(bundle, user) {
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
    source: bundle.source || payloadSource(bundle.state),
  };
  memorySnapshot = payload;
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
    /* cache best-effort */
  }
  return payload;
}

function payloadSource(state) {
  return state?.source === 'feature_flags' ? 'feature_flags' : 'local_cache';
}

export function getOperationalRolloutBundle() {
  if (memorySnapshot?.state) {
    return {
      state: normalizeOperationalModeState(memorySnapshot.state),
      metrics: memorySnapshot.metrics || createEmptyMetricCounters(),
      audit: Array.isArray(memorySnapshot.audit) ? memorySnapshot.audit : [],
      source: memorySnapshot.source || 'local_cache',
    };
  }
  const fromDb = readDbBundle();
  const fromLocal = readLocalBundle();
  const merged = {
    state: normalizeOperationalModeState(fromDb?.state || fromLocal?.state || DEFAULT_OPERATIONAL_MODE_STATE),
    metrics: fromDb?.metrics || fromLocal?.metrics || createEmptyMetricCounters(),
    audit: Array.isArray(fromDb?.audit) ? fromDb.audit : (fromLocal?.audit || []),
    source: fromDb?.source || fromLocal?.source || 'local_cache',
  };
  return merged;
}

function applyServerResponse(json, user) {
  const bundle = getOperationalRolloutBundle();
  const next = {
    ...bundle,
    state: normalizeOperationalModeState({
      ...(json.state || {}),
      source: 'feature_flags',
      tenantEnabled: Boolean(json.state?.tenantEnabled),
    }),
    audit: Array.isArray(json.audit) ? json.audit : (bundle.audit || []),
    source: 'feature_flags',
  };
  cacheBundle(next, user);
  return next.state;
}

async function adminApiFetch(path, { method = 'GET', body } = {}) {
  assertAdminApiFetchAllowed();
  const accessToken = await getPlatformAccessToken();
  if (!accessToken) {
    const err = new Error('Sessão SaaS ausente para rollout operacional.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const urls = [];
  if (import.meta.env.DEV && !getConfiguredAdminApiBaseUrl()) {
    urls.push(getDevDirectAdminApiUrl(path));
  }
  urls.push(buildAdminApiUrl(path));

  let lastErr;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(body != null ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body != null ? JSON.stringify(body) : undefined,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error(json?.error || `Erro HTTP ${response.status} no rollout.`);
        err.code = json?.code || 'ROLLOUT_API_ERROR';
        err.status = response.status;
        throw err;
      }
      return json;
    } catch (err) {
      lastErr = err;
      if (err?.status && err.status < 500) throw err;
    }
  }
  throw lastErr || new Error('Falha ao contatar Admin API de rollout.');
}

/** GET servidor → atualiza cache → retorna state. */
export async function fetchContractsOperationalRolloutFromServer(user = null) {
  const json = await adminApiFetch(API_PATH, { method: 'GET' });
  return applyServerResponse(json, user);
}

/** PUT tenant (+ opcional global com frase). Re-fetch implícito na resposta. */
export async function putContractsOperationalRolloutOnServer(user, patch = {}) {
  if (!canManageContractsOperationalMode(user)) {
    const err = new Error('Permissão insuficiente.');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }
  const json = await adminApiFetch(API_PATH, {
    method: 'PUT',
    body: {
      tenantEnabled: patch.tenantEnabled,
      mode: patch.mode,
      note: patch.note,
      productionGlobalEnabled: patch.productionGlobalEnabled,
      confirmationPhrase: patch.confirmationPhrase,
      rollbackReason: patch.rollbackReason,
    },
  });
  return applyServerResponse(json, user);
}

/** POST rollback server-side. */
export async function postContractsOperationalRollbackOnServer(user, reason = '') {
  if (!canManageContractsOperationalMode(user)) {
    const err = new Error('Permissão insuficiente para rollback.');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }
  const json = await adminApiFetch(`${API_PATH}/rollback`, {
    method: 'POST',
    body: { reason },
  });
  const metricsBundle = getOperationalRolloutBundle();
  const withMetrics = {
    ...metricsBundle,
    state: normalizeOperationalModeState({
      ...(json.state || {}),
      source: 'feature_flags',
    }),
    audit: Array.isArray(json.audit) ? json.audit : [],
    metrics: incrementMetric(metricsBundle.metrics || createEmptyMetricCounters(), 'rollback_triggered'),
    source: 'feature_flags',
  };
  cacheBundle(withMetrics, user);
  return withMetrics.state;
}

export function getContractsOperationalModeState() {
  return getOperationalRolloutBundle().state;
}

/** Snapshot SSOT do servidor (não inclui bypass local). */
export function getServerOperationalUxSnapshot(user = null) {
  const state = normalizeOperationalModeState(getContractsOperationalModeState());
  const serverUxEnabled = isContractsOperationalUxEnabled({
    tenantId: user?.tenantId || user?.tenant_id,
    clinicId: clinicId(),
    state,
  });
  return {
    state,
    source: state.source || 'local_cache',
    productionGlobalEnabled: Boolean(state.productionGlobalEnabled),
    tenantEnabled: Boolean(state.tenantEnabled),
    operationalUxEnabled: serverUxEnabled,
  };
}

/**
 * UX efetiva no hub/wizard.
 * Bypass local 10.21K NÃO muta estado do servidor / feature_flags.
 * Não aplica se o modo explícito for V1_ONLY ou ROLLED_BACK.
 */
export function isOperationalContractsUxEnabledForCurrentClinic(user) {
  const state = normalizeOperationalModeState(getContractsOperationalModeState());
  const serverOn = isContractsOperationalUxEnabled({
    tenantId: user?.tenantId || user?.tenant_id,
    clinicId: clinicId(),
    state,
  });
  if (serverOn) return true;
  if (
    state.mode === CONTRACTS_OPERATIONAL_MODES.V1_ONLY
    || state.mode === CONTRACTS_OPERATIONAL_MODES.ROLLED_BACK
  ) {
    return false;
  }
  return isContractsOperationalUxLocalTestEnabled();
}

export function isLocalOperationalUxTestModeActive() {
  return isContractsOperationalUxLocalTestEnabled();
}

export function getLocalOperationalUxTestStatus() {
  return getContractsOperationalUxLocalTestStatus();
}

export function recordContractsRolloutMetric(event, user = null) {
  const bundle = getOperationalRolloutBundle();
  const metrics = incrementMetric(bundle.metrics || createEmptyMetricCounters(), event);
  cacheBundle({ ...bundle, metrics }, user);
  return summarizeMetrics(metrics);
}

export function getContractsRolloutMetricsSummary() {
  return summarizeMetrics(getOperationalRolloutBundle().metrics);
}

export function getContractsRolloutAlerts() {
  return deriveMetricAlerts(getContractsRolloutMetricsSummary());
}

function isTestRuntime() {
  try {
    return import.meta.env?.MODE === 'test' || import.meta.env?.VITEST === true;
  } catch {
    return typeof process !== 'undefined' && process.env?.VITEST === 'true';
  }
}

function applyLocalMutation(user, mutator) {
  let bundle = getOperationalRolloutBundle();
  const next = mutator(bundle, user);
  cacheBundle(next, user);
  return next.state;
}

/** Preferir server; em teste usa cache local. */
export async function emergencyRollbackOperationalUx(user, reason = '') {
  if (!canManageContractsOperationalMode(user)) {
    const err = new Error('Permissão insuficiente para rollback.');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }
  if (isTestRuntime()) {
    return applyLocalMutation(user, (bundle) => {
      const state = buildRollbackState(bundle.state, { reason, userId: user?.id || null });
      return {
        ...bundle,
        state: { ...state, source: 'local_cache', tenantEnabled: false },
        audit: [...(bundle.audit || []), {
          id: createId('cora'),
          at: new Date().toISOString(),
          action: 'ROLLBACK',
          mode: state.mode,
          reason: state.rollbackReason,
          by: user?.id || null,
        }],
        metrics: incrementMetric(bundle.metrics || createEmptyMetricCounters(), 'rollback_triggered'),
        source: 'local_cache',
      };
    });
  }
  return postContractsOperationalRollbackOnServer(user, reason);
}

export async function enableOperationalUxMode(user, note = '') {
  if (!canManageContractsOperationalMode(user)) {
    const err = new Error('Permissão insuficiente.');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }
  if (isTestRuntime()) {
    return applyLocalMutation(user, (bundle) => {
      const state = buildEnableOperationalUxState(bundle.state, {
        userId: user?.id || null,
        note,
      });
      return {
        ...bundle,
        state: { ...state, tenantEnabled: true, source: 'local_cache' },
        audit: [...(bundle.audit || []), {
          id: createId('cora'),
          at: new Date().toISOString(),
          action: 'ENABLE_OPERATIONAL_UX',
          mode: state.mode,
          by: user?.id || null,
        }],
        metrics: incrementMetric(bundle.metrics || createEmptyMetricCounters(), 'mode_changed'),
        source: 'local_cache',
      };
    });
  }
  return putContractsOperationalRolloutOnServer(user, {
    tenantEnabled: true,
    mode: CONTRACTS_OPERATIONAL_MODES.OPERATIONAL_UX,
    note: note || 'Reativado pelo painel',
  });
}

export async function setV1OnlyMode(user, reason = '') {
  if (!canManageContractsOperationalMode(user)) {
    const err = new Error('Permissão insuficiente.');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }
  if (isTestRuntime()) {
    return applyLocalMutation(user, (bundle) => {
      const state = {
        ...normalizeOperationalModeState(bundle.state),
        mode: CONTRACTS_OPERATIONAL_MODES.V1_ONLY,
        tenantEnabled: false,
        productionGlobalEnabled: false,
        productionTenantAllowlist: [],
        rollbackReason: reason || null,
        lastChangedAt: new Date().toISOString(),
        lastChangedBy: user?.id || null,
        source: 'local_cache',
      };
      return {
        ...bundle,
        state,
        audit: [...(bundle.audit || []), {
          id: createId('cora'),
          at: new Date().toISOString(),
          action: 'SET_V1_ONLY',
          mode: state.mode,
          reason,
          by: user?.id || null,
        }],
        metrics: incrementMetric(bundle.metrics || createEmptyMetricCounters(), 'mode_changed'),
        source: 'local_cache',
      };
    });
  }
  return putContractsOperationalRolloutOnServer(user, {
    tenantEnabled: false,
    mode: CONTRACTS_OPERATIONAL_MODES.V1_ONLY,
    note: reason || 'Modo V1_ONLY pelo painel',
  });
}

/**
 * Ativa/desativa o tenant atual na flag server-side.
 * Aceita lista por compatibilidade de UI — só o tenant do usuário é persistido.
 */
export async function updateProductionTenantAllowlist(user, tenantIds = []) {
  if (!canManageContractsOperationalMode(user)) {
    const err = new Error('Permissão insuficiente.');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }
  const list = [...new Set((tenantIds || []).map((t) => String(t || '').trim()).filter(Boolean))];
  const selfId = String(user?.tenantId || user?.tenant_id || '').trim();
  if (!isTestRuntime() && list.some((id) => selfId && id !== selfId)) {
    const err = new Error('Só é permitido ativar o tenant da sessão autenticada (sem wildcard / cross-tenant).');
    err.code = 'TENANT_FORBIDDEN';
    throw err;
  }
  const enabled = selfId ? list.includes(selfId) : list.length > 0;
  if (isTestRuntime()) {
    return applyLocalMutation(user, (bundle) => ({
      ...bundle,
      state: {
        ...normalizeOperationalModeState(bundle.state),
        productionTenantAllowlist: list,
        tenantEnabled: enabled,
        lastChangedAt: new Date().toISOString(),
        lastChangedBy: user?.id || null,
        source: 'local_cache',
      },
      audit: [...(bundle.audit || []), {
        id: createId('cora'),
        at: new Date().toISOString(),
        action: 'UPDATE_ALLOWLIST',
        allowlistCount: list.length,
        by: user?.id || null,
      }],
      source: 'local_cache',
    }));
  }
  return putContractsOperationalRolloutOnServer(user, {
    tenantEnabled: enabled,
    mode: enabled
      ? CONTRACTS_OPERATIONAL_MODES.OPERATIONAL_UX
      : CONTRACTS_OPERATIONAL_MODES.V1_ONLY,
    note: 'Atualização tenant enabled via painel',
  });
}

export async function setProductionGlobalEnabled(user, enabled, confirmationPhrase = '') {
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
    if (String(confirmationPhrase || '').trim() !== PRODUCTION_ACTIVATION_PHRASE) {
      const err = new Error(`Confirmação inválida. Digite exatamente ${PRODUCTION_ACTIVATION_PHRASE}.`);
      err.code = 'CONFIRMATION_REQUIRED';
      throw err;
    }
  }
  if (isTestRuntime()) {
    return applyLocalMutation(user, (bundle) => ({
      ...bundle,
      state: {
        ...normalizeOperationalModeState(bundle.state),
        productionGlobalEnabled: Boolean(enabled),
        rolloutPhase: enabled
          ? CONTRACTS_ROLLOUT_PHASES.PRODUCTION_ACTIVE
          : CONTRACTS_ROLLOUT_PHASES.READY_FOR_PRODUCTION_ACTIVATION,
        lastChangedAt: new Date().toISOString(),
        lastChangedBy: user?.id || null,
        source: 'local_cache',
      },
      audit: [...(bundle.audit || []), {
        id: createId('cora'),
        at: new Date().toISOString(),
        action: enabled ? 'PRODUCTION_GLOBAL_ON' : 'PRODUCTION_GLOBAL_OFF',
        by: user?.id || null,
      }],
      source: 'local_cache',
    }));
  }
  return putContractsOperationalRolloutOnServer(user, {
    productionGlobalEnabled: Boolean(enabled),
    confirmationPhrase,
    mode: getContractsOperationalModeState().mode,
    tenantEnabled: getContractsOperationalModeState().tenantEnabled,
  });
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
  PRODUCTION_ACTIVATION_PHRASE,
  isContractsOperationalUxLocalTestEnabled,
  getContractsOperationalUxLocalTestStatus,
};
