/**
 * @module domain-events/read-models/shared/readModelPromotionChecklist
 * @description Checklist estrutural de Promotion Readiness — Phase 8.4.
 * Sem side-effects. Sem alteração de flags.
 */

import {
  DOMAIN_EVENT_FLAG_DEFAULTS,
  DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS,
  getDomainEventFlags,
  type DomainEventFlagsInput,
} from '../../domainEventFlags.js';
import { getReadModelDefinition } from './readModelRegistry.js';
import { listReadModelLifecycleStates } from './readModelLifecycle.js';
import {
  listReadModelSnapshotHistory,
} from './readModelBuilder.js';
import { getReadModelCachePolicy } from './readModelCache.js';
import { getReadModelMetricsById } from './readModelMetrics.js';
import { getReadModelHealthById } from './readModelHealth.js';
import { getReadModelDriftLog } from './readModelDriftDetector.js';
import { getAllReadModelSoakMetrics } from './readModelSoakMetrics.js';
import { buildReadModelSoakReport } from './readModelSoakReport.js';
import {
  getReadModelProjectionScope,
  evaluateProjectionScopeForTenantBuild,
} from './readModelProjectionScope.js';
import { validateReadModelEnvelopeStructure } from './readModelConsistency.js';
import { parseReadModelScopeKey } from './readModelTenant.js';
import type {
  ReadModelPromotionCheckResult,
  ReadModelPromotionCheckId,
} from './readModelPromotionTypes.js';

function check(
  checkId: ReadModelPromotionCheckId,
  result: ReadModelPromotionCheckResult['result'],
  message: string,
  options: { blocking?: boolean; detail?: string } = {},
): ReadModelPromotionCheckResult {
  const blocking = options.blocking ?? result === 'fail';
  return Object.freeze({
    checkId,
    result,
    blocking: result === 'fail' ? blocking : false,
    message,
    detail: options.detail,
  });
}

/**
 * Executa checklist completo para um Read Model (escopo Phase 8.4).
 */
