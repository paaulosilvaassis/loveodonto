/**
 * @module domain-events/consumers
 * @description Domain Event Consumer Foundation — Phase 7.6.
 * Sem handlers de negócio. Sem auto-wiring no Event Bus.
 */

export * from './domainEventConsumerTypes.js';
export * from './domainEventConsumerContracts.js';
export * from './domainEventConsumerRegistry.js';
export * from './domainEventConsumerContext.js';
export * from './domainEventConsumerRetry.js';
export * from './domainEventConsumerDeadLetter.js';
export * from './domainEventConsumerAudit.js';
export * from './domainEventConsumerMetrics.js';
export * from './domainEventConsumerRunner.js';
export * from './domainEventConsumerDispatcher.js';
export * from './domainEventConsumerHealth.js';
export * from './eventAuditProjectionStore.js';
export * from './eventAuditProjectionConsumer.js';
export * from './attachEventAuditProjection.js';
