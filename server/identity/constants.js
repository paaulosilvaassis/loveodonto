/** Status canônicos — Identity Management (Love Odonto SaaS). */

export const IDENTITY_STATUS = {
  ACTIVE: 'active',
  INVITATION_PENDING: 'invitation_pending',
  PASSWORD_PENDING: 'password_pending',
  PASSWORD_RESET_SENT: 'password_reset_sent',
  SUSPENDED: 'suspended',
  DISABLED: 'disabled',
  DELETED: 'deleted',
  BROKEN_LINK: 'broken_link',
  REPAIRED: 'repaired',
  WAITING_SYNC: 'waiting_sync',
};

export const INVITATION_STATUS = {
  NONE: 'none',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  EXPIRED: 'expired',
  FAILED: 'failed',
};

export const PASSWORD_STATUS = {
  PENDING: 'pending',
  CREATED: 'created',
  RESET_SENT: 'reset_sent',
  RESET_REQUIRED: 'reset_required',
};

export const IDENTITY_HEALTH = {
  HEALTHY: 'healthy',
  NEEDS_REPAIR: 'needs_repair',
  AUTH_MISSING: 'auth_missing',
  TENANT_USER_MISSING: 'tenant_user_missing',
  COLLABORATOR_LINK_MISSING: 'collaborator_link_missing',
  ROLE_MISMATCH: 'role_mismatch',
  EMAIL_MISMATCH: 'email_mismatch',
  PERMISSIONS_OUTDATED: 'permissions_outdated',
};

export const IDENTITY_EVENTS = {
  CREATED: 'identity.created',
  PROVISIONED: 'identity.provisioned',
  REPAIRED: 'identity.repaired',
  INVITE_SENT: 'identity.invite.sent',
  INVITE_FAILED: 'identity.invite.failed',
  INVITE_ACCEPTED: 'identity.invite.accepted',
  PASSWORD_RESET_SENT: 'identity.password.reset.sent',
  PASSWORD_CHANGED: 'identity.password.changed',
  ROLE_CHANGED: 'identity.role.changed',
  PERMISSIONS_CHANGED: 'identity.permissions.changed',
  DISABLED: 'identity.disabled',
  REACTIVATED: 'identity.reactivated',
  SESSION_REVOKED: 'identity.session.revoked',
  HEALTH_CHECKED: 'identity.health.checked',
  ERROR: 'identity.error',
};

export const DISABLE_REASONS = [
  { value: 'vacation', label: 'Férias' },
  { value: 'medical_leave', label: 'Licença médica' },
  { value: 'maternity_leave', label: 'Licença maternidade' },
  { value: 'paternity_leave', label: 'Licença paternidade' },
  { value: 'inss_leave', label: 'Afastamento INSS' },
  { value: 'suspension', label: 'Suspensão' },
  { value: 'termination', label: 'Demissão' },
  { value: 'voluntary_exit', label: 'Desligamento voluntário' },
  { value: 'role_change', label: 'Troca de função' },
  { value: 'unit_change', label: 'Troca de unidade' },
  { value: 'security', label: 'Segurança da informação' },
  { value: 'admin_request', label: 'Solicitação do administrador' },
  { value: 'other', label: 'Outro' },
];

export const REACTIVATION_REASONS = [
  { value: 'return_vacation', label: 'Retorno de férias' },
  { value: 'return_leave', label: 'Retorno de licença' },
  { value: 'rehire', label: 'Recontratação' },
  { value: 'admin_correction', label: 'Correção administrativa' },
  { value: 'other', label: 'Outro' },
];

export const IDENTITY_STATUS_LABELS = {
  active: 'Ativo',
  invitation_pending: 'Convite pendente',
  password_pending: 'Senha pendente',
  password_reset_sent: 'Reset enviado',
  suspended: 'Suspenso',
  disabled: 'Desativado',
  deleted: 'Excluído',
  broken_link: 'Vínculo quebrado',
  repaired: 'Reparado',
  waiting_sync: 'Aguardando sincronização',
};

export const IDENTITY_HEALTH_LABELS = {
  healthy: 'Saudável',
  needs_repair: 'Precisa de reparo',
  auth_missing: 'Conta Auth ausente',
  tenant_user_missing: 'Tenant user ausente',
  collaborator_link_missing: 'Colaborador não vinculado',
  role_mismatch: 'Perfil divergente',
  email_mismatch: 'E-mail divergente',
  permissions_outdated: 'Permissões desatualizadas',
};
