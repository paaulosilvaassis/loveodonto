/**
 * @module domain-events/read-models/shared/readModelTypes
 * @description Contrato oficial CQRS Read Model — Phase 8.0.
 * Sem persistência. Sem auto-execução.
 */

export type ReadModelLifecycleState =
  | 'idle'
  | 'building'
  | 'ready'
  | 'stale'
  | 'rebuilding'
  | 'degraded';

export type ReadModelHealthStatus =
  | 'idle'
  | 'ready'
  | 'healthy'
  | 'warning'
  | 'stale'
  | 'degraded';

export type ReadModelCachePolicy = {
  readonly enabled: boolean;
  readonly ttlMs: number;
  readonly maxEntries: number;
};

export type ReadModelSnapshotPolicy = {
  readonly immutable: true;
  readonly versioned: true;
  readonly tenantAware: boolean;
  readonly maxHistory: number;
};

/** Snapshot canônico compartilhado (payload tipado por Read Model concreto). */
export interface ReadModelSnapshotEnvelope<TPayload = Record<string, unknown>> {
  readonly readModelId: string;
  readonly version: number;
  readonly builtAt: string;
  readonly tenantId: string | null;
  readonly sourceProjectionIds: readonly string[];
  readonly sourceVersions: Readonly<Record<string, number>>;
  readonly lifecycleState: ReadModelLifecycleState;
  readonly payload: TPayload;
}

export type ReadModelBuilderFn<TPayload = Record<string, unknown>> = (input: {
  readonly readModelId: string;
  readonly previous: ReadModelSnapshotEnvelope<TPayload> | null;
  readonly projectionSnapshots: Readonly<Record<string, unknown>>;
  readonly tenantId?: string | null;
  readonly now?: string;
}) => ReadModelSnapshotEnvelope<TPayload>;

/**
 * Contrato oficial — todos os futuros Read Models devem aderir.
 * Nesta phase: apenas estrutura; registry vazio por padrão.
 */
export interface ReadModelDefinition<TPayload = Record<string, unknown>> {
  readonly readModelId: string;
  readonly readModelName: string;
  readonly version: number;
  readonly projectionSources: readonly string[];
  readonly builder: ReadModelBuilderFn<TPayload>;
  readonly lifecycle: {
    readonly initialState: ReadModelLifecycleState;
    readonly autoRebuild: false;
  };
  readonly cachePolicy: ReadModelCachePolicy;
  readonly snapshotPolicy: ReadModelSnapshotPolicy;
  readonly flagKey: string;
  readonly description: string;
}

export interface ReadModelRegistryEntry {
  readonly definition: ReadModelDefinition;
  readonly registeredAt: string;
}

export const DEFAULT_READ_MODEL_CACHE_POLICY: ReadModelCachePolicy = Object.freeze({
  enabled: true,
  ttlMs: 60_000,
  maxEntries: 100,
});

export const DEFAULT_READ_MODEL_SNAPSHOT_POLICY: ReadModelSnapshotPolicy = Object.freeze({
  immutable: true,
  versioned: true,
  tenantAware: true,
  maxHistory: 100,
});
