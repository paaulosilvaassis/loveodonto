/**
 * @module domain-events/certification/cqrsCertificationHumanApproval
 * @description Human Approval Gate — Phase 8.5.
 * Nunca auto-aprova.
 */

import type { CqrsHumanApprovalGate } from './cqrsCertificationTypes.js';

/**
 * Gate humano obrigatório. Nesta phase permanece pending.
 */
export function buildCqrsHumanApprovalGate(): CqrsHumanApprovalGate {
  return Object.freeze({
    state: 'pending',
    required: true,
    approvedAt: null,
    approvedBy: null,
    note:
      'Architecture Certified ≠ Production Promoted — aprovação humana obrigatória e ainda pending',
  });
}
