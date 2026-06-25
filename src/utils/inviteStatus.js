const INVITE_LABELS = {
  no_access: 'Sem convite',
  sent: 'Convite enviado',
  pending: 'Convite enviado',
  accepted: 'Convite aceito',
  active: 'Acesso ativo',
  expired: 'Convite expirado',
  revoked: 'Acesso bloqueado',
  failed: 'Erro no envio',
  none: 'Sem convite',
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
  if (invStatus === 'accepted') {
    return { key: 'accepted', label: INVITE_LABELS.accepted };
  }
  if (userId && hasSystemAccess !== false && (invStatus === 'none' || !invitation)) {
    return { key: 'active', label: INVITE_LABELS.active };
  }
  if (
    invStatus === 'expired'
    || (invitation?.expires_at && invitation.expires_at <= new Date().toISOString())
  ) {
    return { key: 'expired', label: INVITE_LABELS.expired };
  }
  if (invStatus === 'sent' || invStatus === 'pending') {
    return { key: 'sent', label: INVITE_LABELS.sent };
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

/** Classes visuais SaaS para badges de acesso na equipe. */
export function accessStatusBadgeClass(key) {
  switch (String(key || '').toLowerCase()) {
    case 'active':
    case 'accepted':
      return 'team-access-badge team-access-badge--active';
    case 'sent':
    case 'pending':
      return 'team-access-badge team-access-badge--invite';
    case 'revoked':
      return 'team-access-badge team-access-badge--blocked';
    case 'failed':
    case 'expired':
      return 'team-access-badge team-access-badge--warning';
    default:
      return 'team-access-badge team-access-badge--none';
  }
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
