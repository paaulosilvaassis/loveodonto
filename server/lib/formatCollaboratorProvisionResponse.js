/**
 * Phase 4.10 Wave 3E — envelope de resposta do provisionamento de colaborador.
 */

export function createFormatCollaboratorProvisionResponse(deps) {
  const { isInviteEmailDelivered, normalizeInvitationStatus } = deps;

  return function formatCollaboratorProvisionResponse(
    provisioned,
    { authUserExisted = false, requestedAction = 'provision' } = {},
  ) {
    const inviteStatus = normalizeInvitationStatus(
      provisioned.tenantUser?.invitation_status
      || provisioned.invitation?.status
      || 'none',
    );
    const emailSent = isInviteEmailDelivered(provisioned.inviteDelivery);
    const hasSetupLink = Boolean(provisioned.inviteDelivery?.setupLink);
    const inviteSent = emailSent;
    let message = 'Acesso vinculado com sucesso.';
    if (emailSent) {
      message = 'Convite enviado por e-mail. Verifique a caixa de entrada e o spam.';
    } else if (hasSetupLink) {
      message = 'Link de acesso gerado. Se o e-mail não chegar, copie o link e envie manualmente ao colaborador.';
    } else if (authUserExisted) {
      message = 'Usuário já existia. Acesso vinculado — use Reenviar convite se o e-mail não chegou.';
    } else if (requestedAction === 'resend' && emailSent) {
      message = 'Convite reenviado por e-mail.';
    } else if (requestedAction === 'resend') {
      message = hasSetupLink
        ? 'Link de acesso gerado. Se o e-mail não chegar, copie o link e envie manualmente.'
        : 'Não foi possível enviar o e-mail automaticamente. Tente novamente ou verifique o SMTP do Supabase.';
    }

    return {
      ok: true,
      success: true,
      authUserId: provisioned.tenantUser?.user_id || null,
      tenantUserId: provisioned.tenantUser?.id || null,
      emailSent,
      inviteSent,
      inviteStatus: emailSent ? 'sent' : inviteStatus,
      linkedExisting: Boolean(authUserExisted),
      repairedBrokenLink: Boolean(provisioned.repairedBrokenLink),
      message,
      tenant_user: provisioned.tenantUser,
      invitation: provisioned.invitation,
      invite_delivery: provisioned.inviteDelivery || null,
    };
  };
}
