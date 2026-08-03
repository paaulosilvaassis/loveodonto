/**
 * @module domain-events/read-models/financialAnalytics
 * @description Financial Analytics Read Model — Phase 8.1.
 * Somente financial-counter. Sem valores monetários inventados.
 */

import {
  DEFAULT_READ_MODEL_CACHE_POLICY,
  DEFAULT_READ_MODEL_SNAPSHOT_POLICY,
  freezeReadModelSnapshot,
  type ReadModelDefinition,
} from './shared/index.js';
import type { FinancialCounterState } from '../projections/analyticsProjectionTypes.js';

export const FINANCIAL_ANALYTICS_READ_MODEL_ID = 'financial-analytics';

export interface FinancialAnalyticsIndicators {
  readonly totalReceivablesCreated: number;
  readonly totalReceivablesUpdated: number;
  readonly totalPayablesCreated: number;
  readonly totalPayablesUpdated: number;
  readonly totalPayablesDeleted: number;
  readonly totalFinancingsCreated: number;
  readonly totalFinancingsUpdated: number;
  readonly totalPaymentsReceived: number;
}

export interface FinancialAnalyticsEnvelopePayload {
  readonly indicators: FinancialAnalyticsIndicators;
}

export function buildFinancialAnalyticsIndicators(
  counters: FinancialCounterState,
): FinancialAnalyticsIndicators {
  return Object.freeze({
    totalReceivablesCreated: counters.receivablesCreated,
    totalReceivablesUpdated: counters.receivablesUpdated,
    totalPayablesCreated: counters.payablesCreated,
    totalPayablesUpdated: counters.payablesUpdated,
    totalPayablesDeleted: counters.payablesDeleted,
    totalFinancingsCreated: counters.financingsCreated,
    totalFinancingsUpdated: counters.financingsUpdated,
    totalPaymentsReceived: counters.paymentsReceived,
  });
}

export function createFinancialAnalyticsReadModelDefinition(): ReadModelDefinition<FinancialAnalyticsEnvelopePayload> {
  return {
    readModelId: FINANCIAL_ANALYTICS_READ_MODEL_ID,
    readModelName: 'Financial Analytics',
    version: 1,
    projectionSources: ['financial-counter'],
    builder: ({ previous, projectionSnapshots, tenantId, now }) => {
      const fin = projectionSnapshots.financial as {
        counters?: FinancialCounterState;
        version?: number;
      } | undefined;
      const counters = fin?.counters || {
        receivablesCreated: 0,
        receivablesUpdated: 0,
        payablesCreated: 0,
        payablesUpdated: 0,
        payablesDeleted: 0,
        financingsCreated: 0,
        financingsUpdated: 0,
        paymentsReceived: 0,
      };
      const indicators = buildFinancialAnalyticsIndicators(counters);
      return freezeReadModelSnapshot({
        readModelId: FINANCIAL_ANALYTICS_READ_MODEL_ID,
        version: (previous?.version || 0) + 1,
        builtAt: now || new Date().toISOString(),
        tenantId: String(tenantId || ''),
        sourceProjectionIds: ['financial-counter'],
        sourceVersions: { 'financial-counter': Number(fin?.version || 0) },
        lifecycleState: 'ready',
        payload: { indicators },
      });
    },
    lifecycle: { initialState: 'idle', autoRebuild: false },
    cachePolicy: { ...DEFAULT_READ_MODEL_CACHE_POLICY },
    snapshotPolicy: { ...DEFAULT_READ_MODEL_SNAPSHOT_POLICY },
    flagKey: 'FINANCIAL_ANALYTICS_READ_MODEL',
    description:
      'Financial analytics from financial-counter only. Contadores estruturais — sem totais monetários.',
  };
}
