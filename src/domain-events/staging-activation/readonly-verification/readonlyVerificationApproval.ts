/**
 * @module domain-events/staging-activation/readonly-verification/readonlyVerificationApproval
 * Aprovação própria — não reutiliza Human Approval nem StageOneExecutionApproval.
 */

import {
  ALLOWED_READONLY_PROBES,
  FORBIDDEN_READONLY_OPERATIONS,
} from './readonlyVerificationProbeRegistry.js';
import type {
  ReadonlyProbeId,
  ReadonlyVerificationApproval,
  ReadonlyVerificationApprovalStatus,
} from './readonlyVerificationTypes.js';

let approvalSeq = 0;

export function buildPendingReadonlyVerificationApproval(
  authorizationPackageId: string | null = null,
): ReadonlyVerificationApproval {
  approvalSeq += 1;
  return Object.freeze({
    verificationApprovalId: `ro-approval-pending-${approvalSeq}`,
    authorizationPackageId,
    environmentId: null,
    tenantIds: Object.freeze([] as string[]),
    approvedBy: null,
    approvedAt: null,
    expiresAt: null,
    allowedProbes: ALLOWED_READONLY_PROBES,
    forbiddenOperations: FORBIDDEN_READONLY_OPERATIONS,
    status: 'pending' as const,
  });
}

export interface BuildReadonlyVerificationApprovalInput {
  authorizationPackageId?: string | null;
  environmentId?: string | null;
  tenantIds?: readonly string[];
  approvedBy?: string | null;
  approvedAt?: string | null;
  expiresAt?: string | null;
  allowedProbes?: readonly ReadonlyProbeId[];
  status?: ReadonlyVerificationApprovalStatus;
  packageEnvironmentId?: string | null;
  packageTenantIds?: readonly string[];
}

/**
 * Constrói approval. Sem input real → pending.
 * Não infere approved a partir de outros approvals.
 */
export function buildReadonlyVerificationApproval(
  input: BuildReadonlyVerificationApprovalInput = {},
): ReadonlyVerificationApproval {
  approvalSeq += 1;
  const requested = input.status || 'pending';
  const blockers: string[] = [];

  let status: ReadonlyVerificationApprovalStatus = 'pending';
  if (requested === 'rejected' || requested === 'revoked' || requested === 'completed') {
    status = requested;
  } else if (requested === 'expired') {
    status = 'expired';
  } else if (requested === 'approved') {
    if (!input.approvedBy?.trim()) blockers.push('approvedBy obrigatório');
    if (!input.approvedAt) blockers.push('approvedAt obrigatório');
    if (!input.expiresAt) blockers.push('expiresAt obrigatório');
    if (input.expiresAt && Date.parse(input.expiresAt) < Date.now()) {
      status = 'expired';
    } else if (
      input.packageEnvironmentId
      && input.environmentId
      && input.environmentId !== input.packageEnvironmentId
    ) {
      blockers.push('environmentId mismatch com pacote');
    } else if (
      input.packageTenantIds?.length
      && input.tenantIds?.length
      && !input.tenantIds.every((t) => input.packageTenantIds!.includes(t))
    ) {
      blockers.push('tenantIds fora do pacote');
    } else if (blockers.length === 0) {
      status = 'approved';
    }
  }

  const probes = (input.allowedProbes || ALLOWED_READONLY_PROBES).filter((p) =>
    (ALLOWED_READONLY_PROBES as readonly string[]).includes(p),
  );

  return Object.freeze({
    verificationApprovalId: `ro-approval-${approvalSeq}`,
    authorizationPackageId: input.authorizationPackageId ?? null,
    environmentId: input.environmentId ?? null,
    tenantIds: Object.freeze([...(input.tenantIds || [])]),
    approvedBy: status === 'approved' ? (input.approvedBy?.trim() || null) : null,
    approvedAt: status === 'approved' ? (input.approvedAt || null) : null,
    expiresAt: input.expiresAt ?? null,
    allowedProbes: Object.freeze(probes.length ? probes : [...ALLOWED_READONLY_PROBES]),
    forbiddenOperations: FORBIDDEN_READONLY_OPERATIONS,
    status: blockers.length && requested === 'approved' && status !== 'expired'
      ? 'pending'
      : status,
  });
}

export function validateReadonlyVerificationApproval(
  approval: ReadonlyVerificationApproval,
  packageEnvironmentId: string | null = null,
  packageTenantIds: readonly string[] = [],
): { ok: boolean; blockers: readonly string[] } {
  const blockers: string[] = [];
  if (approval.status === 'pending') blockers.push('verification approval pending');
  if (approval.status === 'rejected') blockers.push('verification approval rejected');
  if (approval.status === 'revoked') blockers.push('verification approval revoked');
  if (approval.status === 'expired') blockers.push('verification approval expired');
  if (approval.status === 'approved') {
    if (!approval.approvedBy) blockers.push('approvedBy ausente');
    if (!approval.expiresAt || Date.parse(approval.expiresAt) < Date.now()) {
      blockers.push('verification approval expirado');
    }
    if (
      packageEnvironmentId
      && approval.environmentId
      && approval.environmentId !== packageEnvironmentId
    ) {
      blockers.push('environment mismatch');
    }
    if (
      packageTenantIds.length
      && approval.tenantIds.length
      && !approval.tenantIds.every((t) => packageTenantIds.includes(t))
    ) {
      blockers.push('tenant mismatch');
    }
  }
  return { ok: blockers.length === 0 && approval.status === 'approved', blockers };
}

export function __resetReadonlyVerificationApprovalSeqForTest(): void {
  approvalSeq = 0;
}
