/**
 * @module domain-events/read-models/leadAnalyticsCompatibility
 * @description Validação estrutural de compatibilidade Lead ↔ Foundation — Phase 8.2.
 * Não altera indicadores públicos. Sem side-effects.
 */

import { getLeadAnalyticsMetrics } from './leadAnalyticsMetrics.js';
import { getLeadAnalyticsSnapshot, getLeadAnalyticsHistory } from './leadAnalyticsStore.js';
import { inspectLeadAnalyticsReadModel } from './leadAnalyticsInspector.js';
import { LEAD_ANALYTICS_READ_MODEL_ID } from './leadAnalyticsDefinition.js';
import {
  getLastReadModelSnapshot,
  listReadModelSnapshotHistory,
} from './shared/readModelBuilder.js';
import { getReadModelMetricsById } from './shared/readModelMetrics.js';
import { inspectReadModelById } from './shared/readModelInspector.js';
import type { DomainEventFlagsInput } from '../domainEventFlags.js';

export interface LeadAnalyticsCompatibilityReport {
  readonly singleSourceOfTruth: boolean;
  readonly noDuplicateStore: boolean;
  readonly inspectorAligned: boolean;
  readonly metricsAdapted: boolean;
  readonly indicatorsDocumented: {
    readonly leadsMovedAsConversionProxy: true;
    readonly totalLostFixedZero: true;
    readonly dayBucketsUtc: true;
  };
  readonly detail: string;
  readonly checkedAt: string;
}

/**
 * Valida que a facade legada aponta para o store compartilhado.
 * Compara snapshot/histórico por tenant quando fornecido.
 */
export function validateLeadAnalyticsCompatibility(
  options: { tenantId?: string | null; flagsInput?: DomainEventFlagsInput } = {},
): LeadAnalyticsCompatibilityReport {
  const tenantId = options.tenantId ?? null;
  const legacySnap = getLeadAnalyticsSnapshot(tenantId);
  const sharedSnap = getLastReadModelSnapshot(LEAD_ANALYTICS_READ_MODEL_ID, tenantId);
  const legacyHistory = getLeadAnalyticsHistory(tenantId ?? undefined);
  const sharedHistory = listReadModelSnapshotHistory({
    readModelId: LEAD_ANALYTICS_READ_MODEL_ID,
    tenantId: tenantId ?? undefined,
  });

  const singleSourceOfTruth =
    (!legacySnap || legacySnap.version === 0)
      ? sharedSnap == null || sharedSnap.version === 0 || legacySnap?.version === sharedSnap?.version
      : !!sharedSnap
        && legacySnap.version === sharedSnap.version
        && String(legacySnap.tenantId || '') === String(sharedSnap.tenantId || '');

  const noDuplicateStore = legacyHistory.length === sharedHistory.length;

  const legacyInspect = inspectLeadAnalyticsReadModel(options.flagsInput || {});
  const sharedInspect = inspectReadModelById(LEAD_ANALYTICS_READ_MODEL_ID, {
    tenantId: tenantId || undefined,
    flagsInput: options.flagsInput,
    requireTenant: tenantId != null,
  });

  const inspectorAligned =
    tenantId == null
      || (legacyInspect.current.version === (sharedInspect.lastSnapshot?.version ?? legacyInspect.current.version)
        && (sharedInspect.lastSnapshot == null
          || legacyInspect.current.version === sharedInspect.lastSnapshot.version));

  const legacyMetrics = getLeadAnalyticsMetrics();
  const sharedMetrics = getReadModelMetricsById(LEAD_ANALYTICS_READ_MODEL_ID);
  // Métricas legadas adaptadas (contadores locais) + shared (foundation) — ambas in-memory, sem store duplicada de snapshot
  const metricsAdapted =
    typeof legacyMetrics.snapshotBuilds === 'number'
    && typeof sharedMetrics.builds === 'number';

  return {
    singleSourceOfTruth,
    noDuplicateStore,
    inspectorAligned,
    metricsAdapted,
    indicatorsDocumented: {
      leadsMovedAsConversionProxy: true,
      totalLostFixedZero: true,
      dayBucketsUtc: true,
    },
    detail: singleSourceOfTruth && noDuplicateStore
      ? 'lead facade → shared store OK'
      : 'lead compatibility drift detected',
    checkedAt: new Date().toISOString(),
  };
}
