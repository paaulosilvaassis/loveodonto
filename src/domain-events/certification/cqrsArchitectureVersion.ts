/**
 * @module domain-events/certification/cqrsArchitectureVersion
 * @description Versão estável da arquitetura CQRS certificável — Phase 8.5.
 */

export const LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION = '3.8.5-cqrs-local' as const;

export const LOVE_ODONTO_V3_CQRS_CERTIFICATION_VERSION = '1.0.0' as const;

/** Componentes incluídos nesta versão arquitetural. */
export const CQRS_ARCHITECTURE_VERSION_COMPONENTS = Object.freeze([
  'domain-events-foundation',
  'domain-event-toolkit',
  'domain-event-facade',
  'domain-event-observability',
  'domain-event-consumer-foundation',
  'event-audit-projection',
  'analytics-projection-foundation',
  'tenant-scoped-analytics-projections',
  'cqrs-read-model-foundation',
  'multi-read-model-adoption',
  'read-model-soak-consistency',
  'cqrs-promotion-readiness',
  'production-guards',
] as const);

export const CQRS_CERTIFIED_READ_MODEL_IDS = Object.freeze([
  'lead-analytics',
  'appointment-analytics',
  'financial-analytics',
] as const);
