/**
 * Phase 4.10 Wave 3F — validação de e-mail disponível para convite no tenant.
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createAssertEmailAvailableForTenantInvite(deps) {
  const {
    supabase,
    normalizeInvitationStatus,
    getValidAuthUserId,
    assertCanAssignEmailToCollaborator,
  } = deps;

  return async function assertEmailAvailableForTenantInvite(
    resolvedTenantId,
    normalizedEmail,
    { collaboratorId } = {},
  ) {
    const { data: existing, error } = await supabase
      .from('tenant_users')
      .select('id, user_id, status, has_system_access, invitation_status, collaborator_id')
      .eq('tenant_id', resolvedTenantId)
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (error) throw error;
    if (!existing?.id) return;

    if (existing.user_id) {
      const authStillValid = await getValidAuthUserId(existing.user_id);
      if (!authStillValid) return;
    }

    const normalizedCollaboratorId = normalizeText(collaboratorId) || null;
    if (normalizedCollaboratorId) {
      if (!existing.collaborator_id || existing.collaborator_id === normalizedCollaboratorId) {
        return;
      }
      await assertCanAssignEmailToCollaborator(supabase, {
        tenantId: resolvedTenantId,
        tenantUserId: existing.id,
        collaboratorId: normalizedCollaboratorId,
        email: normalizedEmail,
      });
      return;
    }

    const invitationStatus = normalizeInvitationStatus(existing.invitation_status);
    const isRevoked = invitationStatus === 'revoked';
    const isInactive = String(existing.status || '').toLowerCase() === 'inactive'
      || existing.has_system_access === false;
    if (isRevoked || isInactive) return;

    const duplicateErr = new Error('Este e-mail já possui acesso nesta clínica.');
    duplicateErr.code = 'EMAIL_ALREADY_HAS_ACCESS';
    throw duplicateErr;
  };
}
