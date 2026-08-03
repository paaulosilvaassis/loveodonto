/**
 * Phase 4.10 Wave 3E — cria usuário Auth para convite de colaborador (leaf).
 */

export function createCreateAuthUserForCollaboratorInvite(deps) {
  const { supabase, isAuthUserAlreadyRegisteredError, findAuthUserByEmail } = deps;

  return async function createAuthUserForCollaboratorInvite({
    normalizedEmail,
    tenantId,
    role,
    collaboratorId,
    collaboratorFullName,
  }) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: true,
      user_metadata: { full_name: collaboratorFullName || normalizedEmail },
      app_metadata: {
        tenant_id: tenantId,
        role,
        collaborator_id: collaboratorId || null,
      },
    });
    if (error) {
      if (isAuthUserAlreadyRegisteredError(error)) {
        return findAuthUserByEmail(normalizedEmail);
      }
      throw error;
    }
    return data?.user || null;
  };
}
