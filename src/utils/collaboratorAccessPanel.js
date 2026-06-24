/**
 * Normaliza slug de perfil vindo do tenant_users para o catálogo RBAC local.
 */
export function normalizeTenantAccessRole(role) {
  const raw = String(role || '').trim().toLowerCase();
  if (!raw) return 'atendimento';
  if (['owner', 'admin', 'master'].includes(raw)) return 'admin';
  if (['manager', 'gerente'].includes(raw)) return 'gerente';
  if (['doctor', 'dentist', 'dentista', 'professional', 'profissional'].includes(raw)) return 'profissional';
  if (['reception', 'recepcao', 'atendimento', 'support'].includes(raw)) return 'atendimento';
  if (['finance', 'financial', 'financeiro'].includes(raw)) return 'financeiro';
  if (['sales', 'commercial', 'comercial'].includes(raw)) return 'comercial';
  return raw;
}

export function resolveAccessTargetUserId({ localUserId, tenantUser } = {}) {
  return localUserId || tenantUser?.user_id || null;
}

export function canShowCollaboratorPermissionsPanel({ targetUserId, tenantUser, collaboratorEmail } = {}) {
  if (targetUserId) return true;
  if (tenantUser?.user_id) return true;
  if (tenantUser?.id && collaboratorEmail) return true;
  return false;
}
