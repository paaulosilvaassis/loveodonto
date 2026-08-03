/**
 * Phase 4.10 Wave 3B — POST /internal/app/users/password-reset.
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createUsersPasswordResetHandler(deps) {
  const {
    identityService,
    getTenantAdminActorOrThrow,
    normalizeEmail,
    resolveClientIp,
    logCollaboratorAccessAudit,
    appendAccessAuditToAuthUser,
  } = deps;

  return async function handleUsersPasswordReset(req, res) {
    try {
      const explicitTenantId = normalizeText(req.body?.tenant_id);
      const targetEmail = normalizeEmail(req.body?.email);
      const collaboratorId = normalizeText(req.body?.collaborator_id);

      if (!targetEmail) {
        return res.status(400).json({ message: 'E-mail é obrigatório para redefinir a senha.' });
      }

      const actorTenantUser = req.tenantContext?.tenantUser
        || await getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId);
      const tenantId = req.tenantContext?.tenantId || actorTenantUser.tenant_id;

      const clientIp = resolveClientIp(req);
      const actorName = actorTenantUser?.full_name || req.appAuthUser.email || 'Administrador';

      const result = await identityService.resetPasswordByEmail({
        tenantId,
        email: targetEmail,
        collaboratorId,
        actorAuthUserId: req.appAuthUser.id,
        collaboratorFullName: normalizeText(req.body?.collaborator_full_name) || targetEmail,
        profileRole: req.body?.profile_role,
        actor: {
          id: req.appAuthUser.id,
          email: req.appAuthUser.email,
          ip: clientIp,
          name: actorName,
        },
      });

      const auditEntry = {
        action: result.auth_recreated ? 'auth_recreated_invite_sent' : 'password_reset_requested',
        label: result.auth_recreated
          ? 'Recriou conta e enviou convite'
          : 'Solicitou redefinição de senha',
        actor_name: actorName,
        actor_id: req.appAuthUser.id,
        ip: clientIp,
        target_email: targetEmail,
      };
      logCollaboratorAccessAudit(auditEntry);
      if (result.auth_user_id) {
        await appendAccessAuditToAuthUser(result.auth_user_id, auditEntry);
      }

      return res.status(200).json({
        ok: true,
        message: result.message || `Link de redefinição enviado para: ${targetEmail}`,
        email: targetEmail,
        email_sent: Boolean(result.email_sent),
        auth_recreated: Boolean(result.auth_recreated),
        invite_resent: Boolean(result.invite_resent),
        identity: result.identity || null,
        audit: auditEntry,
      });
    } catch (err) {
      console.error('[app-password-reset]', err);
      return res.status(400).json({
        message: err?.message || 'Não foi possível enviar o e-mail. Tente novamente.',
      });
    }
  };
}
