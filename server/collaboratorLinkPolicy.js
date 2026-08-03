function normalizeCollaboratorId(value) {
  return String(value || '').trim();
}

export function buildCollaboratorLinkConflictError() {
  const err = new Error('Este e-mail já está vinculado a outro colaborador.');
  err.code = 'EMAIL_LINKED_TO_OTHER_COLLABORATOR';
  return err;
}

/**
 * Quando o e-mail já possui tenant_user, evita relink para collaborator_id local
 * que conflita com outro usuário. Mantém o vínculo persistido em tenant_users.
 */
export async function resolveCollaboratorIdForTenantEmailAccess(supabase, {
  tenantId,
  tenantUserId,
  tenantUserCollaboratorId,
  requestedCollaboratorId,
  email,
}) {
  const requested = normalizeCollaboratorId(requestedCollaboratorId);
  const existing = normalizeCollaboratorId(tenantUserCollaboratorId);
  if (!requested) return existing || null;
  if (!existing || existing === requested) return requested;

  try {
    await assertCanAssignEmailToCollaborator(supabase, {
      tenantId,
      tenantUserId,
      collaboratorId: requested,
      email,
    });
    return requested;
  } catch (err) {
    if (err?.code === 'EMAIL_LINKED_TO_OTHER_COLLABORATOR' && existing) {
      return existing;
    }
    throw err;
  }
}

/**
 * Bloqueia apenas quando OUTRO tenant_user (e-mail diferente) já usa este collaborator_id.
 * Permite corrigir collaborator_id desatualizado no mesmo registro de e-mail.
 */
export async function assertCanAssignEmailToCollaborator(supabase, {
  tenantId,
  tenantUserId,
  collaboratorId,
  email,
}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedCollaboratorId = normalizeCollaboratorId(collaboratorId);
  if (!tenantId || !normalizedCollaboratorId || !normalizedEmail) return;

  const { data: ownerByCollaborator, error } = await supabase
    .from('tenant_users')
    .select('id, email, collaborator_id')
    .eq('tenant_id', tenantId)
    .eq('collaborator_id', normalizedCollaboratorId)
    .maybeSingle();
  if (error) throw error;

  if (!ownerByCollaborator?.id || ownerByCollaborator.id === tenantUserId) return;

  const ownerEmail = String(ownerByCollaborator.email || '').trim().toLowerCase();
  if (ownerEmail && ownerEmail !== normalizedEmail) {
    throw buildCollaboratorLinkConflictError();
  }
}
