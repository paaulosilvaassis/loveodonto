/**
 * @module domain-events/consumers/domainEventConsumerHealth
 * @description Health dos componentes de consumers — Phase 7.6.
 */

import {
  isDomainEventConsumerAuditEnabled,
  isDomainEventConsumerRetryEnabled,
  isDomainEventConsumersEnabled,
  isDomainEventProjectionEnabled,
} from '../domainEventFlags.js';
import { getRegisteredDomainEventConsumerCount } from './domainEventConsumerRegistry.js';
import { getDomainEventConsumerDeadLetterCount } from './domainEventConsumerDeadLetter.js';
import { getDomainEventConsumerMetrics } from './domainEventConsumerMetrics.js';
import { DOMAIN_EVENT_CONSUMER_AUTO_WIRING } from './domainEventConsumerDispatcher.js';
import { getEventAuditProjectionCount } from './eventAuditProjectionStore.js';
import { isEventAuditProjectionAttached } from './attachEventAuditProjection.js';

export type DomainEventConsumerHealthStatus = 'healthy' | 'degraded' | 'unavailable' | 'idle';

export interface DomainEventConsumerComponentHealth {
  component:
    | 'consumer_registry'
    | 'dispatcher'
    | 'runner'
    | 'retry'
    | 'dead_letter'
    | 'audit'
    | 'audit_projection';
  status: DomainEventConsumerHealthStatus;
  detail: string;
}

export interface DomainEventConsumerHealthReport {
  overall: DomainEventConsumerHealthStatus;
  checkedAt: string;
  consumersEnabled: boolean;
  autoWiring: false;
  components: DomainEventConsumerComponentHealth[];
}

function overallFrom(
  components: DomainEventConsumerComponentHealth[],
  enabled: boolean,
): DomainEventConsumerHealthStatus {
  if (!enabled) return 'idle';
  if (components.some((c) => c.status === 'unavailable')) return 'unavailable';
  if (components.some((c) => c.status === 'degraded')) return 'degraded';
  if (components.every((c) => c.status === 'idle')) return 'idle';
  return 'healthy';
}

export function getDomainEventConsumerHealth(): DomainEventConsumerHealthReport {
  const enabled = isDomainEventConsumersEnabled();
  const metrics = getDomainEventConsumerMetrics();
  const registered = getRegisteredDomainEventConsumerCount();

  const components: DomainEventConsumerComponentHealth[] = [
    {
      component: 'consumer_registry',
      status: enabled ? 'healthy' : 'idle',
      detail: `registered=${registered} (default empty until tests)`,
    },
    {
      component: 'dispatcher',
      status: !enabled
        ? 'idle'
        : DOMAIN_EVENT_CONSUMER_AUTO_WIRING
          ? 'degraded'
          : 'healthy',
      detail: DOMAIN_EVENT_CONSUMER_AUTO_WIRING
        ? 'auto-wiring ON (unexpected)'
        : 'explicit dispatch only — no Event Bus auto-wiring',
    },
    {
      component: 'runner',
      status: !enabled
        ? 'idle'
        : metrics.totalConsumerFailed > 0
          ? 'degraded'
          : 'healthy',
      detail: `succeeded=${metrics.totalConsumerSucceeded} failed=${metrics.totalConsumerFailed}`,
    },
    {
      component: 'retry',
      status: !isDomainEventConsumerRetryEnabled()
        ? 'idle'
        : metrics.totalConsumerRetries > 0
          ? 'degraded'
          : 'healthy',
      detail: isDomainEventConsumerRetryEnabled()
        ? `retries=${metrics.totalConsumerRetries}`
        : 'DOMAIN_EVENT_CONSUMER_RETRY=false',
    },
    {
      component: 'dead_letter',
      status: !enabled
        ? 'idle'
        : getDomainEventConsumerDeadLetterCount() > 0
          ? 'degraded'
          : 'healthy',
      detail: `deadLettered=${getDomainEventConsumerDeadLetterCount()}`,
    },
    {
      component: 'audit',
      status: !isDomainEventConsumerAuditEnabled() ? 'idle' : 'healthy',
      detail: isDomainEventConsumerAuditEnabled()
        ? 'consumer audit enabled'
        : 'DOMAIN_EVENT_CONSUMER_AUDIT=false',
    },
    {
      component: 'audit_projection',
      status: isEventAuditProjectionAttached()
        ? 'healthy'
        : isDomainEventProjectionEnabled()
          ? 'degraded'
          : 'idle',
      detail: isEventAuditProjectionAttached()
        ? `attached=true projected=${getEventAuditProjectionCount()}`
        : isDomainEventProjectionEnabled()
          ? 'DOMAIN_EVENT_PROJECTION=true but not attached'
          : 'DOMAIN_EVENT_PROJECTION=false',
    },
  ];

  return {
    overall: overallFrom(components, enabled),
    checkedAt: new Date().toISOString(),
    consumersEnabled: enabled,
    autoWiring: false,
    components,
  };
}
