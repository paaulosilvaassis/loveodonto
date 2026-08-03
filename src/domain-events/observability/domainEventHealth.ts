/**
 * @module domain-events/observability/domainEventHealth
 * @description Indicadores de saúde dos componentes de Domain Events — Phase 7.3.
 */

import { DOMAIN_EVENT_REGISTRY } from '../domainEventRegistry';
import { isDomainEventAuditEnabled, isDomainEventsEnabled } from '../domainEventFlags';
import { getDomainEventMetrics } from './domainEventMetrics';

export type DomainEventHealthStatus = 'healthy' | 'degraded' | 'unavailable' | 'idle';

export interface DomainEventComponentHealth {
  component:
    | 'publisher'
    | 'registry'
    | 'validator'
    | 'serializer'
    | 'bus'
    | 'audit'
    | 'retry'
    | 'deduplication';
  status: DomainEventHealthStatus;
  detail: string;
}

export interface DomainEventHealthReport {
  overall: DomainEventHealthStatus;
  checkedAt: string;
  domainEventsEnabled: boolean;
  components: DomainEventComponentHealth[];
}

function overallFrom(components: DomainEventComponentHealth[]): DomainEventHealthStatus {
  if (components.some((c) => c.status === 'unavailable')) return 'unavailable';
  if (components.some((c) => c.status === 'degraded')) return 'degraded';
  if (components.every((c) => c.status === 'idle')) return 'idle';
  return 'healthy';
}

/**
 * Health check estrutural (sem I/O remoto).
 * Com DOMAIN_EVENTS=false, componentes ficam idle (produção intacta).
 */
export function getDomainEventHealth(): DomainEventHealthReport {
  const enabled = isDomainEventsEnabled();
  const metrics = getDomainEventMetrics();
  const registryOk = Array.isArray(DOMAIN_EVENT_REGISTRY) && DOMAIN_EVENT_REGISTRY.length > 0;

  const components: DomainEventComponentHealth[] = [
    {
      component: 'publisher',
      status: !enabled ? 'idle' : metrics.totalFailures > 0 ? 'degraded' : 'healthy',
      detail: enabled
        ? `published=${metrics.totalPublished} failures=${metrics.totalFailures}`
        : 'DOMAIN_EVENTS=false — publisher no-op',
    },
    {
      component: 'registry',
      status: registryOk ? 'healthy' : 'unavailable',
      detail: registryOk
        ? `${DOMAIN_EVENT_REGISTRY.length} event types registered`
        : 'Registry vazio ou inválido',
    },
    {
      component: 'validator',
      status: !enabled ? 'idle' : metrics.totalRejected > 0 ? 'degraded' : 'healthy',
      detail: `rejected=${metrics.totalRejected}`,
    },
    {
      component: 'serializer',
      status: enabled ? 'healthy' : 'idle',
      detail: enabled ? 'serializer disponível' : 'idle (flags off)',
    },
    {
      component: 'bus',
      status: enabled ? 'healthy' : 'idle',
      detail: enabled ? 'in-process bus disponível' : 'idle (flags off)',
    },
    {
      component: 'audit',
      status: !isDomainEventAuditEnabled()
        ? 'idle'
        : !enabled
          ? 'degraded'
          : 'healthy',
      detail: isDomainEventAuditEnabled()
        ? enabled
          ? 'audit enabled'
          : 'audit on sem DOMAIN_EVENTS'
        : 'DOMAIN_EVENT_AUDIT=false',
    },
    {
      component: 'retry',
      status: !enabled ? 'idle' : metrics.totalRetries > 0 ? 'degraded' : 'healthy',
      detail: `retries=${metrics.totalRetries}`,
    },
    {
      component: 'deduplication',
      status: !enabled ? 'idle' : 'healthy',
      detail: `duplicates=${metrics.totalDuplicates}`,
    },
  ];

  return {
    overall: enabled ? overallFrom(components) : 'idle',
    checkedAt: new Date().toISOString(),
    domainEventsEnabled: enabled,
    components,
  };
}
