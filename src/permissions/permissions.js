import { canByPermission } from '../services/accessService.js';

export const roles = {
  admin: 'admin',
  gerente: 'gerente',
  recepcao: 'recepcao',
  profissional: 'profissional',
  financeiro: 'financeiro',
  comercial: 'comercial',
  /** Perfis RBAC (mapeados para roles existentes) */
  administrativo: 'administrativo',
  atendimento: 'atendimento',
  dentista: 'dentista',
};

const rolePermissions = {
  [roles.admin]: ['*'],
  [roles.gerente]: [
    'agenda:read', 'agenda:write', 'patients:read', 'patients:write', 'finance:read', 'finance:write',
    'communication:read', 'communication:write', 'team:read', 'team:write', 'inventory:read', 'inventory:write',
    'reports:read', 'collaborators:read', 'collaborators:write', 'collaborators:finance', 'collaborators:access',
    'patients:access', 'patients:status',
  ],
  [roles.recepcao]: [
    'agenda:read', 'agenda:write', 'patients:read', 'patients:write', 'finance:read', 'finance:write',
    'communication:read', 'communication:write', 'team:read', 'inventory:read', 'inventory:write', 'reports:read',
    'collaborators:read',
  ],
  [roles.profissional]: [
    'agenda:read', 'agenda:write', 'patients:read', 'communication:read', 'reports:read', 'collaborators:read',
  ],
  [roles.financeiro]: [
    'finance:read', 'finance:write', 'reports:read', 'collaborators:read', 'collaborators:finance',
  ],
  [roles.comercial]: [
    'communication:read', 'communication:write', 'agenda:read', 'reports:read',
  ],
};

/**
 * Verifica permissão: primeiro RBAC (accessService), depois fallback em rolePermissions legado.
 * permission pode ser "module_key:action_key" (ex: agenda:write) ou legado (ex: collaborators:access).
 * Multi-tenant: user.isMaster (MASTER) tem acesso total.
 */
export const can = (user, permission) => {
  if (!user) return false;
  if (user.isMaster === true) return true;
  if (canByPermission(user, permission)) return true;
  const allowed = rolePermissions[user.role] || [];
  if (allowed.includes('*')) return true;
  return allowed.includes(permission);
};

/** Verificação granular RBAC: can(user, module_key, action_key). */
export { can as canModuleAction } from '../services/accessService.js';

export const requirePermission = (user, permission) => {
  if (!can(user, permission)) {
    const error = new Error('Permissão insuficiente.');
    error.code = 'PERMISSION_DENIED';
    throw error;
  }
};
