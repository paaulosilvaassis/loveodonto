/**
 * @module domain-events/projections/analyticsProjectionStore
 * @description Store in-memory tenant-scoped — Phase 8.3.
 * Chave: projectionId::tenantId. Sem agregação multi-tenant silenciosa. Sem persistência.
 */

import type {
  AnalyticsProjectionId,
  AnalyticsProjectionSnapshot,
} from './analyticsProjectionTypes.js';
import { createEmptyAnalyticsProjection } from './analyticsProjectionReducer.js';
import { listRegisteredAnalyticsProjectionIds } from './analyticsProjectionRegistry.js';
import {
  buildAnalyticsProjectionScopeKey,
  parseAnalyticsProjectionScopeKey,
  requireAnalyticsProjectionTenantId,
  AnalyticsProjectionTenantError,
} from './analyticsProjectionScope.js';
import {
  recordProjectionRebuildMetric,
  recordProjectionResetMetric,
  recordScopeMetric,
} from './analyticsProjectionMetrics.js';

export const ANALYTICS_PROJECTION_DEFAULT_CAP = 1000;

const projections = new Map<string, AnalyticsProjectionSnapshot>();
/** Histórico por scope key (ring por tenant+projection). */
const historyByScope = new Map<string, AnalyticsProjectionSnapshot[]>();
let maxCap = ANALYTICS_PROJECTION_DEFAULT_CAP;

function cloneSnap(snap: AnalyticsProjectionSnapshot): AnalyticsProjectionSnapshot {
  return {
    ...snap,
    counters: { ...snap.counters },
  };
}

function historyFor(scopeKey: string): AnalyticsProjectionSnapshot[] {
  if (!historyByScope.has(scopeKey)) historyByScope.set(scopeKey, []);
  return historyByScope.get(scopeKey)!;
}

export function setAnalyticsProjectionCap(cap: number): void {
  maxCap = Math.max(1, Math.floor(cap) || ANALYTICS_PROJECTION_DEFAULT_CAP);
  for (const hist of historyByScope.values()) {
    while (hist.length > maxCap) hist.shift();
  }
}

export function getAnalyticsProjectionCap(): number {
  return maxCap;
}

export function getAnalyticsProjectionCount(tenantId?: string | null): number {
  if (tenantId == null || String(tenantId).trim() === '') {
    return projections.size;
  }
  const tid = requireAnalyticsProjectionTenantId(tenantId);
  let n = 0;
  for (const snap of projections.values()) {
    if (snap.tenantId === tid) n += 1;
  }
  return n;
}

/**
 * Get tenant-aware. tenantId obrigatório.
 * Sem tenant → null (facade de compatibilidade — sem agregação silenciosa).
 */
export function getAnalyticsProjection(
  projectionId: AnalyticsProjectionId,
  tenantId?: string | null,
): AnalyticsProjectionSnapshot | null {
  if (tenantId == null || String(tenantId).trim() === '') {
    return null;
  }
  const key = buildAnalyticsProjectionScopeKey(projectionId, tenantId);
  const snap = projections.get(key);
  return snap ? cloneSnap(snap) : null;
}

/** Lista projections de um único tenant. */
export function listAnalyticsProjectionsForTenant(
  tenantId: string,
): AnalyticsProjectionSnapshot[] {
  const tid = requireAnalyticsProjectionTenantId(tenantId);
  return Array.from(projections.values())
    .filter((s) => s.tenantId === tid)
    .map(cloneSnap);
}

/**
 * Dump multi-tenant apenas com diagnóstico explícito.
 * Sem `diagnostic: true` → lista vazia (não agrega silenciosamente).
 */
export function getAllAnalyticsProjections(
  options: { diagnostic?: boolean; tenantId?: string | null } = {},
): AnalyticsProjectionSnapshot[] {
  if (options.tenantId != null && String(options.tenantId).trim() !== '') {
    return listAnalyticsProjectionsForTenant(String(options.tenantId));
  }
  if (options.diagnostic !== true) {
    return [];
  }
  return Array.from(projections.values()).map(cloneSnap);
}

export function getAnalyticsProjectionHistory(
  options: { tenantId?: string | null; projectionId?: AnalyticsProjectionId | null } = {},
): AnalyticsProjectionSnapshot[] {
  if (options.tenantId == null || String(options.tenantId).trim() === '') {
    return [];
  }
  const tid = requireAnalyticsProjectionTenantId(options.tenantId);
  const out: AnalyticsProjectionSnapshot[] = [];
  for (const [key, hist] of historyByScope.entries()) {
    const parsed = parseAnalyticsProjectionScopeKey(key);
    if (parsed.tenantId !== tid) continue;
    if (options.projectionId && parsed.projectionId !== options.projectionId) continue;
    for (const snap of hist) out.push(cloneSnap(snap));
  }
  return out;
}

