/**
 * @module domain-events/consumers/domainEventConsumerMetrics
 * @description Métricas in-memory de consumers — Phase 7.6.
 */

export interface DomainEventConsumerMetricsSnapshot {
  totalConsumerDispatches: number;
  totalConsumerSkipped: number;
  totalConsumerSucceeded: number;
  totalConsumerFailed: number;
  totalConsumerRetries: number;
  totalConsumerDuplicates: number;
  totalDeadLettered: number;
  activeConsumers: number;
  startedAt: string | null;
  lastEventAt: string | null;
}

const metrics: DomainEventConsumerMetricsSnapshot = {
  totalConsumerDispatches: 0,
  totalConsumerSkipped: 0,
  totalConsumerSucceeded: 0,
  totalConsumerFailed: 0,
  totalConsumerRetries: 0,
  totalConsumerDuplicates: 0,
  totalDeadLettered: 0,
  activeConsumers: 0,
  startedAt: null,
  lastEventAt: null,
};

type CounterKey = Exclude<
  keyof DomainEventConsumerMetricsSnapshot,
  'startedAt' | 'lastEventAt' | 'activeConsumers'
>;

function touch(key: CounterKey): void {
  const now = new Date().toISOString();
  if (!metrics.startedAt) metrics.startedAt = now;
  metrics.lastEventAt = now;
  metrics[key] += 1;
}

export function recordConsumerDispatchMetric(): void {
  touch('totalConsumerDispatches');
}

export function recordConsumerSkippedMetric(): void {
  touch('totalConsumerSkipped');
}

export function recordConsumerSucceededMetric(): void {
  touch('totalConsumerSucceeded');
}

export function recordConsumerFailedMetric(): void {
  touch('totalConsumerFailed');
}

export function recordConsumerRetryMetric(): void {
  touch('totalConsumerRetries');
}

export function recordConsumerDuplicateMetric(): void {
  touch('totalConsumerDuplicates');
}

export function recordConsumerDeadLetterMetric(): void {
  touch('totalDeadLettered');
}

export function setActiveConsumersMetric(count: number): void {
  metrics.activeConsumers = Math.max(0, count);
}

export function getDomainEventConsumerMetrics(): DomainEventConsumerMetricsSnapshot {
  return { ...metrics };
}

export function __clearDomainEventConsumerMetricsForTest(): void {
  metrics.totalConsumerDispatches = 0;
  metrics.totalConsumerSkipped = 0;
  metrics.totalConsumerSucceeded = 0;
  metrics.totalConsumerFailed = 0;
  metrics.totalConsumerRetries = 0;
  metrics.totalConsumerDuplicates = 0;
  metrics.totalDeadLettered = 0;
  metrics.activeConsumers = 0;
  metrics.startedAt = null;
  metrics.lastEventAt = null;
}
