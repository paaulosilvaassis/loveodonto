/**
 * Phase 4.10 Wave 3B — POST /internal/app/collaborators/link.
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createCollaboratorLinkHandler(deps) {
  const { linkCollaboratorToTenantUser, normalizeEmail, normalizeDatabaseError } = deps;

  return async function handleCollaboratorLink(req, res) {
    try {
      const explicitTenantId = normalizeText(req.body?.tenant_id);
      const collaboratorId = normalizeText(req.body?.collaborator_id);
      const email = normalizeEmail(req.body?.email);
      const fullName = normalizeText(req.body?.full_name);

      const linked = await linkCollaboratorToTenantUser({
        actorAuthUserId: req.appAuthUser.id,
        tenantId: explicitTenantId,
        collaboratorId,
        email,
        fullName,
      });

      return res.status(200).json({
        success: true,
        linked: linked.linked,
        tenant_user: linked.tenantUser,
      });
    } catch (err) {
      console.error('[app-collaborators-link]', err);
      return res.status(400).json({
        error: normalizeDatabaseError(err, 'Falha ao vincular colaborador ao usuário.'),
      });
    }
  };
}
