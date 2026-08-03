/**
 * @module domain-events/read-models/shared/readModelLifecycle
 * @description Ciclo de vida padronizado — isolado por readModelId + tenantId — Phase 8.1.
 */

import type { ReadModelLifecycleState } from './readModelTypes.js';
import { recordReadModelStaleSnapshotMetric } from './readModelMetrics.js';
import { readModelScopeKey, parseReadModelScopeKey } from './readModelTenant.js';

const states = new Map<string, ReadModelLifecycleState>();

const ALLOWED: Record<ReadModelLifecycleState, readonly ReadModelLifecycleState[]> = {
  idle: ['building', 'ready', 'stale', 'degraded'],
  building: ['ready', 'degraded', 'idle'],
  ready: ['stale', 'building', 'rebuilding', 'degraded', 'idle'],
  stale: ['rebuilding', 'building', 'ready', 'degraded', 'idle'],
  rebuilding: ['ready', 'degraded', 'stale'],
  degraded: ['idle', 'building', 'rebuilding', 'ready'],
};

export class ReadModelLifecycleError extends Error {
  readonly code = 'READ_MODEL_LIFECYCLE_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'ReadModelLifecycleError';
  }
}

export function getReadModelLifecycleState(
  readModelId: string,
  tenantId: string | null | undefined = undefined,
): ReadModelLifecycleState {
  const key = readModelScopeKey(readModelId, tenantId, { allowTestFallback: true });
  return states.get(key) || 'idle';
}

export function setReadModelLifecycleState(
  readModelId: string,
  next: ReadModelLifecycleState,
  tenantId: string | null | undefined = undefined,
): ReadModelLifecycleState {
  const key = readModelScopeKey(readModelId, tenantId, { allowTestFallback: true });
  const current = states.get(key) || 'idle';
  if (current === next) return current;
  if (!ALLOWED[current].includes(next)) {
    throw new ReadModelLifecycleError(
      `transição inválida ${current} → ${next} para ${key}`,
    );
  }
  states.set(key, next);
  if (next === 'stale') recordReadModelStaleSnapshotMetric(readModelId);
  return next;
}

export function markReadModelStale(
  readModelId: string,
  tenantId: string | null | undefined = undefined,
): ReadModelLifecycleState {
  const key = readModelScopeKey(readModelId, tenantId, { allowTestFallback: true });
  const current = states.get(key) || 'idle';
  if (current === 'idle' || current === 'stale') {
    states.set(key, 'stale');
    if (current !== 'stale') recordReadModelStaleSnapshotMetric(readModelId);
    return 'stale';
  }
  return setReadModelLifecycleState(readModelId, 'stale', tenantId);
}

export function resetReadModelLifecycle(
  readModelId?: string,
  tenantId?: string | null,
): void {
  if (readModelId && tenantId != null) {
    states.delete(readModelScopeKey(readModelId, tenantId, { allowTestFallback: true }));
    return;
  }
  if (readModelId) {
    const prefix = `${String(readModelId).trim()}::`;
    for (const key of [...states.keys()]) {
      if (key.startsWith(prefix) || key === String(readModelId).trim()) states.delete(key);
    }
    return;
  }
  states.clear();
}

export function listReadModelLifecycleStates(): Record<string, ReadModelLifecycleState> {
  return Object.fromEntries(states.entries());
}

export function listReadModelLifecycleByReadModel(
  readModelId: string,
): Record<string, ReadModelLifecycleState> {
  const id = String(readModelId || '').trim();
  const out: Record<string, ReadModelLifecycleState> = {};
  for (const [key, state] of states.entries()) {
    const parsed = parseReadModelScopeKey(key);
    if (parsed.readModelId === id) out[parsed.tenantId] = state;
  }
  return out;
}

export function __clearReadModelLifecycleForTest(): void {
  states.clear();
}
