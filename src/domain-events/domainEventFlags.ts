/**
 * @module domain-events/domainEventFlags
 * @description Feature flags Domain Events — Foundation + Observability + Consumers (7.6).
 * Defaults OFF. Produção bloqueada.
 */

import {
  readEnvFlag,
  readTenantFlag,
  REPOSITORY_V3_PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/shared/repositoryV3FlagHelpers.js';
import {
  applyProductionSafeLocksGeneric,
  lockDangerousFlags,
} from '../repositories/shared/repositoryV3ProductionGuards.js';

export const DOMAIN_EVENT_FLAG_KEYS = {
  DOMAIN_EVENTS: 'DOMAIN_EVENTS',
  DOMAIN_EVENT_AUDIT: 'DOMAIN_EVENT_AUDIT',
  DOMAIN_EVENT_OBSERVABILITY: 'DOMAIN_EVENT_OBSERVABILITY',
  DOMAIN_EVENT_CONSUMERS: 'DOMAIN_EVENT_CONSUMERS',
  DOMAIN_EVENT_CONSUMER_AUDIT: 'DOMAIN_EVENT_CONSUMER_AUDIT',
  DOMAIN_EVENT_CONSUMER_RETRY: 'DOMAIN_EVENT_CONSUMER_RETRY',
  DOMAIN_EVENT_PROJECTION: 'DOMAIN_EVENT_PROJECTION',
  DOMAIN_EVENT_ANALYTICS: 'DOMAIN_EVENT_ANALYTICS',
  LEAD_ANALYTICS_READ_MODEL: 'LEAD_ANALYTICS_READ_MODEL',
  CQRS_READ_MODEL: 'CQRS_READ_MODEL',
  APPOINTMENT_ANALYTICS_READ_MODEL: 'APPOINTMENT_ANALYTICS_READ_MODEL',
  FINANCIAL_ANALYTICS_READ_MODEL: 'FINANCIAL_ANALYTICS_READ_MODEL',
  CQRS_READ_MODEL_SOAK: 'CQRS_READ_MODEL_SOAK',
  CQRS_READ_MODEL_CONSISTENCY: 'CQRS_READ_MODEL_CONSISTENCY',
} as const;

export type DomainEventFlagKey = keyof typeof DOMAIN_EVENT_FLAG_KEYS;

export interface DomainEventFlags {
  DOMAIN_EVENTS: boolean;
  DOMAIN_EVENT_AUDIT: boolean;
  DOMAIN_EVENT_OBSERVABILITY: boolean;
  DOMAIN_EVENT_CONSUMERS: boolean;
  DOMAIN_EVENT_CONSUMER_AUDIT: boolean;
  DOMAIN_EVENT_CONSUMER_RETRY: boolean;
  DOMAIN_EVENT_PROJECTION: boolean;
  DOMAIN_EVENT_ANALYTICS: boolean;
  LEAD_ANALYTICS_READ_MODEL: boolean;
  CQRS_READ_MODEL: boolean;
  APPOINTMENT_ANALYTICS_READ_MODEL: boolean;
  FINANCIAL_ANALYTICS_READ_MODEL: boolean;
  CQRS_READ_MODEL_SOAK: boolean;
  CQRS_READ_MODEL_CONSISTENCY: boolean;
}

export interface DomainEventFlagsInput {
  tenantFlags?: Record<string, unknown>;
  overrides?: Partial<DomainEventFlags>;
}

export const DOMAIN_EVENT_FLAG_DEFAULTS: Readonly<DomainEventFlags> = {
  DOMAIN_EVENTS: false,
  DOMAIN_EVENT_AUDIT: false,
  DOMAIN_EVENT_OBSERVABILITY: false,
  DOMAIN_EVENT_CONSUMERS: false,
  DOMAIN_EVENT_CONSUMER_AUDIT: false,
  DOMAIN_EVENT_CONSUMER_RETRY: false,
  DOMAIN_EVENT_PROJECTION: false,
  DOMAIN_EVENT_ANALYTICS: false,
  LEAD_ANALYTICS_READ_MODEL: false,
  CQRS_READ_MODEL: false,
  APPOINTMENT_ANALYTICS_READ_MODEL: false,
  FINANCIAL_ANALYTICS_READ_MODEL: false,
  CQRS_READ_MODEL_SOAK: false,
  CQRS_READ_MODEL_CONSISTENCY: false,
};

export const DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS: readonly DomainEventFlagKey[] = [
  'DOMAIN_EVENTS',
  'DOMAIN_EVENT_AUDIT',
  'DOMAIN_EVENT_OBSERVABILITY',
  'DOMAIN_EVENT_CONSUMERS',
  'DOMAIN_EVENT_CONSUMER_AUDIT',
  'DOMAIN_EVENT_CONSUMER_RETRY',
  'DOMAIN_EVENT_PROJECTION',
  'DOMAIN_EVENT_ANALYTICS',
  'LEAD_ANALYTICS_READ_MODEL',
  'CQRS_READ_MODEL',
  'APPOINTMENT_ANALYTICS_READ_MODEL',
  'FINANCIAL_ANALYTICS_READ_MODEL',
  'CQRS_READ_MODEL_SOAK',
  'CQRS_READ_MODEL_CONSISTENCY',
];

export const PRODUCTION_SUPABASE_PROJECT_REF = REPOSITORY_V3_PRODUCTION_SUPABASE_PROJECT_REF;

export class DomainEventFlagsValidationError extends Error {
  readonly code = 'DOMAIN_EVENT_FLAGS_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'DomainEventFlagsValidationError';
  }
}

