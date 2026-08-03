/**
 * @module domain-events/read-models/shared/readModelSoakRunner
 * @description Runner explícito de soak — Phase 8.2.
 * Sem background/cron/polling. Sem side-effects de domínio.
 */

import {
  isCqrsReadModelConsistencyEnabled,
  isCqrsReadModelSoakEnabled,
  type DomainEventFlagsInput,
} from '../../domainEventFlags.js';
import { getReadModelDefinition } from './readModelRegistry.js';
import {
  buildReadModelSnapshotExplicit,
  getLastReadModelSnapshot,
} from './readModelBuilder.js';
import { requireReadModelTenantId } from './readModelTenant.js';
import {
  evaluateProjectionScopeForTenantBuild,
  getReadModelProjectionScope,
} from './readModelProjectionScope.js';
import { compareReadModelSnapshots } from './readModelConsistency.js';
import {
  recordSoakBuildAttempt,
  recordSoakBuildFailed,
  recordSoakBuildSucceeded,
  recordSoakCacheHit,
  recordSoakCacheMiss,
  recordSoakProjectionScopeWarning,
  recordSoakRebuild,
} from './readModelSoakMetrics.js';
import type {
  ReadModelSoakIterationResult,
  ReadModelSoakRunResult,
  ReadModelSoakStatus,
} from './readModelSoakTypes.js';
import { getReadModelDriftLog } from './readModelDriftDetector.js';

export const READ_MODEL_SOAK_MAX_ITERATIONS = 20;

export interface RunReadModelSoakValidationInput {
  readModelId: string;
  tenantId: string;
  projectionSnapshots: Readonly<Record<string, unknown>>;
  iterations?: number;
  flagsInput?: DomainEventFlagsInput;
  allowGlobalTestScope?: boolean;
  now?: string;
}

function statusFromRun(input: {
  blocked: boolean;
  failed: boolean;
  warnings: number;
  drifts: number;
  succeeded: number;
}): ReadModelSoakStatus {
  if (input.blocked) return 'blocked';
  if (input.failed) return 'failed';
  if (input.warnings > 0 || input.drifts > 0) return 'warning';
  if (input.succeeded > 0) return 'passing';
  return 'ready';
}

/**
 * Executa soak explícito (testes / staging local).
 * Flags OFF → no-op estruturado.
 */
