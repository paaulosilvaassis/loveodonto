/**
 * Phase 4.10 Wave 3F/3G — bootstrap do domínio de provisionamento (DI, sem imports circulares).
 */

import { assertCanAssignEmailToCollaborator, resolveCollaboratorIdForTenantEmailAccess } from '../../collaboratorLinkPolicy.js';
import { lookupAuthUserByEmail, requireAuthUserId } from '../../identity/identityAuthResolver.js';
import { assertAuthUserIdForTenantWrite } from '../../identity/identityProvisionErrors.js';
import { isInviteEmailDelivered } from '../inviteDeliveryUtils.js';
import { isAuthUserAlreadyRegisteredError } from '../authUserRegisteredUtils.js';
import { createSendCollaboratorInvite } from '../sendCollaboratorInvite.js';
import { createUpsertInvitationRecord } from '../upsertInvitationRecord.js';
import { createFormatCollaboratorProvisionResponse } from '../formatCollaboratorProvisionResponse.js';
import { createCreateAuthUserForCollaboratorInvite } from '../createAuthUserForCollaboratorInvite.js';
import { TENANT_USER_SELECT_BASE } from '../tenantUserFieldUtils.js';
import { createAssertEmailAvailableForTenantInvite } from './emailAvailabilityPolicy.js';
import { createResolveAuthUserForInvite } from './inviteResolver.js';
import {
  createProvisionCollaboratorAccess,
  createSendPasswordResetFlow,
} from './provisioningOrchestrator.js';
import { assertProvisioningExternalDeps } from './provisioningDeps.js';
import { createAuthUserResolver } from './authUserResolver.js';
import { createUpsertTenantUserAccess } from './tenantUserWrite.js';
import { createLinkCollaboratorToTenantUser } from './tenantUserLink.js';
import { isMissingInvitationStatusColumnError } from '../membership/tenantUserSchemaFallbacks.js';

export function createProvisioningDependencies(deps) {
  assertProvisioningExternalDeps(deps);

  const {
    supabase,
    getTenantAdminActorOrThrow,
    normalizeText,
    normalizeEmail,
    normalizeRoleValue,
    normalizeInvitationStatus,
    maskEmail,
    appendAccessAuditToAuthUser,
    logAccessEmailAudit,
    getPasswordResetRedirectTo,
  } = deps;

  const authResolver = createAuthUserResolver({ supabase, normalizeEmail });
  const {
    findAuthUserByEmail,
    getValidAuthUserId,
    resolveAuthUserIdForTenantLink,
    clearStaleTenantUserAuthReference,
  } = authResolver;

  const upsertTenantUserAccess = createUpsertTenantUserAccess({
    supabase,
    normalizeEmail,
    normalizeRoleValue,
    normalizeInvitationStatus,
    resolveAuthUserIdForTenantLink,
  });

  const linkCollaboratorToTenantUser = createLinkCollaboratorToTenantUser({
    supabase,
    getTenantAdminActorOrThrow,
    normalizeEmail,
  });

  const sendCollaboratorInvite = createSendCollaboratorInvite({ supabase });
  const upsertInvitationRecord = createUpsertInvitationRecord({ supabase, normalizeInvitationStatus });
  const createAuthUserForCollaboratorInvite = createCreateAuthUserForCollaboratorInvite({
    supabase,
    isAuthUserAlreadyRegisteredError,
    findAuthUserByEmail,
  });
  const formatCollaboratorProvisionResponse = createFormatCollaboratorProvisionResponse({
    isInviteEmailDelivered,
    normalizeInvitationStatus,
  });

  const assertEmailAvailableForTenantInvite = createAssertEmailAvailableForTenantInvite({
    supabase,
    normalizeInvitationStatus,
    getValidAuthUserId,
    assertCanAssignEmailToCollaborator,
  });

  const resolveAuthUserForInvite = createResolveAuthUserForInvite({
    supabase,
    lookupAuthUserByEmail,
    requireAuthUserId,
    createAuthUserForCollaboratorInvite,
  });

  const provisionCollaboratorAccess = createProvisionCollaboratorAccess({
    supabase,
    getTenantAdminActorOrThrow,
    normalizeText,
    normalizeEmail,
    normalizeRoleValue,
    maskEmail,
    resolveCollaboratorIdForTenantEmailAccess,
    clearStaleTenantUserAuthReference,
    assertEmailAvailableForTenantInvite,
    findAuthUserByEmail,
    resolveAuthUserForInvite,
    assertAuthUserIdForTenantWrite,
    upsertTenantUserAccess,
    isInviteEmailDelivered,
    upsertInvitationRecord,
    tenantUserSelectBase: TENANT_USER_SELECT_BASE,
    isMissingInvitationStatusColumnError,
    logAccessEmailAudit,
    appendAccessAuditToAuthUser,
  });

  const sendPasswordResetFlow = createSendPasswordResetFlow({
    supabase,
    normalizeEmail,
    normalizeRoleValue,
    normalizeInvitationStatus,
    provisionCollaboratorAccess,
    formatCollaboratorProvisionResponse,
    clearStaleTenantUserAuthReference,
    getValidAuthUserId,
    findAuthUserByEmail,
    createAuthUserForCollaboratorInvite,
    assertAuthUserIdForTenantWrite,
    sendCollaboratorInvite,
    isInviteEmailDelivered,
    getPasswordResetRedirectTo,
  });

  return {
    provisionCollaboratorAccess,
    sendPasswordResetFlow,
    assertEmailAvailableForTenantInvite,
    resolveAuthUserForInvite,
    sendCollaboratorInvite,
    upsertInvitationRecord,
    createAuthUserForCollaboratorInvite,
    formatCollaboratorProvisionResponse,
    upsertTenantUserAccess,
    linkCollaboratorToTenantUser,
    clearStaleTenantUserAuthReference,
    findAuthUserByEmail,
    getValidAuthUserId,
    resolveAuthUserIdForTenantLink,
  };
}