const ENV_KEY_MAP: Record<DomainEventFlagKey, string> = {
  DOMAIN_EVENTS: 'VITE_DOMAIN_EVENTS',
  DOMAIN_EVENT_AUDIT: 'VITE_DOMAIN_EVENT_AUDIT',
  DOMAIN_EVENT_OBSERVABILITY: 'VITE_DOMAIN_EVENT_OBSERVABILITY',
  DOMAIN_EVENT_CONSUMERS: 'VITE_DOMAIN_EVENT_CONSUMERS',
  DOMAIN_EVENT_CONSUMER_AUDIT: 'VITE_DOMAIN_EVENT_CONSUMER_AUDIT',
  DOMAIN_EVENT_CONSUMER_RETRY: 'VITE_DOMAIN_EVENT_CONSUMER_RETRY',
  DOMAIN_EVENT_PROJECTION: 'VITE_DOMAIN_EVENT_PROJECTION',
  DOMAIN_EVENT_ANALYTICS: 'VITE_DOMAIN_EVENT_ANALYTICS',
  LEAD_ANALYTICS_READ_MODEL: 'VITE_LEAD_ANALYTICS_READ_MODEL',
  CQRS_READ_MODEL: 'VITE_CQRS_READ_MODEL',
  APPOINTMENT_ANALYTICS_READ_MODEL: 'VITE_APPOINTMENT_ANALYTICS_READ_MODEL',
  FINANCIAL_ANALYTICS_READ_MODEL: 'VITE_FINANCIAL_ANALYTICS_READ_MODEL',
  CQRS_READ_MODEL_SOAK: 'VITE_CQRS_READ_MODEL_SOAK',
  CQRS_READ_MODEL_CONSISTENCY: 'VITE_CQRS_READ_MODEL_CONSISTENCY',
};

export function lockDangerousDomainEventFlags(flags: DomainEventFlags): DomainEventFlags {
  return lockDangerousFlags(flags, DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS);
}

export function applyProductionSafeLocks(flags: DomainEventFlags): DomainEventFlags {
  return applyProductionSafeLocksGeneric(flags, DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS, {
    supabaseHostLockedKeys: DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS,
  });
}