export function runReadModelSoakValidation(
  input: RunReadModelSoakValidationInput,
): ReadModelSoakRunResult {
  const flagsInput = input.flagsInput || {};
  const ranAt = new Date().toISOString();
  const readModelId = String(input.readModelId || '').trim();
  const tenantId = requireReadModelTenantId(input.tenantId, { allowTestFallback: false });
  const iterations = Math.min(
    READ_MODEL_SOAK_MAX_ITERATIONS,
    Math.max(1, Math.floor(input.iterations || 1)),
  );

  if (!isCqrsReadModelSoakEnabled(flagsInput)) {
    return {
      readModelId,
      tenantId,
      status: 'idle',
      iterations: 0,
      results: [],
      drifts: [],
      scopeWarnings: [],
      promotionBlocked: true,
      blockReasons: ['CQRS_READ_MODEL_SOAK=false'],
      ranAt,
    };
  }

  if (!getReadModelDefinition(readModelId)) {
    return {
      readModelId,
      tenantId,
      status: 'blocked',
      iterations: 0,
      results: [],
      drifts: [],
      scopeWarnings: [],
      promotionBlocked: true,
      blockReasons: ['read model not registered'],
      ranAt,
    };
  }

  const scopeEval = evaluateProjectionScopeForTenantBuild({
    readModelId,
    tenantId,
    allowGlobalTestScope: input.allowGlobalTestScope === true,
  });
  const scopeWarnings: string[] = [];
  if (scopeEval.warning) {
    scopeWarnings.push(scopeEval.warning);
    recordSoakProjectionScopeWarning(readModelId, tenantId);
  }

  if (!scopeEval.allowed) {
    return {
      readModelId,
      tenantId,
      status: 'blocked',
      iterations: 0,
      results: [],
      drifts: [],
      scopeWarnings,
      promotionBlocked: true,
      blockReasons: [scopeEval.warning || 'projection scope blocked'],
      ranAt,
    };
  }

  const results: ReadModelSoakIterationResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let warningCount = scopeWarnings.length;
  let driftCount = 0;

  for (let i = 1; i <= iterations; i += 1) {
    recordSoakBuildAttempt(readModelId, tenantId);
    const previous = getLastReadModelSnapshot(readModelId, tenantId);
    const build = buildReadModelSnapshotExplicit({
      readModelId,
      tenantId,
      projectionSnapshots: input.projectionSnapshots,
      flagsInput,
      useCache: i > 1,
      now: input.now,
    });

    if (build.fromCache) recordSoakCacheHit(readModelId, tenantId);
    else if (i > 1) recordSoakCacheMiss(readModelId, tenantId);

    if (!build.built && !build.fromCache) {
      failed += 1;
      recordSoakBuildFailed(readModelId, tenantId, build.reason || 'build failed');
      results.push({
        iteration: i,
        buildSucceeded: false,
        fromCache: false,
        consistency: null,
        error: build.reason || 'build failed',
        scopeMode: scopeEval.mode,
      });
      continue;
    }

    if (previous && build.built) recordSoakRebuild(readModelId, tenantId);
    recordSoakBuildSucceeded(readModelId, tenantId);
    succeeded += 1;

    let consistency = null;
    if (isCqrsReadModelConsistencyEnabled(flagsInput)) {
      const expected = build.snapshot || getLastReadModelSnapshot(readModelId, tenantId);
      const actual = getLastReadModelSnapshot(readModelId, tenantId);
      consistency = compareReadModelSnapshots({
        readModelId,
        tenantId,
        expected,
        actual,
        sourceProjection: getReadModelProjectionScope(readModelId).projectionId,
      });
      if (!consistency.consistent && consistency.driftKind !== 'metadata-only') {
        driftCount += 1;
        warningCount += 1;
      }
      if (consistency.scopeWarning) warningCount += 1;
    }

    results.push({
      iteration: i,
      buildSucceeded: true,
      fromCache: build.fromCache,
      consistency,
      error: null,
      scopeMode: scopeEval.mode,
    });
  }

  const drifts = getReadModelDriftLog({ readModelId, tenantId });
  const { scope } = getReadModelProjectionScope(readModelId);
  const blockReasons: string[] = [];
  if (scope !== 'tenant') {
    blockReasons.push(`projection scope=${scope} — promotion blocked until tenant-scoped projections`);
  }
  if (failed > 0) blockReasons.push('build failures during soak');
  if (driftCount > 0) blockReasons.push('counter/structural drifts detected');

  const status = statusFromRun({
    blocked: blockReasons.length > 0 && succeeded === 0,
    failed: failed > 0 && succeeded === 0,
    warnings: warningCount + (scope !== 'tenant' ? 1 : 0),
    drifts: driftCount,
    succeeded,
  });

  // Nunca auto-promove flags; com scope=tenant soak pode passar (Phase 8.3)
  const promotionBlocked = true;
  if (scope !== 'tenant' && !blockReasons.some((b) => b.includes('projection scope'))) {
    blockReasons.push('global/unknown projection scope');
  }

  const finalStatus =
    scope !== 'tenant' && status === 'passing'
      ? 'warning'
      : status === 'passing' && scopeWarnings.length === 0
        ? 'passing'
        : status;

  return {
    readModelId,
    tenantId,
    status: finalStatus,
    iterations,
    results,
    drifts,
    scopeWarnings,
    promotionBlocked,
    blockReasons: Object.freeze([...new Set(blockReasons)]),
    ranAt,
  };
}
