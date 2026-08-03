/**
 * @module domain-events/staging-activation/stagingHumanAuthorization
 * @description Human Authorization Contract — Phase 8.6.
 * Sem autoaprovação. Sem inventar aprovador.
 */

import type {
  StagingAuthStatus,
  StagingHumanAuthorizationContract,
} from './stagingActivationTypes.js';

export interface StagingAuthorizationInput {
  approvalId?: string;
  environmentId?: string | null;
  tenantIds?: readonly string[];
  requestedBy?: string;
  status?: StagingAuthStatus;
  approvedAt?: string | null;
  approvedBy?: string | null;
  expiresAt?: string | null;
  notes?: string;
  /** Proibido: força approved sem approvedBy. */
  autoApprove?: boolean;
}

function resolveStatus(input: StagingAuthorizationInput): StagingAuthStatus {
  if (input.autoApprove === true) {
    // Autoaprovação nunca concede approved.
    return 'pending';
  }
  const status = input.status || 'pending';
  if (status === 'approved') {
    if (!input.approvedBy || !input.approvedAt) return 'pending';
    if (input.expiresAt && Date.parse(input.expiresAt) < Date.now()) return 'expired';
  }
  if (status === 'expired') return 'expired';
  if (status === 'revoked') return 'revoked';
  if (status === 'rejected') return 'rejected';
  return status;
}

/**
 * Contrato de autorização humana.
 * Phase 8.6 default: pending (não inventa aprovador).
 */
export function buildStagingHumanAuthorization(
  input: StagingAuthorizationInput = {},
): StagingHumanAuthorizationContract {
  const status = resolveStatus(input);
  const approved = status === 'approved';
  return Object.freeze({
    approvalId: input.approvalId || `approval-${Date.now()}`,
    approvalType: 'controlled_staging_activation',
    scope: Object.freeze([
      'domain-events',
      'consumers',
      'analytics-projections',
      'cqrs-read-models',
    ]),
    environmentId: input.environmentId ?? null,
    tenantIds: Object.freeze([...(input.tenantIds || [])]),
    requestedAt: new Date().toISOString(),
    requestedBy: input.requestedBy || 'system-structural-plan',
    status,
    approvedAt: approved ? (input.approvedAt || null) : null,
    approvedBy: approved ? (input.approvedBy || null) : null,
    expiresAt: input.expiresAt ?? null,
    notes:
      input.notes
      || (status === 'pending'
        ? 'Phase 8.6 — human authorization pending; autoaprovação proibida'
        : `Authorization status=${status}`),
  });
}

/** Default Phase 8.6. */
export function buildPendingStagingAuthorization(): StagingHumanAuthorizationContract {
  return buildStagingHumanAuthorization({ status: 'pending' });
}

export function isAuthorizationUsable(
  auth: StagingHumanAuthorizationContract,
): boolean {
  if (auth.status !== 'approved') return false;
  if (!auth.approvedBy || !auth.approvedAt) return false;
  if (auth.expiresAt && Date.parse(auth.expiresAt) < Date.now()) return false;
  return true;
}