export function getAnalyticsProjectionHistoryCount(
  options: { tenantId?: string | null; projectionId?: AnalyticsProjectionId | null } = {},
): number {
  return getAnalyticsProjectionHistory(options).length;
}

export function commitAnalyticsProjectionSnapshot(
  snapshot: AnalyticsProjectionSnapshot,
): AnalyticsProjectionSnapshot {
  if (snapshot.scope !== 'tenant') {
    throw new AnalyticsProjectionTenantError(
      'INVALID_TENANT_SCOPE',
      'somente projections scope=tenant podem ser commitadas',
    );
  }
  const tid = requireAnalyticsProjectionTenantId(snapshot.tenantId);
  const key = buildAnalyticsProjectionScopeKey(snapshot.projectionId, tid);
  const isCreate = !projections.has(key);
  const frozen = Object.freeze({
    ...snapshot,
    tenantId: tid,
    scope: 'tenant' as const,
    counters: Object.freeze({ ...snapshot.counters }),
  });
  projections.set(key, frozen);
  const hist = historyFor(key);
  hist.push(frozen);
  while (hist.length > maxCap) hist.shift();
  recordScopeMetric(snapshot.projectionId, tid, isCreate ? 'create' : 'update');
  return frozen;
}

/** Garante projection vazia para o tenant (lazy — sem bootstrap global). */
export function ensureAnalyticsProjectionForTenant(
  projectionId: AnalyticsProjectionId,
  tenantId: string,
): AnalyticsProjectionSnapshot {
  const existing = getAnalyticsProjection(projectionId, tenantId);
  if (existing) return existing;
  const empty = createEmptyAnalyticsProjection(projectionId, tenantId);
  return commitAnalyticsProjectionSnapshot(empty);
}

export function rebuildAnalyticsProjectionForTenant(
  tenantId: string,
  projectionId?: AnalyticsProjectionId,
): AnalyticsProjectionSnapshot[] {
  const tid = requireAnalyticsProjectionTenantId(tenantId);
  const ids = projectionId
    ? [projectionId]
    : listRegisteredAnalyticsProjectionIds();
  const out: AnalyticsProjectionSnapshot[] = [];
  for (const id of ids) {
    const key = buildAnalyticsProjectionScopeKey(id, tid);
    projections.delete(key);
    historyByScope.delete(key);
    const empty = createEmptyAnalyticsProjection(id, tid);
    out.push(commitAnalyticsProjectionSnapshot(empty));
    recordScopeMetric(id, tid, 'rebuild');
  }
  recordProjectionRebuildMetric();
  return out;
}

/** @deprecated Prefer rebuildAnalyticsProjectionForTenant — rebuild global removido. */
export function rebuildAnalyticsProjections(): AnalyticsProjectionSnapshot[] {
  // Sem tenant: não cria projections fictícias — apenas limpa estado global residual
  projections.clear();
  historyByScope.clear();
  recordProjectionRebuildMetric();
  return [];
}

export function resetAnalyticsProjectionsForTenant(tenantId: string): void {
  const tid = requireAnalyticsProjectionTenantId(tenantId);
  for (const key of [...projections.keys()]) {
    const parsed = parseAnalyticsProjectionScopeKey(key);
    if (parsed.tenantId !== tid) continue;
    projections.delete(key);
    historyByScope.delete(key);
  }
  recordProjectionResetMetric();
  recordScopeMetric('crm-counter', tid, 'reset');
}

export function clearAnalyticsProjectionsById(projectionId: AnalyticsProjectionId): void {
  for (const key of [...projections.keys()]) {
    const parsed = parseAnalyticsProjectionScopeKey(key);
    if (parsed.projectionId !== projectionId) continue;
    projections.delete(key);
    historyByScope.delete(key);
  }
}

/** Clear total — somente testes / reset explícito de ambiente in-memory. */
export function resetAnalyticsProjections(): void {
  projections.clear();
  historyByScope.clear();
  maxCap = ANALYTICS_PROJECTION_DEFAULT_CAP;
  recordProjectionResetMetric();
}

/** Identifica residuals sem scope tenant (não deveria existir pós-8.3). */
export function listResidualGlobalAnalyticsProjections(): AnalyticsProjectionSnapshot[] {
  return Array.from(projections.values())
    .filter((s) => s.scope !== 'tenant' || !s.tenantId)
    .map(cloneSnap);
}

export function __clearAnalyticsProjectionStoreForTest(): void {
  projections.clear();
  historyByScope.clear();
  maxCap = ANALYTICS_PROJECTION_DEFAULT_CAP;
}
