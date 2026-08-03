/**
 * @module domain-events/certification/cqrsCertificationStaging
 * @description Staging Evidence Contract — Phase 8.5.
 * Sem execução remota nesta fase.
 */

import type { CqrsStagingEvidenceContract } from './cqrsCertificationTypes.js';

/**
 * Staging remoto não configurado / não autorizado nesta phase.
 * Não simula evidência. Bloqueia promoção operacional.
 */
export function buildCqrsStagingEvidenceContract(): CqrsStagingEvidenceContract {
  return Object.freeze({
    state: 'manual-required',
    environment: null,
    tenantId: null,
    startedAt: null,
    finishedAt: null,
    iterations: null,
    result: null,
    drifts: null,
    errors: null,
    operator: null,
    note:
      'Staging remoto não executado nesta phase — evidência operacional manual-required antes de promoção',
  });
}
