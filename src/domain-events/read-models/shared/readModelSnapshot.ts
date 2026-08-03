/**
 * @module domain-events/read-models/shared/readModelSnapshot
 * @description Infra compartilhada de snapshots imutáveis — Phase 8.0.
 */

import type {
  ReadModelLifecycleState,
  ReadModelSnapshotEnvelope,
} from './readModelTypes.js';

export function freezeReadModelSnapshot<TPayload>(
  snapshot: ReadModelSnapshotEnvelope<TPayload>,
): ReadModelSnapshotEnvelope<TPayload> {
  return Object.freeze({
    ...snapshot,
    sourceProjectionIds: Object.freeze([...snapshot.sourceProjectionIds]),
    sourceVersions: Object.freeze({ ...snapshot.sourceVersions }),
    payload: Object.freeze(
      snapshot.payload && typeof snapshot.payload === 'object'
        ? { ...(snapshot.payload as object) }
        : snapshot.payload,
    ) as TPayload,
  });
}

export function createEmptyReadModelSnapshot<TPayload extends Record<string, unknown>>(
  readModelId: string,
  payload: TPayload,
  options: {
    tenantId?: string | null;
    sourceProjectionIds?: readonly string[];
    now?: string;
    lifecycleState?: ReadModelLifecycleState;
  } = {},
): ReadModelSnapshotEnvelope<TPayload> {
  const builtAt = options.now || new Date().toISOString();
  return freezeReadModelSnapshot({
    readModelId,
    version: 0,
    builtAt,
    tenantId: options.tenantId ?? null,
    sourceProjectionIds: options.sourceProjectionIds || [],
    sourceVersions: {},
    lifecycleState: options.lifecycleState || 'idle',
    payload,
  });
}

export function bumpReadModelSnapshotVersion<TPayload>(
  previous: ReadModelSnapshotEnvelope<TPayload> | null,
  next: Omit<ReadModelSnapshotEnvelope<TPayload>, 'version'> & { version?: number },
): ReadModelSnapshotEnvelope<TPayload> {
  return freezeReadModelSnapshot({
    ...next,
    version: next.version ?? (previous?.version || 0) + 1,
  } as ReadModelSnapshotEnvelope<TPayload>);
}

/** Clone superficial seguro para inspeção (não muta o frozen). */
export function cloneReadModelSnapshot<TPayload>(
  snapshot: ReadModelSnapshotEnvelope<TPayload>,
): ReadModelSnapshotEnvelope<TPayload> {
  return {
    ...snapshot,
    sourceProjectionIds: [...snapshot.sourceProjectionIds],
    sourceVersions: { ...snapshot.sourceVersions },
    payload: {
      ...(snapshot.payload as object),
    } as TPayload,
  };
}
