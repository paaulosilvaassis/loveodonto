/**
 * @module domain-events/staging-activation/readonly-verification/readonlyVerificationEntryConditions
 * Condições de entrada — sem dados reais → blocked; sem abrir conexão.
 */

import type { StagingAuthorizationCompleteness } from '../authorization-intake/stagingAuthorizationIntakeTypes.js';
import type { ReadonlyVerificationEntryConditions } from './readonlyVerificationTypes.js';
import type { ReadonlyVerificationApproval } from './readonlyVerificationTypes.js';
import { validateReadonlyVerificationApproval } from './readonlyVerificationApproval.js';

export interface EntryConditionInput {
  authorizationCompleteness?: StagingAuthorizationCompleteness | string | null;
  humanApprovalStatus?: string | null;
  readonlyAccessStatus?: string | null;
  /** Phase 8.9 marca declared_verified_readonly no intake. */
  readonlyRemoteStatus?: string | null;
  environmentStructurallyValid?: boolean;
  pilotTenantIds?: readonly string[];
  stageOneAuthorizationStatus?: string | null;
  verificationApproval?: ReadonlyVerificationApproval | null;
  packageEnvironmentId?: string | null;
  packageTenantIds?: readonly string[];
}

const COMPLETENESS_OK = new Set([
  'approved_data_unverified_remote',
  'structurally_complete',
]);

const STAGE_ONE_OK = new Set(['pending', 'approved']);

export function evaluateReadonlyVerificationEntryConditions(
  input: EntryConditionInput = {},
): ReadonlyVerificationEntryConditions {
  const blockers: string[] = [];

  const completenessOk = COMPLETENESS_OK.has(String(input.authorizationCompleteness || ''));
  if (!completenessOk) {
    blockers.push(
      `authorizationCompleteness=${input.authorizationCompleteness || 'missing'} (exige approved_data_unverified_remote|structurally_complete)`,
    );
  }

  const humanOk = String(input.humanApprovalStatus || '') === 'approved';
  if (!humanOk) blockers.push(`humanApproval.status=${input.humanApprovalStatus || 'pending'}`);

  const readonlyOk = String(input.readonlyRemoteStatus || input.readonlyAccessStatus || '')
    === 'declared_verified_readonly'
    || String(input.readonlyAccessStatus || '') === 'verified_readonly';
  if (!readonlyOk) {
    blockers.push(
      `readonlyAccess=${input.readonlyRemoteStatus || input.readonlyAccessStatus || 'unverified'} (exige declared_verified_readonly)`,
    );
  }

  const envOk = input.environmentStructurallyValid === true;
  if (!envOk) blockers.push('environmentDeclaration not structurally valid');

  const pilots = input.pilotTenantIds || [];
  const pilotOk = pilots.length > 0 && !pilots.some((t) => /^(all|\*|everyone)$/i.test(t));
  if (!pilotOk) blockers.push('pilotTenantIds ausente ou wildcard');

  const stageOk = STAGE_ONE_OK.has(String(input.stageOneAuthorizationStatus || 'pending'));
  if (!stageOk) {
    blockers.push(`stageOneAuthorization.status=${input.stageOneAuthorizationStatus}`);
  }

  const approval = input.verificationApproval || null;
  const approvalCheck = approval
    ? validateReadonlyVerificationApproval(
      approval,
      input.packageEnvironmentId ?? null,
      input.packageTenantIds || pilots,
    )
    : { ok: false, blockers: ['remoteReadonlyVerificationApproval ausente'] };
  if (!approvalCheck.ok) blockers.push(...approvalCheck.blockers);

  return Object.freeze({
    authorizationCompletenessOk: completenessOk,
    humanApprovalApproved: humanOk,
    readonlyDeclaredVerified: readonlyOk,
    environmentStructurallyValid: envOk,
    pilotTenantPresent: pilotOk,
    stageOneStatusOk: stageOk,
    remoteReadonlyVerificationApproved: approvalCheck.ok,
    allSatisfied: blockers.length === 0,
    blockers: Object.freeze(blockers),
  });
}