export function runReadModelPromotionChecklist(
  readModelId: string,
  flagsInput: DomainEventFlagsInput = {},
): ReadModelPromotionCheckResult[] {
  const id = String(readModelId || '').trim();
  const results: ReadModelPromotionCheckResult[] = [];
  const { projectionId, scope } = getReadModelProjectionScope(id);
  const definition = getReadModelDefinition(id);
  const flags = getDomainEventFlags(flagsInput);
  const metrics = getReadModelMetricsById(id);
  const health = getReadModelHealthById(id, flagsInput);
  const cache = getReadModelCachePolicy();
  const soakReport = buildReadModelSoakReport(flagsInput);
  const drifts = getReadModelDriftLog({ readModelId: id });
  const hardDrifts = drifts.filter(
    (d) => d.kind !== 'none' && d.kind !== 'metadata-only' && d.severity === 'error',
  );
  const soakMetrics = getAllReadModelSoakMetrics();
  let soakCompared = 0;
  let soakConsistent = 0;
  let soakIsolation = 0;
  for (const [key, m] of Object.entries(soakMetrics)) {
    const parsed = parseReadModelScopeKey(key);
    if (parsed.readModelId !== id) continue;
    soakCompared += m.totalSnapshotsCompared;
    soakConsistent += m.totalConsistent;
    soakIsolation += m.totalTenantIsolationFailures;
  }

  // 1. projection_scope
  if (scope === 'tenant') {
    results.push(check('projection_scope', 'pass', `projection ${projectionId} scope=tenant`));
  } else if (scope === 'global') {
    results.push(check('projection_scope', 'fail', `projection ${projectionId} ainda global`, {
      blocking: true,
    }));
  } else {
    results.push(check('projection_scope', 'fail', 'projection scope unknown', { blocking: true }));
  }

  // 2. tenant_isolation
  const scopeEval = evaluateProjectionScopeForTenantBuild({
    readModelId: id,
    tenantId: '__promotion_eval__',
  });
  if (scopeEval.mode === 'tenant' && soakIsolation === 0) {
    results.push(check('tenant_isolation', 'pass', 'tenant isolation estrutural OK'));
  } else if (soakIsolation > 0) {
    results.push(check('tenant_isolation', 'fail', `isolation failures=${soakIsolation}`, {
      blocking: true,
    }));
  } else {
    results.push(check('tenant_isolation', 'fail', scopeEval.warning || 'tenant isolation blocked', {
      blocking: true,
    }));
  }

  // 3. registry
  if (definition) {
    results.push(check('registry', 'pass', 'read model registrado', {
      detail: `version=${definition.version}`,
    }));
  } else {
    results.push(check('registry', 'warn', 'read model não registrado no momento da avaliação', {
      detail: 'attach opt-in necessário em staging controlado',
    }));
  }

  // 4. lifecycle
  if (definition) {
    if (definition.lifecycle.autoRebuild === false) {
      results.push(check('lifecycle', 'pass', 'autoRebuild=false'));
    } else {
      results.push(check('lifecycle', 'fail', 'autoRebuild deve ser false', { blocking: true }));
    }
  } else {
    const lifecycle = listReadModelLifecycleStates();
    const hasDegraded = Object.entries(lifecycle).some(
      ([k, s]) => (k === id || k.startsWith(`${id}::`)) && s === 'degraded',
    );
    results.push(
      hasDegraded
        ? check('lifecycle', 'fail', 'lifecycle degraded detectado', { blocking: true })
        : check('lifecycle', 'skip', 'lifecycle sem definição registrada'),
    );
  }

  // 5. snapshot
  const history = listReadModelSnapshotHistory({ readModelId: id });
  const last = history.length > 0 ? history[history.length - 1] : null;
  if (last) {
    const struct = validateReadModelEnvelopeStructure(last);
    results.push(
      struct.valid
        ? check('snapshot', 'pass', `último snapshot v${last.version} válido (tenant=${last.tenantId})`)
        : check('snapshot', 'fail', struct.reason || 'snapshot inválido', { blocking: true }),
    );
  } else {
    results.push(check('snapshot', 'warn', 'nenhum snapshot — evidencia limitada'));
  }

  // 6. cache
  if (cache.ttlMs >= 0 && cache.maxEntries >= 1) {
    results.push(check('cache', 'pass', `cache policy ok ttl=${cache.ttlMs} size=${cache.size}`));
  } else {
    results.push(check('cache', 'fail', 'cache policy inválida', { blocking: true }));
  }

  // 7. consistency
  if (soakCompared === 0) {
    results.push(check('consistency', 'warn', 'sem comparações de consistency ainda'));
  } else if (soakConsistent === soakCompared && hardDrifts.length === 0) {
    results.push(check('consistency', 'pass', `consistent ${soakConsistent}/${soakCompared}`));
  } else {
    results.push(check('consistency', 'fail', `inconsistências detectadas`, {
      blocking: true,
      detail: `consistent=${soakConsistent} compared=${soakCompared}`,
    }));
  }

  // 8. drift
  if (hardDrifts.length === 0) {
    results.push(
      drifts.length === 0
        ? check('drift', 'pass', 'sem drifts registrados')
        : check('drift', 'pass', `drifts não-bloqueantes=${drifts.length}`),
    );
  } else {
    results.push(check('drift', 'fail', `hard drifts=${hardDrifts.length}`, { blocking: true }));
  }

  // 9. soak
  const modelSoak = soakReport.byReadModel[id];
  if (!modelSoak || modelSoak === 'idle' || modelSoak === 'ready') {
    results.push(check('soak', 'warn', 'soak ainda não evidenciado como passing'));
  } else if (modelSoak === 'passing') {
    results.push(check('soak', 'pass', 'soak passing'));
  } else if (modelSoak === 'failed' || modelSoak === 'blocked') {
    results.push(check('soak', 'fail', `soak status=${modelSoak}`, { blocking: true }));
  } else {
    results.push(check('soak', 'warn', `soak status=${modelSoak}`));
  }

  // 10. health (operacional — observação apenas)
  if (health.status === 'degraded') {
    results.push(check('health', 'fail', 'health operacional degraded', { blocking: true }));
  } else if (health.status === 'stale') {
    results.push(check('health', 'warn', 'health operacional stale'));
  } else {
    results.push(check('health', 'pass', `health operacional=${health.status}`));
  }

  // 11. metrics
  if (metrics.failures > 0 && metrics.builds === 0) {
    results.push(check('metrics', 'fail', 'failures sem builds bem-sucedidos', { blocking: true }));
  } else {
    results.push(check('metrics', 'pass', `builds=${metrics.builds} failures=${metrics.failures}`));
  }

  // 12. inspector
  results.push(check('inspector', 'pass', 'inspector interno disponível (sem HTTP/UI)'));

  // 13. flags — prontidão arquitetural exige defaults OFF em produção
  const defaultsOff =
    DOMAIN_EVENT_FLAG_DEFAULTS.CQRS_READ_MODEL === false
    && DOMAIN_EVENT_FLAG_DEFAULTS.LEAD_ANALYTICS_READ_MODEL === false
    && DOMAIN_EVENT_FLAG_DEFAULTS.APPOINTMENT_ANALYTICS_READ_MODEL === false
    && DOMAIN_EVENT_FLAG_DEFAULTS.FINANCIAL_ANALYTICS_READ_MODEL === false;
  if (defaultsOff) {
    results.push(check('flags', 'pass', 'defaults OFF preservados (sem auto-promote)'));
  } else {
    results.push(check('flags', 'fail', 'defaults de flags não estão OFF', { blocking: true }));
  }

  // 14. production_guards
  const locked = DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS;
  const requiredLocked = [
    'CQRS_READ_MODEL',
    'LEAD_ANALYTICS_READ_MODEL',
    'APPOINTMENT_ANALYTICS_READ_MODEL',
    'FINANCIAL_ANALYTICS_READ_MODEL',
  ];
  const missing = requiredLocked.filter((k) => !locked.includes(k as typeof locked[number]));
  if (missing.length === 0) {
    results.push(check('production_guards', 'pass', 'production locks cobrem flags CQRS'));
  } else {
    results.push(check('production_guards', 'fail', `locks ausentes: ${missing.join(',')}`, {
      blocking: true,
    }));
  }

  // Nota: flags resolvidas ON em teste não bloqueiam readiness arquitetural —
  // o check flags valida defaults + locks, não o snapshot de staging.
  void flags;

  return Object.freeze(results.map((r) => Object.freeze({ ...r })));
}
