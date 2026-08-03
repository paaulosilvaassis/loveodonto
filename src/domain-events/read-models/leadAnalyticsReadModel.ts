/**
 * @module domain-events/read-models/leadAnalyticsReadModel
 * @description LeadAnalyticsReadModel — migrado para CQRS Foundation — Phase 8.1.
 * Compatibilidade de API com o piloto 7.9. Consome crm-counter apenas.
 */

import {
  isLeadAnalyticsReadModelEnabled,
  type DomainEventFlagsInput,
} from '../domainEventFlags.js';
import { getAnalyticsProjection } from '../projections/analyticsProjectionStore.js';
import type { CrmCounterState } from '../projections/analyticsProjectionTypes.js';
import {
  attachLeadAnalyticsReadModel,
} from './attachAnalyticsReadModels.js';
import {
  buildReadModelSnapshotExplicit,
} from './shared/readModelBuilder.js';
import {
  LEAD_ANALYTICS_READ_MODEL_ID,
  leadAnalyticsFromEnvelope,
  type LeadAnalyticsEnvelopePayload,
} from './leadAnalyticsDefinition.js';
import {
  getLeadAnalyticsSnapshot,
  setLeadAnalyticsCompatTenant,
} from './leadAnalyticsStore.js';
import {
  recordLeadAnalyticsSnapshotBuildMetric,
  recordLeadAnalyticsSnapshotSkipMetric,
  recordLeadAnalyticsSnapshotUpdateMetric,
  setLeadAnalyticsTotalSnapshotsMetric,
} from './leadAnalyticsMetrics.js';
import type {
  LeadAnalyticsBuildResult,
  LeadAnalyticsSourceCounters,
  LeadAnalyticsSnapshot,
} from './leadAnalyticsTypes.js';
import { getLeadAnalyticsHistoryCount } from './leadAnalyticsStore.js';
import type { ReadModelSnapshotEnvelope } from './shared/readModelTypes.js';
import { requireReadModelTenantId } from './shared/readModelTenant.js';

function toSourceCounters(counters: CrmCounterState): LeadAnalyticsSourceCounters {
  return {
    leadsCreated: counters.leadsCreated,
    leadsUpdated: counters.leadsUpdated,
    leadsMoved: counters.leadsMoved,
  };
}

/**
 * Atualiza o read model a partir da projection `crm-counter` atual.
 * Flags OFF → no-op. Usa foundation compartilhada (sem store duplicada).
 */
export function refreshLeadAnalyticsReadModel(
  flagsInput: DomainEventFlagsInput = {},
  options: { now?: string; tenantId?: string | null } = {},
): LeadAnalyticsBuildResult {
  if (!isLeadAnalyticsReadModelEnabled(flagsInput)) {
    recordLeadAnalyticsSnapshotSkipMetric();
    return {
      built: false,
      skipped: true,
      reason: 'LEAD_ANALYTICS_READ_MODEL=false',
      snapshot: null,
    };
  }

  attachLeadAnalyticsReadModel(flagsInput);

  let tenantId: string;
  try {
    tenantId = requireReadModelTenantId(options.tenantId, { allowTestFallback: false });
  } catch (err) {
    recordLeadAnalyticsSnapshotSkipMetric();
    return {
      built: false,
      skipped: true,
      reason: err instanceof Error ? err.message : String(err),
      snapshot: null,
    };
  }

  const projection = getAnalyticsProjection('crm-counter', tenantId);
  if (!projection || projection.projectionId !== 'crm-counter' || projection.tenantId !== tenantId) {
    recordLeadAnalyticsSnapshotSkipMetric();
    return {
      built: false,
      skipped: true,
      reason: 'crm-counter projection unavailable for tenant',
      snapshot: null,
    };
  }

  setLeadAnalyticsCompatTenant(tenantId);
  const sourceCounters = toSourceCounters(projection.counters as CrmCounterState);

  recordLeadAnalyticsSnapshotBuildMetric();
  const result = buildReadModelSnapshotExplicit({
    readModelId: LEAD_ANALYTICS_READ_MODEL_ID,
    tenantId,
    now: options.now,
    useCache: false,
    flagsInput,
    projectionSnapshots: {
      crm: {
        counters: sourceCounters,
        version: projection.version,
        updatedAt: projection.updatedAt,
      },
    },
  });

  if (!result.built || !result.snapshot) {
    recordLeadAnalyticsSnapshotSkipMetric();
    return {
      built: false,
      skipped: result.skipped,
      reason: result.reason,
      snapshot: null,
    };
  }

  const snapshot = leadAnalyticsFromEnvelope(
    result.snapshot as ReadModelSnapshotEnvelope<LeadAnalyticsEnvelopePayload>,
  );
  recordLeadAnalyticsSnapshotUpdateMetric();
  setLeadAnalyticsTotalSnapshotsMetric(getLeadAnalyticsHistoryCount(tenantId));

  return {
    built: true,
    skipped: false,
    snapshot,
  };
}

export function getLeadAnalyticsReadModel(
  tenantId?: string | null,
): LeadAnalyticsSnapshot {
  return getLeadAnalyticsSnapshot(tenantId);
}

export function getLeadAnalyticsIndicators(tenantId?: string | null) {
  return getLeadAnalyticsSnapshot(tenantId).indicators;
}
