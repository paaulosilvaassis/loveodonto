/**
 * @module domain-events/staging-activation/authorization/stagingReadonlyAccessDeclaration
 * Phase 8.8 — declaração de acesso read-only.
 */

import type { StagingReadonlyAccessDeclaration } from './stagingAuthorizationTypes.js';

export interface StagingReadonlyAccessInput {
  connectionId?: string | null;
  environmentId?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  readOperations?: readonly string[];
  writeOperations?: readonly string[];
  mutationBlocked?: boolean;
  migrationBlocked?: boolean;
  storageWriteBlocked?: boolean;
  secretAccessBlocked?: boolean;
  verificationMethod?: string | null;
  expiresAt?: string | null;
  /** Somente se comprovação real; default unverified. */
  claimVerified?: boolean;
}

export function buildStagingReadonlyAccessDeclaration(
  input: StagingReadonlyAccessInput = {},
): StagingReadonlyAccessDeclaration {
  const mutationBlocked = input.mutationBlocked !== false;
  const migrationBlocked = input.migrationBlocked !== false;
  const storageWriteBlocked = input.storageWriteBlocked !== false;
  const secretAccessBlocked = input.secretAccessBlocked !== false;
  const writeOps = [...(input.writeOperations || [])];

  let status: StagingReadonlyAccessDeclaration['status'] = 'unverified';

  if (input.claimVerified) {
    const ok = mutationBlocked
      && migrationBlocked
      && storageWriteBlocked
      && secretAccessBlocked
      && writeOps.length === 0
      && Boolean(input.verifiedBy)
      && Boolean(input.verifiedAt)
      && Boolean(input.verificationMethod)
      && Boolean(input.connectionId);
    if (!ok) status = 'rejected';
    else if (input.expiresAt && Date.parse(input.expiresAt) < Date.now()) status = 'expired';
    else status = 'verified_readonly';
  }

  return Object.freeze({
    connectionId: input.connectionId ?? null,
    environmentId: input.environmentId ?? null,
    verifiedBy: input.verifiedBy ?? null,
    verifiedAt: input.verifiedAt ?? null,
    readOperations: Object.freeze([...(input.readOperations || ['inspect', 'metrics_read'])]),
    writeOperations: Object.freeze(writeOps),
    mutationBlocked,
    migrationBlocked,
    storageWriteBlocked,
    secretAccessBlocked,
    verificationMethod: input.verificationMethod ?? null,
    expiresAt: input.expiresAt ?? null,
    status,
  });
}

export function buildUnverifiedReadonlyAccessDeclaration(): StagingReadonlyAccessDeclaration {
  return buildStagingReadonlyAccessDeclaration({});
}