export function validateDomainEventFlags(flags: DomainEventFlags): void {
  if (flags.DOMAIN_EVENT_AUDIT && !flags.DOMAIN_EVENTS) {
    throw new DomainEventFlagsValidationError(
      'DOMAIN_EVENT_AUDIT=true exige DOMAIN_EVENTS=true.',
    );
  }
  if (flags.DOMAIN_EVENT_OBSERVABILITY && !flags.DOMAIN_EVENTS) {
    throw new DomainEventFlagsValidationError(
      'DOMAIN_EVENT_OBSERVABILITY=true exige DOMAIN_EVENTS=true.',
    );
  }
  if (flags.DOMAIN_EVENT_CONSUMERS && !flags.DOMAIN_EVENTS) {
    throw new DomainEventFlagsValidationError(
      'DOMAIN_EVENT_CONSUMERS=true exige DOMAIN_EVENTS=true.',
    );
  }
  if (flags.DOMAIN_EVENT_CONSUMER_AUDIT && !flags.DOMAIN_EVENT_CONSUMERS) {
    throw new DomainEventFlagsValidationError(
      'DOMAIN_EVENT_CONSUMER_AUDIT=true exige DOMAIN_EVENT_CONSUMERS=true.',
    );
  }
  if (flags.DOMAIN_EVENT_CONSUMER_RETRY && !flags.DOMAIN_EVENT_CONSUMERS) {
    throw new DomainEventFlagsValidationError(
      'DOMAIN_EVENT_CONSUMER_RETRY=true exige DOMAIN_EVENT_CONSUMERS=true.',
    );
  }
  if (flags.DOMAIN_EVENT_PROJECTION && !flags.DOMAIN_EVENTS) {
    throw new DomainEventFlagsValidationError(
      'DOMAIN_EVENT_PROJECTION=true exige DOMAIN_EVENTS=true.',
    );
  }
  if (flags.DOMAIN_EVENT_PROJECTION && !flags.DOMAIN_EVENT_CONSUMERS) {
    throw new DomainEventFlagsValidationError(
      'DOMAIN_EVENT_PROJECTION=true exige DOMAIN_EVENT_CONSUMERS=true.',
    );
  }
  if (flags.DOMAIN_EVENT_ANALYTICS && !flags.DOMAIN_EVENTS) {
    throw new DomainEventFlagsValidationError(
      'DOMAIN_EVENT_ANALYTICS=true exige DOMAIN_EVENTS=true.',
    );
  }
  if (flags.DOMAIN_EVENT_ANALYTICS && !flags.DOMAIN_EVENT_CONSUMERS) {
    throw new DomainEventFlagsValidationError(
      'DOMAIN_EVENT_ANALYTICS=true exige DOMAIN_EVENT_CONSUMERS=true.',
    );
  }
  if (flags.LEAD_ANALYTICS_READ_MODEL && !flags.DOMAIN_EVENTS) {
    throw new DomainEventFlagsValidationError(
      'LEAD_ANALYTICS_READ_MODEL=true exige DOMAIN_EVENTS=true.',
    );
  }
  if (flags.LEAD_ANALYTICS_READ_MODEL && !flags.DOMAIN_EVENT_ANALYTICS) {
    throw new DomainEventFlagsValidationError(
      'LEAD_ANALYTICS_READ_MODEL=true exige DOMAIN_EVENT_ANALYTICS=true.',
    );
  }
  if (flags.LEAD_ANALYTICS_READ_MODEL && !flags.CQRS_READ_MODEL) {
    throw new DomainEventFlagsValidationError(
      'LEAD_ANALYTICS_READ_MODEL=true exige CQRS_READ_MODEL=true.',
    );
  }
  if (flags.CQRS_READ_MODEL && !flags.DOMAIN_EVENTS) {
    throw new DomainEventFlagsValidationError(
      'CQRS_READ_MODEL=true exige DOMAIN_EVENTS=true.',
    );
  }
  if (flags.CQRS_READ_MODEL && !flags.DOMAIN_EVENT_ANALYTICS) {
    throw new DomainEventFlagsValidationError(
      'CQRS_READ_MODEL=true exige DOMAIN_EVENT_ANALYTICS=true.',
    );
  }
  if (flags.APPOINTMENT_ANALYTICS_READ_MODEL && !flags.DOMAIN_EVENTS) {
    throw new DomainEventFlagsValidationError(
      'APPOINTMENT_ANALYTICS_READ_MODEL=true exige DOMAIN_EVENTS=true.',
    );
  }
  if (flags.APPOINTMENT_ANALYTICS_READ_MODEL && !flags.DOMAIN_EVENT_ANALYTICS) {
    throw new DomainEventFlagsValidationError(
      'APPOINTMENT_ANALYTICS_READ_MODEL=true exige DOMAIN_EVENT_ANALYTICS=true.',
    );
  }
  if (flags.APPOINTMENT_ANALYTICS_READ_MODEL && !flags.CQRS_READ_MODEL) {
    throw new DomainEventFlagsValidationError(
      'APPOINTMENT_ANALYTICS_READ_MODEL=true exige CQRS_READ_MODEL=true.',
    );
  }
  if (flags.FINANCIAL_ANALYTICS_READ_MODEL && !flags.DOMAIN_EVENTS) {
    throw new DomainEventFlagsValidationError(
      'FINANCIAL_ANALYTICS_READ_MODEL=true exige DOMAIN_EVENTS=true.',
    );
  }
  if (flags.FINANCIAL_ANALYTICS_READ_MODEL && !flags.DOMAIN_EVENT_ANALYTICS) {
    throw new DomainEventFlagsValidationError(
      'FINANCIAL_ANALYTICS_READ_MODEL=true exige DOMAIN_EVENT_ANALYTICS=true.',
    );
  }
  if (flags.FINANCIAL_ANALYTICS_READ_MODEL && !flags.CQRS_READ_MODEL) {
    throw new DomainEventFlagsValidationError(
      'FINANCIAL_ANALYTICS_READ_MODEL=true exige CQRS_READ_MODEL=true.',
    );
  }
  if (flags.CQRS_READ_MODEL_SOAK && !flags.DOMAIN_EVENTS) {
    throw new DomainEventFlagsValidationError(
      'CQRS_READ_MODEL_SOAK=true exige DOMAIN_EVENTS=true.',
    );
  }
  if (flags.CQRS_READ_MODEL_SOAK && !flags.DOMAIN_EVENT_ANALYTICS) {
    throw new DomainEventFlagsValidationError(
      'CQRS_READ_MODEL_SOAK=true exige DOMAIN_EVENT_ANALYTICS=true.',
    );
  }
  if (flags.CQRS_READ_MODEL_SOAK && !flags.CQRS_READ_MODEL) {
    throw new DomainEventFlagsValidationError(
      'CQRS_READ_MODEL_SOAK=true exige CQRS_READ_MODEL=true.',
    );
  }
  if (flags.CQRS_READ_MODEL_CONSISTENCY && !flags.DOMAIN_EVENTS) {
    throw new DomainEventFlagsValidationError(
      'CQRS_READ_MODEL_CONSISTENCY=true exige DOMAIN_EVENTS=true.',
    );
  }
  if (flags.CQRS_READ_MODEL_CONSISTENCY && !flags.DOMAIN_EVENT_ANALYTICS) {
    throw new DomainEventFlagsValidationError(
      'CQRS_READ_MODEL_CONSISTENCY=true exige DOMAIN_EVENT_ANALYTICS=true.',
    );
  }
  if (flags.CQRS_READ_MODEL_CONSISTENCY && !flags.CQRS_READ_MODEL) {
    throw new DomainEventFlagsValidationError(
      'CQRS_READ_MODEL_CONSISTENCY=true exige CQRS_READ_MODEL=true.',
    );
  }
}

