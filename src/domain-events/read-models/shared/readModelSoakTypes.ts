/**
 * @module domain-events/read-models/shared/readModelSoakTypes
 * @description Tipos de soak / consistency — Phase 8.2.
 */

import type { AnalyticsProjectionScope } from './readModelProjectionScope.js';

export type ReadModelSoakStatus =
  | 'idle'
  | 'ready'
  | 'passing'
  | 'warning'
  | 'blocked'
  | 'failed';

export type ReadModelDriftKind =
  | 'none'
  | 'metadata-only'
  | 'counter-drift'
  | 'tenant-scope-drift'
  | 'version-drift'
  | 'missing-snapshot'
  | 'stale-snapshot'
  | 'invalid-snapshot';

export type ReadModelDriftSeverity = 'info' | 'warn' | 'error';

export interface ReadModelSoakScopeKey {
  readonly readModelId: string;
  readonly tenantId: string;
}

export interface ReadModelDriftRecord {
  readonly readModelId: string;
  readonly tenantId: string;
  readonly kind: ReadModelDriftKind;
  readonly severity: ReadModelDriftSeverity;
  readonly fields: readonly string[];
  readonly expected: unknown;
  readonly actual: unknown;
  readonly detectedAt: string;
  readonly sourceProjection: string | null;
  readonly message: string;
}

export interface ReadModelConsistencyResult {
  readonly consistent: boolean;
  readonly driftKind: ReadModelDriftKind;
  readonly drifts: readonly ReadModelDriftRecord[];
  readonly comparedAt: string;
  readonly projectionScope: AnalyticsProjectionScope;
  readonly scopeWarning: string | null;
}

export interface ReadModelSoakIterationResult {
  readonly iteration: number;
  readonly buildSucceeded: boolean;
  readonly fromCache: boolean;
  readonly consistency: ReadModelConsistencyResult | null;
  readonly error: string | null;
  readonly scopeMode: 'tenant' | 'global-test-scope' | 'blocked' | 'skipped';
}

export interface ReadModelSoakRunResult {
  readonly readModelId: string;
  readonly tenantId: string;
  readonly status: ReadModelSoakStatus;
  readonly iterations: number;
  readonly results: readonly ReadModelSoakIterationResult[];
  readonly drifts: readonly ReadModelDriftRecord[];
  readonly scopeWarnings: readonly string[];
  readonly promotionBlocked: boolean;
  readonly blockReasons: readonly string[];
  readonly ranAt: string;
}

export interface ReadModelSoakReport {
  readonly overall: ReadModelSoakStatus;
  readonly checkedAt: string;
  readonly byReadModel: Record<string, ReadModelSoakStatus>;
  readonly byTenant: Record<string, ReadModelSoakStatus>;
  readonly builds: number;
  readonly rebuilds: number;
  readonly consistent: number;
  readonly drifts: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly projectionScopeWarnings: number;
  readonly tenantIsolationFailures: number;
  readonly promotionRecommendation: 'block' | 'hold' | 'not-applicable';
  readonly blockReasons: readonly string[];
  readonly detail: string;
}
