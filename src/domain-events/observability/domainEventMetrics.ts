/**
 * @module domain-events/observability/domainEventMetrics
 * @description Métricas in-memory de Domain Events — Phase 7.3.
 * Sem persistência / sem banco / sem Supabase.
 */

export interface DomainEventMetricsSnapshot {
  totalPrepared: number;
  totalPublished: number;
  totalSkipped: number;
  totalRejected: number;
  totalFailures: number;
  totalDuplicates: number;
  totalRetries: number;
  totalNoOps: number;
  startedAt: string | null;
  lastEventAt: string | null;
}

const metrics: DomainEventMetricsSnapshot = {
  totalPrepared: 0,
  totalPublished: 0,
  totalSkipped: 0,
  totalRejected: 0,
  totalFailures: 0,
  totalDuplicates: 0,
  totalRetries: 0,
  totalNoOps: 0,
  startedAt: null,
  lastEventAt: null,
};

type CounterKey = Exclude<keyof DomainEventMetricsSnapshot, 'startedAt' | 'lastEventAt'>;

function touch(key: CounterKey): void {
  const now = new Date().toISOString();
  if (!metrics.startedAt) metrics.startedAt = now;
  metrics.lastEventAt = now;
  metrics[key] += 1;
}

export function recordDomainEventMetricPrepared(): void {
  touch('totalPrepared');
}

export function recordDomainEventMetricPublished(): void {
  touch('totalPublished');
}

export function recordDomainEventMetricSkipped(): void {
  touch('totalSkipped');
}

export function recordDomainEventMetricRejected(): void {
  touch('totalRejected');
}

export function recordDomainEventMetricFailure(): void {
  touch('totalFailures');
}

export function recordDomainEventMetricDuplicate(): void {
  touch('totalDuplicates');
}

export function recordDomainEventMetricRetry(): void {
  touch('totalRetries');
}

export function recordDomainEventMetricNoOp(): void {
  touch('totalNoOps');
}

/** Mapeia status de audit → métrica. */
export function recordDomainEventMetricFromAuditStatus(
  status: string,
  reason?: string,
): void {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'prepared') {
    recordDomainEventMetricPrepared();
    return;
  }
  if (normalized === 'published') {
    recordDomainEventMetricPublished();
    return;
  }
  if (normalized === 'skipped') {
    if (String(reason || '').toLowerCase().includes('dedup')) {
      recordDomainEventMetricDuplicate();
    } else if (String(reason || '').includes('DOMAIN_EVENTS=false')) {
      recordDomainEventMetricNoOp();
    } else {
      recordDomainEventMetricSkipped();
    }
    return;
  }
  if (normalized === 'rejected') {
    recordDomainEventMetricRejected();
    recordDomainEventMetricFailure();
  }
}

export function getDomainEventMetrics(): DomainEventMetricsSnapshot {
  return { ...metrics };
}

export function __clearDomainEventMetricsForTest(): void {
  metrics.totalPrepared = 0;
  metrics.totalPublished = 0;
  metrics.totalSkipped = 0;
  metrics.totalRejected = 0;
  metrics.totalFailures = 0;
  metrics.totalDuplicates = 0;
  metrics.totalRetries = 0;
  metrics.totalNoOps = 0;
  metrics.startedAt = null;
  metrics.lastEventAt = null;
}
