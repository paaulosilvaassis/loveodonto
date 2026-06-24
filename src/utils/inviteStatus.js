const INVITE_LABELS = {
  no_access: 'Sem acesso',
  sent: 'Convite enviado',
  pending: 'Convite pendente',
  active: 'Acesso ativo',
  expired: 'Convite expirado',
  revoked: 'Inativo',
  failed: 'Erro no envio',
  none: 'Sem acesso',
};

export function resolveUserInviteDisplayStatus({
  invitation = null,
  invitationStatus = 'none',
  emailLog = null,
  hasSystemAccess = true,
  userId = null,
} = {}) {
  const invStatus = String(invitation?.status || invitationStatus || 'none').toLowerCase();
  const logStatus = String(emailLog?.status || '').toLowerCase();

  if (logStatus === 'failed') {
    return { key: 'failed', label: INVITE_LABELS.failed };
  }
  if (hasSystemAccess === false) {
    return { key: 'revoked', label: INVITE_LABELS.revoked };
  }
  if (userId && hasSystemAccess !== false) {
    if (invStatus === 'accepted' || invStatus === 'none' || invStatus === 'sent') {
      return { key: 'active', label: INVITE_LABELS.active };
    }
  }
  if (
    invStatus === 'expired'
    || (invitation?.expires_at && invitation.expires_at <= new Date().toISOString())
  ) {
    return { key: 'expired', label: INVITE_LABELS.expired };
  }
  if (invStatus === 'sent') {
    return { key: 'sent', label: INVITE_LABELS.sent };
  }
  if (invStatus === 'pending') {
    return { key: 'pending', label: INVITE_LABELS.pending };
  }
  if (invStatus === 'revoked') {
    return { key: 'revoked', label: INVITE_LABELS.revoked };
  }
  return { key: 'none', label: INVITE_LABELS.none };
}

export function inviteStatusBadgeClass(key) {
  if (key === 'active' || key === 'sent' || key === 'pending') return 'on';
  if (key === 'failed') return 'off';
  return 'off';
}

export function resolveCollaboratorAccessDisplayStatus(tenantUser) {
  if (!tenantUser?.id) {
    return { key: 'no_access', label: INVITE_LABELS.no_access };
  }
  const status = resolveUserInviteDisplayStatus({
    invitation: tenantUser.invitation || null,
    invitationStatus: tenantUser.invitation_status,
    emailLog: tenantUser.email_log || null,
    hasSystemAccess: tenantUser.has_system_access,
    userId: tenantUser.user_id,
  });
  return {
    ...status,
    label: INVITE_LABELS[status.key] || status.label,
  };
}
