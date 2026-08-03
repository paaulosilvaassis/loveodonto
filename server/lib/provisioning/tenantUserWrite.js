/**
 * Phase 4.10 Wave 3G — upsert tenant_users com fallbacks de schema legado.
 */

import { assertAuthUserIdForTenantWrite } from '../../identity/identityProvisionErrors.js';
import { identityLog } from '../../identity/identityProvisionLog.js';
import {
  TENANT_USER_SELECT_BASE,
  TENANT_USER_SELECT_BASE_LEGACY,
  TENANT_USER_SELECT_WITH_ACCESS,
  omitCollaboratorId,
  omitHasSystemAccess,
  omitInvitationStatus,
} from '../tenantUserFieldUtils.js';
import {
  isMissingCollaboratorIdColumnError,
  isMissingHasSystemAccessColumnError,
  isMissingInvitationStatusColumnError,
  isTenantUserDuplicateError,
} from '../membership/tenantUserSchemaFallbacks.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createUpsertTenantUserAccess(deps) {
  const {
    supabase,
    normalizeEmail,
    normalizeRoleValue,
    normalizeInvitationStatus,
    resolveAuthUserIdForTenantLink,
  } = deps;

  return async function upsertTenantUserAccess({
    tenantId,
    collaboratorId,
    fullName,
    email,
    role,
    hasSystemAccess = true,
    invitationStatus = 'none',
    authUserId: explicitAuthUserId = null,
  }) {
    const roleSlug = normalizeRoleValue(role);
    const normalizedInvitationStatus = normalizeInvitationStatus(invitationStatus);
    const normalizedEmail = normalizeEmail(email);

    const { data: existingTenantUser, error: existingTenantUserError } = await supabase
      .from('tenant_users')
      .select('id, user_id')
      .eq('tenant_id', tenantId)
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (existingTenantUserError) throw existingTenantUserError;

    const resolvedFromLink = await resolveAuthUserIdForTenantLink({
      normalizedEmail,
      explicitAuthUserId,
      existingTenantUser,
    });
    const authUserId = assertAuthUserIdForTenantWrite(resolvedFromLink, {
      tenantId,
      email: normalizedEmail,
      collaboratorId,
      existingTenantUserId: existingTenantUser?.id || null,
    });

    const payload = {
      tenant_id: tenantId,
      collaborator_id: normalizeText(collaboratorId) || null,
      full_name: normalizeText(fullName),
      email: normalizedEmail,
      user_id: authUserId,
      role: roleSlug,
      role_slug: roleSlug,
      has_system_access: Boolean(hasSystemAccess),
      is_active: Boolean(hasSystemAccess),
      status: hasSystemAccess ? 'active' : 'inactive',
      invitation_status: normalizedInvitationStatus,
    };

    const executeUpsert = async (nextPayload, includeAccessOnSelect, includeCollaboratorOnSelect = true) => {
      assertAuthUserIdForTenantWrite(nextPayload.user_id, { tenantId, email: normalizedEmail });
      let query;
      if (existingTenantUser?.id) {
        query = supabase.from('tenant_users').update(nextPayload).eq('id', existingTenantUser.id);
      } else {
        query = supabase.from('tenant_users').insert(nextPayload);
      }
      let { data, error } = await query
        .select(
          includeAccessOnSelect
            ? (includeCollaboratorOnSelect ? TENANT_USER_SELECT_WITH_ACCESS : `${TENANT_USER_SELECT_BASE_LEGACY}, has_system_access`)
            : (includeCollaboratorOnSelect ? TENANT_USER_SELECT_BASE : TENANT_USER_SELECT_BASE_LEGACY),
        )
        .single();

      if (error && !existingTenantUser?.id && isTenantUserDuplicateError(error)) {
        const { data: dupRow, error: dupErr } = await supabase
          .from('tenant_users')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('email', normalizedEmail)
          .maybeSingle();
        if (dupErr || !dupRow?.id) throw error;
        const retry = await supabase
          .from('tenant_users')
          .update(nextPayload)
          .eq('id', dupRow.id)
          .select(
            includeAccessOnSelect
              ? (includeCollaboratorOnSelect ? TENANT_USER_SELECT_WITH_ACCESS : `${TENANT_USER_SELECT_BASE_LEGACY}, has_system_access`)
              : (includeCollaboratorOnSelect ? TENANT_USER_SELECT_BASE : TENANT_USER_SELECT_BASE_LEGACY),
          )
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      assertAuthUserIdForTenantWrite(data?.user_id, {
        tenantId,
        email: normalizedEmail,
        tenantUserId: data?.id,
        phase: 'after_upsert',
      });
      identityLog('tenant_user atualizado', {
        tenantUserId: data.id,
        userId: data.user_id,
        operation: existingTenantUser?.id ? 'update' : 'insert',
      });
      return data;
    };

    try {
      return await executeUpsert(payload, true);
    } catch (error) {
      if (
        !isMissingHasSystemAccessColumnError(error)
        && !isMissingInvitationStatusColumnError(error)
        && !isMissingCollaboratorIdColumnError(error)
      ) throw error;
      return executeUpsert(
        omitCollaboratorId(omitInvitationStatus(omitHasSystemAccess(payload))),
        false,
        false,
      );
    }
  };
}
