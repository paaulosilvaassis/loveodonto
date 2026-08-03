/**
 * @module domain-events/read-models/leadAnalyticsDefinition
 * @description Definição oficial Lead Analytics no contrato CQRS — Phase 8.1.
 */

import {
  DEFAULT_READ_MODEL_CACHE_POLICY,
  DEFAULT_READ_MODEL_SNAPSHOT_POLICY,
  freezeReadModelSnapshot,
  type ReadModelDefinition,
  type ReadModelSnapshotEnvelope,
} from './shared/index.js';
import { buildLeadAnalyticsSnapshot } from './leadAnalyticsBuilder.js';
import type {
  LeadAnalyticsSnapshot,
  LeadAnalyticsSourceCounters,
  LeadAnalyticsIndicators,
} from './leadAnalyticsTypes.js';

export const LEAD_ANALYTICS_READ_MODEL_ID = 'lead-analytics';

export interface LeadAnalyticsEnvelopePayload {
  readonly indicators: LeadAnalyticsIndicators;
  readonly dayKey: string;
  readonly sourceProjectionId: 'crm-counter';
  readonly sourceUpdatedAt: string | null;
  readonly sourceCounters: LeadAnalyticsSourceCounters;
}

export function leadAnalyticsFromEnvelope(
  envelope: ReadModelSnapshotEnvelope<LeadAnalyticsEnvelopePayload>,
): LeadAnalyticsSnapshot {
  return Object.freeze({
    readModelId: 'lead-analytics',
    version: envelope.version,
    builtAt: envelope.builtAt,
    sourceProjectionId: 'crm-counter',
    sourceProjectionVersion: Number(envelope.sourceVersions['crm-counter'] || 0),
    sourceUpdatedAt: envelope.payload.sourceUpdatedAt,
    tenantId: envelope.tenantId,
    dayKey: envelope.payload.dayKey,
    indicators: Object.freeze({ ...envelope.payload.indicators }),
  });
}

export function createLeadAnalyticsReadModelDefinition(): ReadModelDefinition<LeadAnalyticsEnvelopePayload> {
  return {
    readModelId: LEAD_ANALYTICS_READ_MODEL_ID,
    readModelName: 'Lead Analytics',
    version: 1,
    projectionSources: ['crm-counter'],
    builder: ({ previous, projectionSnapshots, tenantId, now }) => {
      const crm = projectionSnapshots.crm as {
        counters?: LeadAnalyticsSourceCounters;
        version?: number;
        updatedAt?: string | null;
      } | undefined;

      const sourceCounters = crm?.counters || {
        leadsCreated: 0,
        leadsUpdated: 0,
        leadsMoved: 0,
      };

      const prevEnvelope = previous as ReadModelSnapshotEnvelope<LeadAnalyticsEnvelopePayload> | null;
      const previousLead = prevEnvelope && prevEnvelope.version > 0
        ? leadAnalyticsFromEnvelope(prevEnvelope)
        : null;
      const previousSource = prevEnvelope?.payload?.sourceCounters ?? null;

      const legacy = buildLeadAnalyticsSnapshot({
        sourceCounters,
        sourceProjectionVersion: Number(crm?.version || 0),
        sourceUpdatedAt: crm?.updatedAt ?? null,
        tenantId: tenantId ?? null,
        previous: previousLead,
        previousSource,
        now,
      });

      return freezeReadModelSnapshot({
        readModelId: LEAD_ANALYTICS_READ_MODEL_ID,
        version: legacy.version,
        builtAt: legacy.builtAt,
        tenantId: String(tenantId || legacy.tenantId || ''),
        sourceProjectionIds: ['crm-counter'],
        sourceVersions: { 'crm-counter': legacy.sourceProjectionVersion },
        lifecycleState: 'ready',
        payload: {
          indicators: legacy.indicators,
          dayKey: legacy.dayKey,
          sourceProjectionId: 'crm-counter',
          sourceUpdatedAt: legacy.sourceUpdatedAt,
          sourceCounters: { ...sourceCounters },
        },
      });
    },
    lifecycle: { initialState: 'idle', autoRebuild: false },
    cachePolicy: { ...DEFAULT_READ_MODEL_CACHE_POLICY, enabled: true },
    snapshotPolicy: { ...DEFAULT_READ_MODEL_SNAPSHOT_POLICY },
    flagKey: 'LEAD_ANALYTICS_READ_MODEL',
    description:
      'Lead analytics from crm-counter. totalConverted≈leadsMoved; totalLost=0; day buckets UTC.',
  };
}
