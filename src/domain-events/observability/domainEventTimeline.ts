/**
 * @module domain-events/observability/domainEventTimeline
 * @description Timeline in-memory da cadeia de eventos — Phase 7.3.
 * Apenas infraestrutura. Sem consumidores. Sem renderização.
 */

import type { DomainEventTraceEntry } from './domainEventTrace';

export interface DomainEventTimelineNode {
  eventId: string | null;
  eventType: string;
  status: string;
  correlationId: string | null;
  causationId: string | null;
  aggregateType: string;
  aggregateId: string;
  timestamp: string;
  children: DomainEventTimelineNode[];
}

const timelineEntries: DomainEventTraceEntry[] = [];
const MAX_TIMELINE = 500;

export function appendDomainEventTimeline(entry: DomainEventTraceEntry): void {
  timelineEntries.push({ ...entry });
  if (timelineEntries.length > MAX_TIMELINE) timelineEntries.shift();
}

export function getDomainEventTimelineFlat(): DomainEventTraceEntry[] {
  return timelineEntries
    .slice()
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
    .map((e) => ({ ...e }));
}

/**
 * Monta árvore por causationId → eventId dentro de um correlationId.
 * Eventos sem causation viram roots.
 */
export function buildDomainEventTimelineTree(correlationId?: string): DomainEventTimelineNode[] {
  const scope = correlationId
    ? timelineEntries.filter((e) => e.correlationId === String(correlationId).trim())
    : timelineEntries;

  const byEventId = new Map<string, DomainEventTimelineNode>();
  const roots: DomainEventTimelineNode[] = [];

  for (const entry of scope) {
    const node: DomainEventTimelineNode = {
      eventId: entry.eventId,
      eventType: entry.eventType,
      status: entry.status,
      correlationId: entry.correlationId,
      causationId: entry.causationId,
      aggregateType: entry.aggregateType,
      aggregateId: entry.aggregateId,
      timestamp: entry.timestamp,
      children: [],
    };
    if (entry.eventId) byEventId.set(entry.eventId, node);
  }

  for (const entry of scope) {
    const node = entry.eventId ? byEventId.get(entry.eventId) : null;
    if (!node) continue;
    const parentId = entry.causationId;
    if (parentId && byEventId.has(parentId)) {
      byEventId.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Entradas sem eventId (ex.: skipped early) entram como roots flat
  for (const entry of scope) {
    if (entry.eventId) continue;
    roots.push({
      eventId: null,
      eventType: entry.eventType,
      status: entry.status,
      correlationId: entry.correlationId,
      causationId: entry.causationId,
      aggregateType: entry.aggregateType,
      aggregateId: entry.aggregateId,
      timestamp: entry.timestamp,
      children: [],
    });
  }

  return roots;
}

export function getDomainEventTimelineByCorrelation(correlationId: string): DomainEventTraceEntry[] {
  const key = String(correlationId || '').trim();
  return getDomainEventTimelineFlat().filter((e) => e.correlationId === key);
}

export function __clearDomainEventTimelineForTest(): void {
  timelineEntries.length = 0;
}
