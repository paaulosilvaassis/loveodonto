/**
 * @module domain-events/read-models/leadAnalyticsTypes
 * @description Tipos do Lead Analytics Read Model piloto — Phase 7.9.
 * Derivado apenas de Analytics Projections. Sem persistência.
 */

export type LeadAnalyticsHealthStatus = 'idle' | 'ready' | 'healthy' | 'degraded';

export interface LeadAnalyticsIndicators {
  readonly totalLeads: number;
  readonly totalConverted: number;
  readonly totalLost: number;
  readonly totalInProgress: number;
  readonly totalCreatedToday: number;
  readonly totalUpdatedToday: number;
}

export interface LeadAnalyticsSnapshot {
  readonly readModelId: 'lead-analytics';
  readonly version: number;
  readonly builtAt: string;
  readonly sourceProjectionId: 'crm-counter';
  readonly sourceProjectionVersion: number;
  readonly sourceUpdatedAt: string | null;
  readonly tenantId: string | null;
  readonly dayKey: string;
  readonly indicators: LeadAnalyticsIndicators;
}

export interface LeadAnalyticsBuildResult {
  readonly built: boolean;
  readonly skipped: boolean;
  readonly reason?: string;
  readonly snapshot: LeadAnalyticsSnapshot | null;
}

/** Contadores CRM mínimos lidos da projection (sem Domain Events). */
export interface LeadAnalyticsSourceCounters {
  readonly leadsCreated: number;
  readonly leadsUpdated: number;
  readonly leadsMoved: number;
}
