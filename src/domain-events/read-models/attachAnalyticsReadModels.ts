/**
 * @module domain-events/read-models/attachAnalyticsReadModels
 * @description Attach opt-in dos Read Models analíticos — Phase 8.1.
 * Idempotente. Sem rebuild automático. Sem boot.
 */

import {
  isAppointmentAnalyticsReadModelEnabled,
  isFinancialAnalyticsReadModelEnabled,
  isLeadAnalyticsReadModelEnabled,
  type DomainEventFlagsInput,
} from '../domainEventFlags.js';
import {
  getReadModelDefinition,
  registerReadModel,
} from './shared/readModelRegistry.js';
import {
  createLeadAnalyticsReadModelDefinition,
  LEAD_ANALYTICS_READ_MODEL_ID,
} from './leadAnalyticsDefinition.js';
import {
  createAppointmentAnalyticsReadModelDefinition,
  APPOINTMENT_ANALYTICS_READ_MODEL_ID,
} from './appointmentAnalytics.js';
import {
  createFinancialAnalyticsReadModelDefinition,
  FINANCIAL_ANALYTICS_READ_MODEL_ID,
} from './financialAnalytics.js';

const detachFns = new Map<string, () => void>();

function attachOne(
  id: string,
  enabled: boolean,
  create: () => Parameters<typeof registerReadModel>[0],
): () => void {
  if (!enabled) return () => {};
  if (getReadModelDefinition(id) || detachFns.has(id)) {
    return () => {
      const fn = detachFns.get(id);
      if (fn) {
        fn();
        detachFns.delete(id);
      }
    };
  }
  const unregister = registerReadModel(create());
  detachFns.set(id, unregister);
  return () => {
    unregister();
    detachFns.delete(id);
  };
}

export function attachLeadAnalyticsReadModel(
  flagsInput: DomainEventFlagsInput = {},
): () => void {
  return attachOne(
    LEAD_ANALYTICS_READ_MODEL_ID,
    isLeadAnalyticsReadModelEnabled(flagsInput),
    createLeadAnalyticsReadModelDefinition,
  );
}

export function attachAppointmentAnalyticsReadModel(
  flagsInput: DomainEventFlagsInput = {},
): () => void {
  return attachOne(
    APPOINTMENT_ANALYTICS_READ_MODEL_ID,
    isAppointmentAnalyticsReadModelEnabled(flagsInput),
    createAppointmentAnalyticsReadModelDefinition,
  );
}

export function attachFinancialAnalyticsReadModel(
  flagsInput: DomainEventFlagsInput = {},
): () => void {
  return attachOne(
    FINANCIAL_ANALYTICS_READ_MODEL_ID,
    isFinancialAnalyticsReadModelEnabled(flagsInput),
    createFinancialAnalyticsReadModelDefinition,
  );
}

/** Attach opt-in dos três modelos (quando flags respectivas ON). Idempotente. */
export function attachAnalyticsReadModels(
  flagsInput: DomainEventFlagsInput = {},
): () => void {
  const a = attachLeadAnalyticsReadModel(flagsInput);
  const b = attachAppointmentAnalyticsReadModel(flagsInput);
  const c = attachFinancialAnalyticsReadModel(flagsInput);
  return () => {
    a();
    b();
    c();
  };
}

export function detachAllAnalyticsReadModels(): void {
  for (const [id, fn] of [...detachFns.entries()]) {
    fn();
    detachFns.delete(id);
  }
}

export function __clearAnalyticsReadModelAttachForTest(): void {
  detachAllAnalyticsReadModels();
}
