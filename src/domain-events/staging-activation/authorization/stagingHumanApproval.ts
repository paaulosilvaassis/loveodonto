/**
 * @module domain-events/staging-activation/authorization/stagingHumanApproval
 * Phase 8.8 — formulário de aprovação humana. Sem autoaprovação.
 */

import type {
  StagingAuthFormStatus,
  StagingHumanApprovalForm,
} from './stagingAuthorizationTypes.js';

export interface StagingHumanApprovalFormInput {
  approvalId?: string;
  environmentId?: string | null;
  tenantIds?: readonly string[];
  requestedBy?: string | null;
  status?: StagingAuthFormStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  reason?: string | null;
  riskAcknowledged?: boolean;
  rollbackAcknowledged?: boolean;
  autoApprove?: boolean;
}

export function buildStagingHumanApprovalForm(
  input: StagingHumanApprovalFormInput = {},
): StagingHumanApprovalForm {
  let status: StagingAuthFormStatus = input.status || 'pending';

  // Autoaprovação nunca concede approved
  if (input.autoApprove === true) status = 'pending';

  if (status === 'approved') {
    if (!input.approvedBy || !input.approvedAt) status = 'pending';
    else if (input.requestedBy && input.approvedBy === input.requestedBy) {
      // solicitante não é automaticamente aprovador suficiente sozinho — ainda exige campos
      // mas mesma pessoa pode assinar se explícito; não inventamos — mantemos se fields present
    }
    if (input.expiresAt && Date.parse(input.expiresAt) < Date.now()) status = 'expired';
  }
  if (status === 'revoked') {
    /* keep */
  }

  const approved = status === 'approved';

  return Object.freeze({
    approvalId: input.approvalId || `stage1-approval-${Date.now()}`,
    approvalScope: 'stage_one_observability',
    environmentId: input.environmentId ?? null,
    tenantIds: Object.freeze([...(input.tenantIds || [])]),
    requestedBy: input.requestedBy ?? null,
    requestedAt: new Date().toISOString(),
    status,
    approvedBy: approved ? (input.approvedBy || null) : null,
    approvedAt: approved ? (input.approvedAt || null) : null,
    expiresAt: input.expiresAt ?? null,
    revokedAt: status === 'revoked' ? (input.revokedAt || new Date().toISOString()) : null,
    reason: input.reason ?? null,
    riskAcknowledged: Boolean(input.riskAcknowledged),
    rollbackAcknowledged: Boolean(input.rollbackAcknowledged),
  });
}

export function buildPendingStagingHumanApprovalForm(): StagingHumanApprovalForm {
  return buildStagingHumanApprovalForm({ status: 'pending' });
}
