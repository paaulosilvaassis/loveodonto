/**
 * Phase 4.10 Wave 3B — POST /internal/app/invitations/resend.
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createInvitationsResendHandler(deps) {
  const {
    supabase,
    identityService,
    getTenantAdminActorOrThrow,
    normalizeEmail,
    normalizeRoleValue,
    formatProvisionErrorResponse,
    resolveClientIp,
  } = deps;

  return async function handleInvitationsResend(req, res) {
    try {
      const explicitTenantId = normalizeText(req.body?.tenant_id);
      const targetEmail = normalizeEmail(req.body?.email);
      const collaboratorId = normalizeText(req.body?.collaborator_id);
      const collaboratorFullName = normalizeText(req.body?.collaborator_full_name || req.body?.full_name);

      if (!targetEmail) {
        return res.status(400).json({ error: 'Informe um e-mail válido para reenviar o convite.' });
      }

      const actorTenantUser = req.tenantContext?.tenantUser
        || await getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId);
      const tenantId = req.tenantContext?.tenantId || actorTenantUser.tenant_id;

      const { data: tenantUser } = await supabase
        .from('tenant_users')
        .select('id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug')
        .eq('tenant_id', tenantId)
        .eq('email', targetEmail)
        .maybeSingle();

      const resolvedCollaboratorId = tenantUser?.collaborator_id || collaboratorId || '';
      const resolvedFullName = collaboratorFullName || tenantUser?.full_name || targetEmail;
      const resolvedRole = normalizeRoleValue(tenantUser?.role || tenantUser?.role_slug || req.body?.profile_role || 'atendimento');

      if (!resolvedCollaboratorId) {
        return res.status(400).json({
          error: 'Colaborador não identificado. Salve o acesso na aba Acesso ao sistema antes de reenviar.',
        });
      }

      const result = await identityService.resendInviteByEmail({
        actorAuthUserId: req.appAuthUser.id,
        tenantId,
        email: targetEmail,
        collaboratorId: resolvedCollaboratorId,
        collaboratorFullName: resolvedFullName,
        profileRole: resolvedRole,
        actor: { id: req.appAuthUser.id, email: req.appAuthUser.email, ip: resolveClientIp(req) },
      });

      return res.status(200).json({
        success: true,
        tenant_user: result.formatted?.tenant_user,
        invitation: result.formatted?.invitation,
        invite_delivery: result.formatted?.invite_delivery,
        email_sent: result.formatted?.emailSent,
        message: result.formatted?.message,
        identity: result.identity,
        repaired_broken_link: result.formatted?.repairedBrokenLink,
      });
    } catch (err) {
      console.error('[app-invitations-resend]', err);
      const payload = formatProvisionErrorResponse(err, 'Não foi possível reenviar o convite. Tente novamente.');
      return res.status(400).json(payload);
    }
  };
}
