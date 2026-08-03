/**
 * Phase 4.10 Wave 3H — bootstrap do domínio membership (DI, sem imports circulares).
 */

import { isActiveTenantUserRow } from './isActiveTenantUserRow.js';
import { createLinkAuthUserToTenantMembership } from './linkAuthUserToTenantMembership.js';
import {
  createGetTenantUserByAuthUserId,
  createResolveActiveTenantUser,
} from './resolveActiveTenantUser.js';
import { createAuthUserMetadata } from './authUserMetadata.js';
import { createEnsureConsoleAdminCredentials } from './ensureConsoleAdminCredentials.js';
import {
  isMissingCollaboratorIdColumnError,
  isMissingHasSystemAccessColumnError,
  isMissingInvitationStatusColumnError,
  isTenantUserDuplicateError,
} from './tenantUserSchemaFallbacks.js';
import { assertMembershipExternalDeps } from './membershipDeps.js';

export function createMembershipDependencies(deps) {
  assertMembershipExternalDeps(deps);

  const { supabase, normalizeText, normalizeEmail } = deps;

  const linkAuthUserToTenantMembership = createLinkAuthUserToTenantMembership({
    supabase,
    normalizeEmail,
    isActiveTenantUserRow,
  });

  const resolveActiveTenantUser = createResolveActiveTenantUser({
    supabase,
    isActiveTenantUserRow,
    linkAuthUserToTenantMembership,
  });

  const getTenantUserByAuthUserId = createGetTenantUserByAuthUserId({
    resolveActiveTenantUser,
  });

  const {
    getAuthUserMeta,
    extractPermissionFieldsFromAppMetadata,
    enrichTeamRosterWithPermissionFields,
    appendAccessAuditToAuthUser,
  } = createAuthUserMetadata({ supabase });

  const ensureConsoleAdminCredentials = createEnsureConsoleAdminCredentials({
    supabase,
    normalizeEmail,
  });

  return {
    isActiveTenantUserRow,
    linkAuthUserToTenantMembership,
    resolveActiveTenantUser,
    getTenantUserByAuthUserId,
    getAuthUserMeta,
    extractPermissionFieldsFromAppMetadata,
    enrichTeamRosterWithPermissionFields,
    appendAccessAuditToAuthUser,
    ensureConsoleAdminCredentials,
    isMissingHasSystemAccessColumnError,
    isMissingInvitationStatusColumnError,
    isMissingCollaboratorIdColumnError,
    isTenantUserDuplicateError,
  };
}
