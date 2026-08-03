/**
 * @module domain-events/projections/analyticsProjectionBuilder
 * @description Aplica Domain Events às Analytics Projections tenant-scoped — Phase 8.3.
 * Execução explícita. Flags OFF → no-op. Não altera o evento. Não aplica sem tenant válido.
 */

import {
  isDomainEventAnalyticsEnabled,
  type DomainEventFlagsInput,
} from '../domainEventFlags.js';
import type { DomainEvent } from '../domainEventTypes.js';
import type {
  AnalyticsProjectionApplyResult,
  AnalyticsProjectionId,
} from './analyticsProjectionTypes.js';
import { getAnalyticsProjectionRegistryEntriesForEvent } from './analyticsProjectionRegistry.js';
import { getAnalyticsProjectionReducer } from './analyticsProjectionReducer.js';
import {
  AnalyticsProjectionTenantError,
  assertTenantScopeMatch,
  requireAnalyticsProjectionTenantId,
} from './analyticsProjectionScope.js';
import {
  commitAnalyticsProjectionSnapshot,
  ensureAnalyticsProjectionForTenant,
  getAnalyticsProjectionCount,
  listAnalyticsProjectionsForTenant,
  rebuildAnalyticsProjectionForTenant,
  rebuildAnalyticsProjections,
} from './analyticsProjectionStore.js';
import {
  recordProjectionRejectMetric,
  recordProjectionSkipMetric,
  recordProjectionUpdateMetric,
  recordScopeMetric,
  recordTenantScopeErrorMetric,
  recordTenantScopeMismatchMetric,
  setAnalyticsProjectionTotalMetric,
} from './analyticsProjectionMetrics.js';
import { recordAnalyticsProjectionDiagnostic } from './analyticsProjectionDiagnostics.js';

export interface ApplyAnalyticsProjectionEventInput {
  event: Pick<
    DomainEvent,
    'eventId' | 'eventType' | 'tenantId' | 'timestamp' | 'correlationId'
  >;
  projectionId?: AnalyticsProjectionId;
  tenantId?: string | null;
  flagsInput?: DomainEventFlagsInput;
}

function emptyResult(
  partial: Partial<AnalyticsProjectionApplyResult>,
): AnalyticsProjectionApplyResult {
  return {
    applied: false,
    skipped: false,
    rejected: false,
    projectionIds: [],
    snapshots: [],
    tenantId: null,
    ...partial,
  };
}

/**
 * Apply explícito tenant-aware.
 * tenantId principal vem do Domain Event; explícito deve coincidir se informado.
 */
export function applyAnalyticsProjectionEvent(
  input: ApplyAnalyticsProjectionEventInput,
): AnalyticsProjectionApplyResult {
  const flagsInput = input.flagsInput || {};
  const event = input.event;

  if (!isDomainEventAnalyticsEnabled(flagsInput)) {
    recordProjectionSkipMetric();
    return emptyResult({
      skipped: true,
      reason: 'DOMAIN_EVENT_ANALYTICS=false',
      code: 'FLAGS_OFF',
    });
  }

  let tenantId: string;
  try {
    tenantId = assertTenantScopeMatch(event?.tenantId, input.tenantId);
  } catch (err) {
    const code =
      err instanceof AnalyticsProjectionTenantError
        ? err.code
        : 'MISSING_TENANT_SCOPE';
    recordProjectionRejectMetric();
    if (code === 'TENANT_SCOPE_MISMATCH') {
      recordTenantScopeMismatchMetric();
      if (input.tenantId) {
        try {
          recordScopeMetric(
            input.projectionId || 'crm-counter',
            requireAnalyticsProjectionTenantId(input.tenantId),
            'mismatch',
            String(err),
          );
        } catch {
          /* ignore */
        }
      }
    } else {
      recordTenantScopeErrorMetric();
    }
    recordAnalyticsProjectionDiagnostic(code, String(err instanceof Error ? err.message : err));
    return emptyResult({
      rejected: true,
      reason: err instanceof Error ? err.message : String(err),
      code,
    });
  }

  let entries = getAnalyticsProjectionRegistryEntriesForEvent(String(event?.eventType || ''));
  if (input.projectionId) {
    entries = entries.filter((e) => e.projectionId === input.projectionId);
  }
  if (entries.length === 0) {
    recordProjectionSkipMetric();
    recordScopeMetric('crm-counter', tenantId, 'skip');
    return emptyResult({
      skipped: true,
      reason: 'no analytics projection for eventType',
      code: 'NO_MAPPING',
      tenantId,
    });
  }

  const snapshots = [];
  const projectionIds: AnalyticsProjectionId[] = [];

  for (const entry of entries) {
    const current = ensureAnalyticsProjectionForTenant(entry.projectionId, tenantId);
    const reducer = getAnalyticsProjectionReducer(entry.projectionId);
    const next = reducer(current, {
      eventId: String(event.eventId || ''),
      eventType: String(event.eventType || ''),
      tenantId,
      timestamp: event.timestamp,
      correlationId: event.correlationId ?? null,
    });
    if (next.version === current.version) {
      recordProjectionSkipMetric();
      recordScopeMetric(entry.projectionId, tenantId, 'skip');
      continue;
    }
    const committed = commitAnalyticsProjectionSnapshot(next);
    snapshots.push(committed);
    projectionIds.push(committed.projectionId);
    recordProjectionUpdateMetric();
    recordScopeMetric(entry.projectionId, tenantId, 'apply');
  }

  setAnalyticsProjectionTotalMetric(getAnalyticsProjectionCount());

  return {
    applied: snapshots.length > 0,
    skipped: snapshots.length === 0,
    rejected: false,
    reason: snapshots.length === 0 ? 'reducer produced no change' : undefined,
    code: snapshots.length === 0 ? 'NO_CHANGE' : undefined,
    projectionIds,
    snapshots,
    tenantId,
  };
}

/**
 * Compat: API Phase 7.8 — resolve tenant a partir do evento.
 */
export function applyAnalyticsProjectionFromEvent(
  event: Pick<DomainEvent, 'eventId' | 'eventType' | 'tenantId' | 'timestamp' | 'correlationId'>,
  flagsInput: DomainEventFlagsInput = {},
): AnalyticsProjectionApplyResult {
  return applyAnalyticsProjectionEvent({ event, flagsInput });
}

/** Rebuild explícito por tenant — analytics ON. */
export function rebuildAnalyticsProjectionsIfEnabled(
  flagsInput: DomainEventFlagsInput = {},
  tenantId?: string | null,
) {
  if (!isDomainEventAnalyticsEnabled(flagsInput)) {
    recordProjectionSkipMetric();
    return [];
  }
  if (tenantId == null || String(tenantId).trim() === '') {
    // Sem tenant: limpa residual global; não cria tenants fictícios
    const snaps = rebuildAnalyticsProjections();
    setAnalyticsProjectionTotalMetric(0);
    return snaps;
  }
  const snaps = rebuildAnalyticsProjectionForTenant(String(tenantId).trim());
  setAnalyticsProjectionTotalMetric(getAnalyticsProjectionCount());
  return snaps;
}

/** Compat — lista vazia sem tenant (sem agregação silenciosa). */
export function listCurrentAnalyticsProjections(tenantId?: string | null) {
  if (tenantId == null || String(tenantId).trim() === '') return [];
  return listAnalyticsProjectionsForTenant(String(tenantId).trim());
}
