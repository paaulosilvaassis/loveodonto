/**
 * Phase 4.10 Wave 3D — domínio: atualiza has_system_access (IdentityService dep).
 */

import {
  TENANT_USER_SELECT_BASE,
  TENANT_USER_SELECT_WITH_ACCESS,
  omitHasSystemAccess,
} from './tenantUserFieldUtils.js';

export function createSetCollaboratorAccessState(deps) {
  const {
    supabase,
    resolveTenantUserForCollaboratorAccess,
    revokeAuthUserSessions,
    isMissingHasSystemAccessColumnError,
  } = deps;

  return async function setCollaboratorAccessState({
    collaboratorId,
    tenantId,
    email,
    fullName,
    tenantUserId,
    hasSystemAccess,
    actorAuthUserId,
  }) {
    let existingTenantUser = await resolveTenantUserForCollaboratorAccess({
      actorAuthUserId,
      tenantId,
      collaboratorId,
      email,
      fullName,
    });

    if (!existingTenantUser?.id && tenantUserId) {
      const { data: byId } = await supabase
        .from('tenant_users')
        .select('id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, is_active, status, has_system_access, invitation_status, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .eq('id', tenantUserId)
        .maybeSingle();
      existingTenantUser = byId || null;
    }

    if (!existingTenantUser?.id) {
      throw new Error('Usuário de acesso não encontrado para esta clínica.');
    }

    const updatePayload = {
      has_system_access: hasSystemAccess,
      is_active: hasSystemAccess,
      status: hasSystemAccess ? 'active' : 'inactive',
    };

    let tenantUser;
    try {
      const result = await supabase
        .from('tenant_users')
        .update(updatePayload)
        .eq('id', existingTenantUser.id)
        .eq('tenant_id', tenantId)
        .select(TENANT_USER_SELECT_WITH_ACCESS)
        .single();
      if (result.error) throw result.error;
      tenantUser = result.data;
    } catch (error) {
      if (!isMissingHasSystemAccessColumnError(error)) throw error;
      const fallbackResult = await supabase
        .from('tenant_users')
        .update(omitHasSystemAccess(updatePayload))
        .eq('id', existingTenantUser.id)
        .eq('tenant_id', tenantId)
        .select(TENANT_USER_SELECT_BASE)
        .single();
      if (fallbackResult.error) throw fallbackResult.error;
      tenantUser = fallbackResult.data;
    }

    if (!hasSystemAccess && tenantUser?.user_id) {
      await revokeAuthUserSessions(tenantUser.user_id);
    }

    return tenantUser;
  };
}
