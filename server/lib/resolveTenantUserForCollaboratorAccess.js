/**
 * Phase 4.10 Wave 3D — domínio: resolve tenant_user para toggle de acesso do colaborador.
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createResolveTenantUserForCollaboratorAccess(deps) {
  const {
    supabase,
    getTenantAdminActorOrThrow,
    normalizeEmail,
    isMissingCollaboratorIdColumnError,
    linkCollaboratorToTenantUser,
  } = deps;

  return async function resolveTenantUserForCollaboratorAccess({
    actorAuthUserId,
    tenantId,
    collaboratorId,
    email = '',
    fullName = '',
  }) {
    const actorTenantUser = await getTenantAdminActorOrThrow(actorAuthUserId, tenantId);
    const resolvedTenantId = actorTenantUser.tenant_id;
    const normalizedCollaboratorId = normalizeText(collaboratorId);
    const normalizedEmail = normalizeEmail(email);

    if (normalizedCollaboratorId) {
      const { data: byCollaborator, error: byCollaboratorError } = await supabase
        .from('tenant_users')
        .select('id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, is_active, status, has_system_access, invitation_status, created_at, updated_at')
        .eq('tenant_id', resolvedTenantId)
        .eq('collaborator_id', normalizedCollaboratorId)
        .maybeSingle();
      if (byCollaboratorError && !isMissingCollaboratorIdColumnError(byCollaboratorError)) {
        throw byCollaboratorError;
      }
      if (byCollaborator?.id) return byCollaborator;
    }

    if (!normalizedEmail) return null;

    const { data: byEmail, error: byEmailError } = await supabase
      .from('tenant_users')
      .select('id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, is_active, status, has_system_access, invitation_status, created_at, updated_at')
      .eq('tenant_id', resolvedTenantId)
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (byEmailError) throw byEmailError;
    if (!byEmail?.id) return null;

    if (
      normalizedCollaboratorId
      && (!byEmail.collaborator_id || byEmail.collaborator_id === normalizedCollaboratorId)
    ) {
      if (byEmail.collaborator_id === normalizedCollaboratorId) return byEmail;
      const linked = await linkCollaboratorToTenantUser({
        actorAuthUserId,
        tenantId: resolvedTenantId,
        collaboratorId: normalizedCollaboratorId,
        email: normalizedEmail,
        fullName: fullName || byEmail.full_name,
      });
      return linked.tenantUser || byEmail;
    }

    return byEmail;
  };
}
