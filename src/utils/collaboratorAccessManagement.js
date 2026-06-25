/**
 * Status e ações do card "Gerenciamento de Acesso" (SaaS).
 */

const ACCOUNT_STATUS_LABELS = {
  no_access: 'Sem acesso',
  invite_pending: 'Convite pendente',
  first_access_pending: 'Primeiro acesso pendente',
  active: 'Conta ativa',
  password_reset: 'Senha redefinida',
  blocked: 'Conta bloqueada',
};

export function formatAccessDate(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return '—';
  }
}

export function isTenantSystemAccessActive(tenantUser) {
  if (!tenantUser?.id) return false;
  return tenantUser.has_system_access !== false
    && tenantUser.status !== 'inactive'
    && tenantUser.is_active !== false;
}

export function resolveCollaboratorAccountStatus(tenantUser) {
  if (!tenantUser?.id) {
    return { key: 'no_access', label: ACCOUNT_STATUS_LABELS.no_access };
  }

  const hasSystemAccess = tenantUser.has_system_access !== false
    && tenantUser.status !== 'inactive'
    && tenantUser.is_active !== false;

  if (!hasSystemAccess) {
    return { key: 'blocked', label: ACCOUNT_STATUS_LABELS.blocked };
  }

  const invStatus = String(
    tenantUser.invitation_status || tenantUser.invitation?.status || 'none',
  ).toLowerCase();

  const hasAuthUser = Boolean(tenantUser.user_id) && tenantUser.auth_user_valid !== false;
  const passwordResetSentAt = tenantUser.password_reset_sent_at
    || tenantUser.auth_meta?.last_password_reset_requested_at
    || null;
  const lastSignIn = tenantUser.last_sign_in_at || null;

  if (passwordResetSentAt && !lastSignIn) {
    return { key: 'password_reset', label: ACCOUNT_STATUS_LABELS.password_reset };
  }

  if (!hasAuthUser) {
    if (['sent', 'pending'].includes(invStatus)) {
      return { key: 'invite_pending', label: ACCOUNT_STATUS_LABELS.invite_pending };
    }
    if (invStatus === 'none' || !tenantUser.invitation) {
      return { key: 'no_access', label: ACCOUNT_STATUS_LABELS.no_access };
    }
    return { key: 'invite_pending', label: ACCOUNT_STATUS_LABELS.invite_pending };
  }

  if (['sent', 'pending'].includes(invStatus) && !tenantUser.invitation?.accepted_at) {
    return { key: 'first_access_pending', label: ACCOUNT_STATUS_LABELS.first_access_pending };
  }

  if (invStatus === 'expired') {
    return { key: 'invite_pending', label: 'Convite expirado' };
  }
  if (invStatus === 'failed') {
    return { key: 'invite_pending', label: 'Erro no envio do convite' };
  }

  if (passwordResetSentAt) {
    const resetAt = new Date(passwordResetSentAt).getTime();
    const signInAt = lastSignIn ? new Date(lastSignIn).getTime() : 0;
    if (!signInAt || resetAt > signInAt) {
      return { key: 'password_reset', label: ACCOUNT_STATUS_LABELS.password_reset };
    }
  }

  if (['accepted', 'active'].includes(invStatus) || hasAuthUser) {
    return { key: 'active', label: ACCOUNT_STATUS_LABELS.active };
  }

  return { key: 'active', label: ACCOUNT_STATUS_LABELS.active };
}

export function resolveAccessManagementActions({ tenantUser, accountStatus, hasValidEmail = true } = {}) {
  const key = accountStatus?.key || 'no_access';
  const hasTenantUser = Boolean(tenantUser?.id);
  const hasAuthUser = Boolean(tenantUser?.user_id) && tenantUser.auth_user_valid !== false;
  const invStatus = String(
    tenantUser?.invitation_status || tenantUser?.invitation?.status || 'none',
  ).toLowerCase();
  const inviteNotAccepted = !['accepted', 'active'].includes(invStatus) && !tenantUser?.invitation?.accepted_at;
  const neverInvited = key === 'no_access' || (invStatus === 'none' && !tenantUser?.invitation);
  const canResendByInviteStatus = ['sent', 'pending', 'expired', 'failed', 'revoked'].includes(invStatus);

  return {
    canSendInvite: hasValidEmail && (neverInvited || (!hasAuthUser && invStatus === 'none')),
    canResendInvite: hasValidEmail && hasTenantUser && inviteNotAccepted
      && (['invite_pending', 'first_access_pending', 'blocked'].includes(key)
        || canResendByInviteStatus),
    canResetPassword: hasValidEmail && hasTenantUser && hasAuthUser
      && ['active', 'password_reset'].includes(key)
      && !inviteNotAccepted,
    canDeactivate: hasTenantUser && isTenantSystemAccessActive(tenantUser),
    canActivate: hasTenantUser && !isTenantSystemAccessActive(tenantUser),
  };
}

export function accountStatusBadgeClass(key) {
  switch (String(key || '').toLowerCase()) {
    case 'active':
      return 'team-access-badge team-access-badge--active';
    case 'password_reset':
      return 'team-access-badge team-access-badge--invite';
    case 'invite_pending':
    case 'first_access_pending':
      return 'team-access-badge team-access-badge--invite';
    case 'blocked':
      return 'team-access-badge team-access-badge--blocked';
    default:
      return 'team-access-badge team-access-badge--none';
  }
}

export function resolveAccessManagementDates(tenantUser) {
  const invitation = tenantUser?.invitation || null;
  return {
    inviteDate: invitation?.sent_at || invitation?.created_at || tenantUser?.created_at || null,
    lastSignIn: tenantUser?.last_sign_in_at || null,
    lastPasswordReset: tenantUser?.password_reset_sent_at
      || tenantUser?.auth_meta?.last_password_reset_requested_at
      || null,
    createdAt: tenantUser?.created_at || null,
  };
}
