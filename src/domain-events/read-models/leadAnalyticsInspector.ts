/**
 * @module domain-events/read-models/leadAnalyticsInspector
 * @description Inspeção interna do Lead Analytics Read Model — Phase 7.9.
 * Sem HTTP. Sem UI.
 */

import type { DomainEventFlagsInput } from '../domainEventFlags.js';
import { getLeadAnalyticsMetrics } from './leadAnalyticsMetrics.js';
import { getLeadAnalyticsHealth } from './leadAnalyticsHealth.js';
import {
  getLeadAnalyticsHistory,
  getLeadAnalyticsHistoryCount,
  getLeadAnalyticsSnapshot,
} from './leadAnalyticsStore.js';
import type { LeadAnalyticsSnapshot } from './leadAnalyticsTypes.js';

export interface LeadAnalyticsInspectorSnapshot {
  current: LeadAnalyticsSnapshot;
  history: LeadAnalyticsSnapshot[];
  historyCount: number;
  metrics: ReturnType<typeof getLeadAnalyticsMetrics>;
  health: ReturnType<typeof getLeadAnalyticsHealth>;
  inspectedAt: string;
}

export function inspectLeadAnalyticsReadModel(
  flagsInput: DomainEventFlagsInput = {},
  options: { tenantId?: string | null } = {},
): LeadAnalyticsInspectorSnapshot {
  const tenantId = options.tenantId;
  return {
    current: getLeadAnalyticsSnapshot(tenantId),
    history: getLeadAnalyticsHistory(tenantId),
    historyCount: getLeadAnalyticsHistoryCount(tenantId),
    metrics: getLeadAnalyticsMetrics(),
    health: getLeadAnalyticsHealth(flagsInput),
    inspectedAt: new Date().toISOString(),
  };
}
