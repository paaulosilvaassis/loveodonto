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

/**
 * Verifica permissão usando somente a fonte canônica RBAC (accessService).
 * permission pode ser "module_key:action_key" (ex: agenda:write) ou legado (ex: collaborators:access).
 * Multi-tenant: user.isMaster (MASTER) tem acesso total.
 */
export const can = (user, permission) => {
  if (!user) return false;
  if (user.isMaster === true) return true;
  return canByPermission(user, permission);
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
