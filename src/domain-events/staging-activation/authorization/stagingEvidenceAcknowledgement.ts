/**
 * @module domain-events/staging-activation/authorization/stagingEvidenceAcknowledgement
 */

import type { StagingEvidenceAcknowledgement } from './stagingAuthorizationTypes.js';

const TYPES = Object.freeze([
  'flag-resolution',
  'environment-identification',
  'tenants',
  'observability-metrics',
  'diagnostics',
  'health',
  'event-audit',
  'correlation',
  'causation',
  'tenant-mismatch',
  'rejected-events',
  'rollback',
  'manual-review',
]);

export interface StagingEvidenceAckInput {
  reviewed?: boolean;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

export function buildStagingEvidenceAcknowledgement(
  input: StagingEvidenceAckInput = {},
): StagingEvidenceAcknowledgement {
  const reviewed = Boolean(input.reviewed && input.reviewedBy && input.reviewedAt);
  return Object.freeze({
    acknowledgedTypes: TYPES,
    reviewed,
    reviewedBy: reviewed ? (input.reviewedBy || null) : null,
    reviewedAt: reviewed ? (input.reviewedAt || null) : null,
    fabricatedEvidenceForbidden: true,
    status: reviewed ? 'acknowledged' : 'pending',
  });
}