function resolveRawFlags(input: DomainEventFlagsInput = {}): DomainEventFlags {
  const { tenantFlags, overrides } = input;
  const base = { ...DOMAIN_EVENT_FLAG_DEFAULTS };

  const fromSources: DomainEventFlags = {
    DOMAIN_EVENTS: readTenantFlag(
      tenantFlags,
      'DOMAIN_EVENTS',
      readEnvFlag(ENV_KEY_MAP.DOMAIN_EVENTS, base.DOMAIN_EVENTS),
    ),
    DOMAIN_EVENT_AUDIT: readTenantFlag(
      tenantFlags,
      'DOMAIN_EVENT_AUDIT',
      readEnvFlag(ENV_KEY_MAP.DOMAIN_EVENT_AUDIT, base.DOMAIN_EVENT_AUDIT),
    ),
    DOMAIN_EVENT_OBSERVABILITY: readTenantFlag(
      tenantFlags,
      'DOMAIN_EVENT_OBSERVABILITY',
      readEnvFlag(ENV_KEY_MAP.DOMAIN_EVENT_OBSERVABILITY, base.DOMAIN_EVENT_OBSERVABILITY),
    ),
    DOMAIN_EVENT_CONSUMERS: readTenantFlag(
      tenantFlags,
      'DOMAIN_EVENT_CONSUMERS',
      readEnvFlag(ENV_KEY_MAP.DOMAIN_EVENT_CONSUMERS, base.DOMAIN_EVENT_CONSUMERS),
    ),
    DOMAIN_EVENT_CONSUMER_AUDIT: readTenantFlag(
      tenantFlags,
      'DOMAIN_EVENT_CONSUMER_AUDIT',
      readEnvFlag(ENV_KEY_MAP.DOMAIN_EVENT_CONSUMER_AUDIT, base.DOMAIN_EVENT_CONSUMER_AUDIT),
    ),
    DOMAIN_EVENT_CONSUMER_RETRY: readTenantFlag(
      tenantFlags,
      'DOMAIN_EVENT_CONSUMER_RETRY',
      readEnvFlag(ENV_KEY_MAP.DOMAIN_EVENT_CONSUMER_RETRY, base.DOMAIN_EVENT_CONSUMER_RETRY),
    ),
    DOMAIN_EVENT_PROJECTION: readTenantFlag(
      tenantFlags,
      'DOMAIN_EVENT_PROJECTION',
      readEnvFlag(ENV_KEY_MAP.DOMAIN_EVENT_PROJECTION, base.DOMAIN_EVENT_PROJECTION),
    ),
    DOMAIN_EVENT_ANALYTICS: readTenantFlag(
      tenantFlags,
      'DOMAIN_EVENT_ANALYTICS',
      readEnvFlag(ENV_KEY_MAP.DOMAIN_EVENT_ANALYTICS, base.DOMAIN_EVENT_ANALYTICS),
    ),
    LEAD_ANALYTICS_READ_MODEL: readTenantFlag(
      tenantFlags,
      'LEAD_ANALYTICS_READ_MODEL',
      readEnvFlag(ENV_KEY_MAP.LEAD_ANALYTICS_READ_MODEL, base.LEAD_ANALYTICS_READ_MODEL),
    ),
    CQRS_READ_MODEL: readTenantFlag(
      tenantFlags,
      'CQRS_READ_MODEL',
      readEnvFlag(ENV_KEY_MAP.CQRS_READ_MODEL, base.CQRS_READ_MODEL),
    ),
    APPOINTMENT_ANALYTICS_READ_MODEL: readTenantFlag(
      tenantFlags,
      'APPOINTMENT_ANALYTICS_READ_MODEL',
      readEnvFlag(
        ENV_KEY_MAP.APPOINTMENT_ANALYTICS_READ_MODEL,
        base.APPOINTMENT_ANALYTICS_READ_MODEL,
      ),
    ),
    FINANCIAL_ANALYTICS_READ_MODEL: readTenantFlag(
      tenantFlags,
      'FINANCIAL_ANALYTICS_READ_MODEL',
      readEnvFlag(
        ENV_KEY_MAP.FINANCIAL_ANALYTICS_READ_MODEL,
        base.FINANCIAL_ANALYTICS_READ_MODEL,
      ),
    ),
    CQRS_READ_MODEL_SOAK: readTenantFlag(
      tenantFlags,
      'CQRS_READ_MODEL_SOAK',
      readEnvFlag(ENV_KEY_MAP.CQRS_READ_MODEL_SOAK, base.CQRS_READ_MODEL_SOAK),
    ),
    CQRS_READ_MODEL_CONSISTENCY: readTenantFlag(
      tenantFlags,
      'CQRS_READ_MODEL_CONSISTENCY',
      readEnvFlag(ENV_KEY_MAP.CQRS_READ_MODEL_CONSISTENCY, base.CQRS_READ_MODEL_CONSISTENCY),
    ),
  };

  const merged = { ...fromSources, ...(overrides || {}) };
  validateDomainEventFlags(merged);
  return applyProductionSafeLocks(merged);
}

