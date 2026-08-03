/**
 * Phase 4.10 Wave 3B — POST /internal/app/collaborators/provision e provision-access.
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createCollaboratorProvisionAccessHandler(deps) {
  const {
    identityService,
    normalizeEmail,
    normalizeRoleValue,
    maskEmail,
    logCollabInviteProdAudit,
    formatProvisionErrorResponse,
    resolveClientIp,
  } = deps;

  return async function handleCollaboratorProvisionAccess(req, res) {
    try {
      const explicitTenantId = normalizeText(req.body?.tenant_id);
      const createSystemAccess = Boolean(req.body?.create_system_access);
      const collaboratorId = normalizeText(req.body?.collaborator_id || req.params?.collaboratorId);
      const collaboratorFullName = normalizeText(
        req.body?.collaborator_full_name || req.body?.full_name || req.body?.fullName,
      );
      const email = normalizeEmail(req.body?.email);
      const profileRoleRaw = normalizeText(req.body?.profile_role || req.body?.role);
      const sendInvite = req.body?.send_invite !== false;
      const repairStaleAuth = req.body?.repair_stale_auth === true || sendInvite;

      if (!createSystemAccess) {
        return res.status(200).json({
          ok: true,
          success: true,
          create_system_access: false,
          message: 'Colaborador criado sem acesso ao sistema.',
        });
      }
      if (!email) {
        return res.status(400).json({ ok: false, error: 'E-mail inválido ou ausente. Informe um e-mail válido para criar acesso.' });
      }
      if (!profileRoleRaw) {
        return res.status(400).json({ ok: false, error: 'profile_role é obrigatório quando create_system_access=true.' });
      }
      if (!collaboratorId) {
        return res.status(400).json({ ok: false, error: 'collaborator_id é obrigatório.' });
      }

      console.log('[COLLAB_ACCESS] creating collaborator access', {
        collaboratorId,
        tenantId: explicitTenantId,
        email: maskEmail(email),
      });

      logCollabInviteProdAudit({
        tenantId: explicitTenantId,
        collaboratorId,
        email: maskEmail(email),
        repairStaleAuth,
        endpoint: req.path,
      });

      const result = await identityService.provisionIdentity({
        actorAuthUserId: req.appAuthUser.id,
        tenantId: explicitTenantId,
        collaboratorId,
        collaboratorFullName,
        email,
        profileRole: normalizeRoleValue(profileRoleRaw),
        sendInvite,
        repairStaleAuth,
        actor: { id: req.appAuthUser.id, email: req.appAuthUser.email, ip: resolveClientIp(req) },
        requestedAction: 'provision',
      });

      return res.status(200).json({
        ...result.formatted,
        identity: result.identity,
      });
    } catch (err) {
      console.error('[COLLAB_ACCESS] error', err);
      const payload = formatProvisionErrorResponse(err);
      return res.status(400).json(payload);
    }
  };
}
