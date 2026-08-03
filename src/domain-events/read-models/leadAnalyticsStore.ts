/**
 * @module domain-events/read-models/leadAnalyticsStore
 * @description Facade tenant-aware sobre snapshots compartilhados — Phase 8.1.
 * Sem store duplicada de domínio. Sem persistência.
 */

import type {
  LeadAnalyticsSnapshot,
  LeadAnalyticsSourceCounters,
} from './leadAnalyticsTypes.js';
import { createEmptyLeadAnalyticsSnapshot } from './leadAnalyticsBuilder.js';
import { recordLeadAnalyticsSnapshotResetMetric } from './leadAnalyticsMetrics.js';
import {
  getLastReadModelSnapshot,
  listReadModelSnapshotHistory,
  resetReadModelSnapshots,
  setReadModelSnapshotHistoryCap,
} from './shared/readModelBuilder.js';
import {
  LEAD_ANALYTICS_READ_MODEL_ID,
  leadAnalyticsFromEnvelope,
  type LeadAnalyticsEnvelopePayload,
} from './leadAnalyticsDefinition.js';
import type { ReadModelSnapshotEnvelope } from './shared/readModelTypes.js';
import { READ_MODEL_TEST_TENANT } from './shared/readModelTenant.js';

export const LEAD_ANALYTICS_DEFAULT_CAP = 100;

let defaultTenantForCompat: string = READ_MODEL_TEST_TENANT;

export function setLeadAnalyticsCompatTenant(tenantId: string): void {
  defaultTenantForCompat = String(tenantId || '').trim() || READ_MODEL_TEST_TENANT;
}

export function setLeadAnalyticsCap(cap: number): void {
  setReadModelSnapshotHistoryCap(Math.max(1, Math.floor(cap) || LEAD_ANALYTICS_DEFAULT_CAP));
}

export function getLeadAnalyticsCap(): number {
  return LEAD_ANALYTICS_DEFAULT_CAP;
}

function toLegacy(
  envelope: ReadModelSnapshotEnvelope | null,
): LeadAnalyticsSnapshot {
  if (!envelope) return createEmptyLeadAnalyticsSnapshot();
  return leadAnalyticsFromEnvelope(
    envelope as ReadModelSnapshotEnvelope<LeadAnalyticsEnvelopePayload>,
  );
}

export function getLeadAnalyticsSnapshot(
  tenantId: string | null | undefined = defaultTenantForCompat,
): LeadAnalyticsSnapshot {
  return toLegacy(getLastReadModelSnapshot(LEAD_ANALYTICS_READ_MODEL_ID, tenantId));
}

export function getLeadAnalyticsHistory(
  tenantId?: string | null,
): LeadAnalyticsSnapshot[] {
  return listReadModelSnapshotHistory({
    readModelId: LEAD_ANALYTICS_READ_MODEL_ID,
    tenantId: tenantId ?? undefined,
  }).map((e) =>
    leadAnalyticsFromEnvelope(e as ReadModelSnapshotEnvelope<LeadAnalyticsEnvelopePayload>),
  );
}

export function getLeadAnalyticsHistoryCount(tenantId?: string | null): number {
  return getLeadAnalyticsHistory(tenantId).length;
}

export function getLeadAnalyticsLastSourceCounters(
  tenantId: string | null | undefined = defaultTenantForCompat,
): LeadAnalyticsSourceCounters | null {
  const last = getLastReadModelSnapshot(LEAD_ANALYTICS_READ_MODEL_ID, tenantId) as
    | ReadModelSnapshotEnvelope<LeadAnalyticsEnvelopePayload>
    | null;
  return last?.payload?.sourceCounters
    ? { ...last.payload.sourceCounters }
    : null;
}

/** @deprecated Store própria removida — commit ocorre via builder compartilhado. */
export function commitLeadAnalyticsSnapshot(
  snapshot: LeadAnalyticsSnapshot,
): LeadAnalyticsSnapshot {
  return snapshot;
}

export function resetLeadAnalyticsStore(): void {
  resetReadModelSnapshots({ readModelId: LEAD_ANALYTICS_READ_MODEL_ID });
  recordLeadAnalyticsSnapshotResetMetric();
  defaultTenantForCompat = READ_MODEL_TEST_TENANT;
}

export function __clearLeadAnalyticsStoreForTest(): void {
  resetReadModelSnapshots({ readModelId: LEAD_ANALYTICS_READ_MODEL_ID });
  defaultTenantForCompat = READ_MODEL_TEST_TENANT;
}
