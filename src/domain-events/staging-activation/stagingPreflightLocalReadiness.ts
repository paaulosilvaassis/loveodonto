/**
 * @module domain-events/staging-activation/stagingPreflightLocalReadiness
 * @description Preparação estrutural local (attach+soak) — Phase 8.7.
 * Claramente local-simulated. NÃO é soak remoto / staging real.
 */

import type { DomainEventFlagsInput } from '../domainEventFlags.js';
import {
  attachAnalyticsReadModels,
  runReadModelSoakValidation,
  CQRS_PROMOTION_READ_MODEL_IDS,
} from '../read-models/index.js';

const TENANT_LOCAL = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const NOW = '2026-07-13T22:00:00.000Z';

function snapsFor(id: string) {
  if (id === 'lead-analytics') {
    return {
      crm: {
        counters: { leadsCreated: 2, leadsUpdated: 0, leadsMoved: 1 },
        version: 3,
        updatedAt: NOW,
      },
    };
  }
  if (id === 'appointment-analytics') {
    return {
      appointment: {
        counters: {
          appointmentsCreated: 1,
          appointmentsCancelled: 0,
          appointmentsRescheduled: 0,
          appointmentsConfirmed: 0,
          appointmentsStatusChanged: 0,
          appointmentsUpdated: 0,
        },
        version: 1,
        updatedAt: NOW,
      },
    };
  }
  return {
    financial: {
      counters: {
        receivablesCreated: 1,
        receivablesUpdated: 0,
        payablesCreated: 0,
        payablesUpdated: 0,
        payablesDeleted: 0,
        financingsCreated: 0,
        financingsUpdated: 0,
        paymentsReceived: 0,
      },
      version: 1,
      updatedAt: NOW,
    },
  };
}

/**
 * Executa attach + soak in-memory para evidência local-simulated.
 * Não altera flags de ambiente. Não toca staging remoto.
 */
export function prepareLocalSimulatedReadModelReadiness(
  flagsInput: DomainEventFlagsInput,
): { ok: boolean; details: string } {
  attachAnalyticsReadModels(flagsInput);
  const statuses: string[] = [];
  for (const id of CQRS_PROMOTION_READ_MODEL_IDS) {
    const run = runReadModelSoakValidation({
      readModelId: id,
      tenantId: TENANT_LOCAL,
      projectionSnapshots: snapsFor(id),
      iterations: 2,
      flagsInput,
      now: NOW,
    });
    statuses.push(`${id}=${run.status}`);
  }
  const ok = statuses.every((s) => s.endsWith('=passing'));
  return {
    ok,
    details: `local-simulated soak (NOT remote staging): ${statuses.join('; ')}`,
  };
}