export function getDomainEventFlags(input: DomainEventFlagsInput = {}): DomainEventFlags {
  return resolveRawFlags(input);
}

export function isDomainEventsEnabled(input: DomainEventFlagsInput = {}): boolean {
  return getDomainEventFlags(input).DOMAIN_EVENTS;
}

export function isDomainEventAuditEnabled(input: DomainEventFlagsInput = {}): boolean {
  const flags = getDomainEventFlags(input);
  return flags.DOMAIN_EVENTS && flags.DOMAIN_EVENT_AUDIT;
}

export function isDomainEventObservabilityEnabled(input: DomainEventFlagsInput = {}): boolean {
  const flags = getDomainEventFlags(input);
  return flags.DOMAIN_EVENTS && flags.DOMAIN_EVENT_OBSERVABILITY;
}

export function isDomainEventConsumersEnabled(input: DomainEventFlagsInput = {}): boolean {
  const flags = getDomainEventFlags(input);
  return flags.DOMAIN_EVENTS && flags.DOMAIN_EVENT_CONSUMERS;
}

export function isDomainEventConsumerAuditEnabled(input: DomainEventFlagsInput = {}): boolean {
  const flags = getDomainEventFlags(input);
  return flags.DOMAIN_EVENTS && flags.DOMAIN_EVENT_CONSUMERS && flags.DOMAIN_EVENT_CONSUMER_AUDIT;
}

