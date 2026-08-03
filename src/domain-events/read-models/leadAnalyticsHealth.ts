/**
 * @module domain-events/read-models/leadAnalyticsHealth
 * @description Health do Lead Analytics Read Model — Phase 7.9.
 */

import {
  isLeadAnalyticsReadModelEnabled,
  type DomainEventFlagsInput,
} from '../domainEventFlags.js';
import { getLeadAnalyticsMetrics } from './leadAnalyticsMetrics.js';
import {
  getLeadAnalyticsHistoryCount,
  getLeadAnalyticsSnapshot,
} from './leadAnalyticsStore.js';
import type { LeadAnalyticsHealthStatus } from './leadAnalyticsTypes.js';

export interface LeadAnalyticsHealthReport {
  overall: LeadAnalyticsHealthStatus;
  checkedAt: string;
  readModelEnabled: boolean;
  snapshotVersion: number;
  historyCount: number;
  detail: string;
}

export function getLeadAnalyticsHealth(
  flagsInput: DomainEventFlagsInput = {},
): LeadAnalyticsHealthReport {
  const readModelEnabled = isLeadAnalyticsReadModelEnabled(flagsInput);
  const snap = getLeadAnalyticsSnapshot();
  const historyCount = getLeadAnalyticsHistoryCount();
  const metrics = getLeadAnalyticsMetrics();
  const checkedAt = new Date().toISOString();

  if (!readModelEnabled) {
    return {
      overall: 'idle',
      checkedAt,
      readModelEnabled,
      snapshotVersion: snap.version,
      historyCount,
      detail: 'LEAD_ANALYTICS_READ_MODEL=false',
    };
  }

  if (metrics.snapshotBuilds === 0 && historyCount === 0) {
    return {
      overall: 'ready',
      checkedAt,
      readModelEnabled,
      snapshotVersion: snap.version,
      historyCount,
      detail: 'read model ready — awaiting builds from analytics projection',
    };
  }

  if (snap.version > 0 && snap.sourceProjectionVersion < 0) {
    return {
      overall: 'degraded',
      checkedAt,
      readModelEnabled,
      snapshotVersion: snap.version,
      historyCount,
      detail: 'inconsistent source projection version',
    };
  }

  return {
    overall: 'healthy',
    checkedAt,
    readModelEnabled,
    snapshotVersion: snap.version,
    historyCount,
    detail: `builds=${metrics.snapshotBuilds} updates=${metrics.snapshotUpdates}`,
  };
}
