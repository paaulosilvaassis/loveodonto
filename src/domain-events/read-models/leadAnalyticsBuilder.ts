/**
 * @module domain-events/read-models/leadAnalyticsBuilder
 * @description Monta snapshots imutáveis do Lead Analytics a partir de CRM projection.
 * Não consulta Repository / IndexedDB / Supabase. Não altera Domain Events.
 */

import type {
  LeadAnalyticsSnapshot,
  LeadAnalyticsSourceCounters,
} from './leadAnalyticsTypes.js';

export function toUtcDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'invalid';
  return d.toISOString().slice(0, 10);
}

export function createEmptyLeadAnalyticsSnapshot(
  builtAt = new Date().toISOString(),
): LeadAnalyticsSnapshot {
  return Object.freeze({
    readModelId: 'lead-analytics',
    version: 0,
    builtAt,
    sourceProjectionId: 'crm-counter',
    sourceProjectionVersion: 0,
    sourceUpdatedAt: null,
    tenantId: null,
    dayKey: toUtcDayKey(builtAt),
    indicators: Object.freeze({
      totalLeads: 0,
      totalConverted: 0,
      totalLost: 0,
      totalInProgress: 0,
      totalCreatedToday: 0,
      totalUpdatedToday: 0,
    }),
  });
}

export interface BuildLeadAnalyticsInput {
  readonly sourceCounters: LeadAnalyticsSourceCounters;
  readonly sourceProjectionVersion: number;
  readonly sourceUpdatedAt: string | null;
  readonly tenantId: string | null;
  readonly previous: LeadAnalyticsSnapshot | null;
  readonly previousSource: LeadAnalyticsSourceCounters | null;
  /** Clock injectável para testes de “today”. */
  readonly now?: string;
}

/**
 * Piloto estrutural:
 * - totalLeads ← leadsCreated
 * - totalConverted ← leadsMoved (proxy estrutural até haver estágio de conversão na projection)
 * - totalLost ← 0 (ainda não disponível na projection foundation)
 * - totalInProgress ← max(0, leads - converted - lost)
 * - today counters ← deltas do dia UTC vs build anterior
 */
export function buildLeadAnalyticsSnapshot(
  input: BuildLeadAnalyticsInput,
): LeadAnalyticsSnapshot {
  const now = input.now || new Date().toISOString();
  const dayKey = toUtcDayKey(now);
  const created = Math.max(0, input.sourceCounters.leadsCreated);
  const updated = Math.max(0, input.sourceCounters.leadsUpdated);
  const moved = Math.max(0, input.sourceCounters.leadsMoved);

  const totalLeads = created;
  const totalConverted = moved;
  const totalLost = 0;
  const totalInProgress = Math.max(0, totalLeads - totalConverted - totalLost);

  const prevSource = input.previousSource || {
    leadsCreated: 0,
    leadsUpdated: 0,
    leadsMoved: 0,
  };
  const deltaCreated = Math.max(0, created - prevSource.leadsCreated);
  const deltaUpdated = Math.max(0, updated - prevSource.leadsUpdated);

  const sameDay = input.previous != null && input.previous.dayKey === dayKey;
  const totalCreatedToday = sameDay
    ? input.previous!.indicators.totalCreatedToday + deltaCreated
    : deltaCreated;
  const totalUpdatedToday = sameDay
    ? input.previous!.indicators.totalUpdatedToday + deltaUpdated
    : deltaUpdated;

  return Object.freeze({
    readModelId: 'lead-analytics',
    version: (input.previous?.version || 0) + 1,
    builtAt: now,
    sourceProjectionId: 'crm-counter',
    sourceProjectionVersion: input.sourceProjectionVersion,
    sourceUpdatedAt: input.sourceUpdatedAt,
    tenantId: input.tenantId,
    dayKey,
    indicators: Object.freeze({
      totalLeads,
      totalConverted,
      totalLost,
      totalInProgress,
      totalCreatedToday,
      totalUpdatedToday,
    }),
  });
}