export function isDomainEventConsumerRetryEnabled(input: DomainEventFlagsInput = {}): boolean {
  const flags = getDomainEventFlags(input);
  return flags.DOMAIN_EVENTS && flags.DOMAIN_EVENT_CONSUMERS && flags.DOMAIN_EVENT_CONSUMER_RETRY;
}

export function isDomainEventProjectionEnabled(input: DomainEventFlagsInput = {}): boolean {
  const flags = getDomainEventFlags(input);
  return flags.DOMAIN_EVENTS && flags.DOMAIN_EVENT_CONSUMERS && flags.DOMAIN_EVENT_PROJECTION;
}

export function isDomainEventAnalyticsEnabled(input: DomainEventFlagsInput = {}): boolean {
  const flags = getDomainEventFlags(input);
  return flags.DOMAIN_EVENTS && flags.DOMAIN_EVENT_CONSUMERS && flags.DOMAIN_EVENT_ANALYTICS;
}

export function isLeadAnalyticsReadModelEnabled(input: DomainEventFlagsInput = {}): boolean {
  const flags = getDomainEventFlags(input);
  return (
    flags.DOMAIN_EVENTS
    && flags.DOMAIN_EVENT_ANALYTICS
    && flags.CQRS_READ_MODEL
    && flags.LEAD_ANALYTICS_READ_MODEL
  );
}

export function isCqrsReadModelEnabled(input: DomainEventFlagsInput = {}): boolean {
  const flags = getDomainEventFlags(input);
  return flags.DOMAIN_EVENTS && flags.DOMAIN_EVENT_ANALYTICS && flags.CQRS_READ_MODEL;
}

export function isAppointmentAnalyticsReadModelEnabled(
  input: DomainEventFlagsInput = {},
): boolean {
  const flags = getDomainEventFlags(input);
  return (
    flags.DOMAIN_EVENTS
    && flags.DOMAIN_EVENT_ANALYTICS
    && flags.CQRS_READ_MODEL
    && flags.APPOINTMENT_ANALYTICS_READ_MODEL
  );
}

export function isFinancialAnalyticsReadModelEnabled(
  input: DomainEventFlagsInput = {},
): boolean {
  const flags = getDomainEventFlags(input);
  return (
    flags.DOMAIN_EVENTS
    && flags.DOMAIN_EVENT_ANALYTICS
    && flags.CQRS_READ_MODEL
    && flags.FINANCIAL_ANALYTICS_READ_MODEL
  );
}

export function isCqrsReadModelSoakEnabled(input: DomainEventFlagsInput = {}): boolean {
  const flags = getDomainEventFlags(input);
  return (
    flags.DOMAIN_EVENTS
    && flags.DOMAIN_EVENT_ANALYTICS
    && flags.CQRS_READ_MODEL
    && flags.CQRS_READ_MODEL_SOAK
  );
}

export function isCqrsReadModelConsistencyEnabled(input: DomainEventFlagsInput = {}): boolean {
  const flags = getDomainEventFlags(input);
  return (
    flags.DOMAIN_EVENTS
    && flags.DOMAIN_EVENT_ANALYTICS
    && flags.CQRS_READ_MODEL
    && flags.CQRS_READ_MODEL_CONSISTENCY
  );
}
