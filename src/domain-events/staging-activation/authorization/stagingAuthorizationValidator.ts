/**
 * @module domain-events/staging-activation/authorization/stagingAuthorizationValidator
 */

import type { StagingAuthorizationPackage } from './stagingAuthorizationTypes.js';
import { STAGE_ONE_FORBIDDEN_FLAGS } from './stagingAuthorizationTypes.js';

export function validateStagingAuthorizationPackage(
  pkg: StagingAuthorizationPackage,
): { ok: boolean; blockers: readonly string[] } {
  const blockers: string[] = [];

  if (pkg.environmentDeclaration.isProduction) {
    blockers.push('ambiente de produção');
  }
  if (!pkg.environmentDeclaration.complete) {
    blockers.push(...pkg.environmentDeclaration.blockers.map((b) => `env: ${b}`));
  }
  if (pkg.humanApproval.status === 'pending') blockers.push('autorização humana pending');
  if (pkg.humanApproval.status === 'expired') blockers.push('autorização humana expired');
  if (pkg.humanApproval.status === 'revoked') blockers.push('autorização humana revoked');
  if (pkg.humanApproval.status === 'rejected') blockers.push('autorização humana rejected');
  if (pkg.humanApproval.status === 'approved' && !pkg.humanApproval.approvedBy) {
    blockers.push('aprovador ausente');
  }
  if (!pkg.tenantSelection.valid) {
    blockers.push(...pkg.tenantSelection.blockers.map((b) => `tenant: ${b}`));
  }
  if (pkg.readonlyAccessDeclaration.status !== 'verified_readonly') {
    blockers.push(`read-only ${pkg.readonlyAccessDeclaration.status}`);
  }
  if (!pkg.readonlyAccessDeclaration.mutationBlocked) {
    blockers.push('mutation não bloqueada');
  }
  if (!pkg.readonlyAccessDeclaration.migrationBlocked) {
    blockers.push('migration não bloqueada');
  }
  if (!pkg.readonlyAccessDeclaration.storageWriteBlocked) {
    blockers.push('storage write não bloqueado');
  }
  if (!pkg.readonlyAccessDeclaration.secretAccessBlocked) {
    blockers.push('secret access não bloqueado');
  }
  if (pkg.readonlyAccessDeclaration.writeOperations.length > 0) {
    blockers.push('write operations presentes');
  }
  if (pkg.rollbackAcknowledgement.status !== 'acknowledged') {
    blockers.push('rollback não revisado');
  }
  if (pkg.riskAcknowledgement.status !== 'acknowledged') {
    blockers.push('riscos não reconhecidos');
  }
  if (pkg.evidenceAcknowledgement.status !== 'acknowledged') {
    blockers.push('evidências não reconhecidas');
  }
  if (pkg.stageOneAuthorization.status !== 'approved') {
    blockers.push(`stage1 status=${pkg.stageOneAuthorization.status}`);
  }
  if (
    pkg.stageOneAuthorization.expiresAt
    && Date.parse(pkg.stageOneAuthorization.expiresAt) < Date.now()
  ) {
    blockers.push('stage1 autorização expirada');
  }
  if (!pkg.expiresAt) blockers.push('pacote sem validade');
  else if (Date.parse(pkg.expiresAt) < Date.now()) blockers.push('pacote expirado');

  if (pkg.stageOneAuthorization.forbiddenFlags.length < STAGE_ONE_FORBIDDEN_FLAGS.length) {
    blockers.push('Stage 1 forbidden flags incompleto');
  }

  return Object.freeze({
    ok: blockers.length === 0,
    blockers: Object.freeze([...new Set(blockers)]),
  });
}
