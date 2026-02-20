/**
 * Serviço de Acessos (RBAC): catálogo, can(), role defaults, user overrides, auditoria.
 * Backend é a fonte da verdade.
 */

import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';
import { logAction } from './logService.js';
import { buildPermissionsCatalog } from '../permissions/catalog.js';

const ROLE_ADMIN = 'admin';
/** Role de membership para admin (db.users.role=admin → membership.role=master) */
const ROLE_MASTER = 'master';
const ROLES = ['admin', 'administrativo', 'comercial', 'financeiro', 'atendimento', 'dentista', 'gerente', 'recepcao', 'profissional'];

/**
 * Fonte única: usuário pode gerenciar acessos/permissões/perfil.
 * Aceita: role admin (db.users), role master (membership), isMaster.
 */
export function canManageAccess(user) {
  if (!user) return false;
  if (user.isMaster === true) return true;
  const role = (user.role || '').toLowerCase();
  return role === ROLE_ADMIN || role === ROLE_MASTER;
}

const ROLE_LABELS = {
  admin: 'Administrador',
  administrativo: 'Administrativo',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
  atendimento: 'Atendimento',
  dentista: 'Dentista',
  gerente: 'Gerente',
  recepcao: 'Recepção',
  profissional: 'Profissional',
};

export { ROLES, ROLE_LABELS, ROLE_ADMIN };

/**
 * Retorna catálogo de permissões (do DB ou build inicial).
 */
export function getPermissionsCatalog() {
  const db = loadDb();
  if (Array.isArray(db.permissionsCatalog) && db.permissionsCatalog.length > 0) {
    return db.permissionsCatalog;
  }
  return buildPermissionsCatalog();
}

/**
 * Regras:
 * - Se user.role === ADMIN e has_system_access !== false: true (para qualquer module/action).
 * - Se has_system_access === false: false sempre.
 * - Senão: base em role_permissions do role do usuário; override em user_permissions (allowed); default deny.
 */
export function can(user, moduleKey, actionKey) {
  if (!user || !moduleKey || !actionKey) return false;
  const db = loadDb();
  const u = db.users?.find((x) => x.id === user.id) || user;
  const hasAccess = u.has_system_access !== false && u.active !== false;
  if (!hasAccess) return false;
  if (u.role === ROLE_ADMIN || u.role === 'master' || user.isMaster) return true;

  const catalog = getPermissionsCatalog();
  const permission = catalog.find((p) => p.module_key === moduleKey && p.action_key === actionKey);
  const pid = permission?.id;
  if (!pid) return false;

  const rolePerms = (db.rolePermissions || []).filter((r) => r.role === u.role).map((r) => r.permission_id);
  const baseAllowed = rolePerms.includes(pid);
  const userOverride = (db.userPermissions || []).find((x) => x.user_id === u.id && x.permission_id === pid);
  if (userOverride && typeof userOverride.allowed === 'boolean') return userOverride.allowed;
  return baseAllowed;
}

const LEGACY_ACTION_MAP = { read: 'view', write: 'edit' };

/**
 * Verificação legada: can(user, 'scope:action') — ex: agenda:write, patients:read.
 * Converte para can(user, module_key, action_key). read -> view, write -> edit.
 */
export function canByPermission(user, permission) {
  if (!user) return false;
  const db = loadDb();
  const u = db.users?.find((x) => x.id === user.id) || user;
  if (u.has_system_access === false || u.active === false) return false;
  if (u.role === ROLE_ADMIN || u.role === 'master' || user.isMaster) return true;
  if (permission === '*') return true;
  const [moduleKey, rawAction] = (permission || '').split(':');
  const actionKey = LEGACY_ACTION_MAP[rawAction] || rawAction;
  if (moduleKey && actionKey) return can(user, moduleKey, actionKey);
  return false;
}

/**
 * Retorna permissões padrão do perfil (role).
 */
export function getRoleDefaultPermissionIds(role) {
  const db = loadDb();
  return (db.rolePermissions || []).filter((r) => r.role === role).map((r) => r.permission_id);
}

/**
 * Retorna acesso completo do usuário: has_system_access, role, overrides (permission_id -> allowed).
 */
export function getUserAccess(userId) {
  const db = loadDb();
  const u = db.users?.find((x) => x.id === userId);
  if (!u) return null;
  const overrides = (db.userPermissions || [])
    .filter((x) => x.user_id === userId)
    .reduce((acc, x) => {
      acc[x.permission_id] = x.allowed;
      return acc;
    }, {});
  return {
    userId: u.id,
    has_system_access: u.has_system_access !== false,
    role: u.role || 'atendimento',
    overrides,
  };
}

/**
 * Atualiza acesso do usuário. Apenas ADMIN pode alterar.
 * Payload: { has_system_access?, role?, overrides? } (overrides = { permission_id: boolean }).
 * Registra em access_audit_logs.
 */
export function updateUserAccess(actor, targetUserId, payload) {
  const db = loadDb();
  if (!canManageAccess(actor)) {
    const err = new Error('Apenas Administrador pode alterar acessos.');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }
  const target = db.users?.find((x) => x.id === targetUserId);
  if (!target) throw new Error('Usuário não encontrado.');

  /** ADMIN único: não permitir atribuir perfil Administrador a outro usuário pela UI/API. */
  if (payload.role === ROLE_ADMIN && targetUserId !== actor.id) {
    const err = new Error('Não é permitido atribuir o perfil Administrador.');
    err.code = 'ROLE_ADMIN_FORBIDDEN';
    throw err;
  }

  const before = getUserAccess(targetUserId);

  return withDb((db) => {
    const userIndex = db.users.findIndex((x) => x.id === targetUserId);
    if (userIndex < 0) throw new Error('Usuário não encontrado.');

    if (typeof payload.has_system_access === 'boolean') {
      db.users[userIndex].has_system_access = payload.has_system_access;
    }
    if (payload.role && ROLES.includes(payload.role)) {
      db.users[userIndex].role = payload.role;
    }

    if (payload.overrides && typeof payload.overrides === 'object') {
      db.userPermissions = db.userPermissions || [];
      db.userPermissions = db.userPermissions.filter((x) => x.user_id !== targetUserId);
      for (const [permId, allowed] of Object.entries(payload.overrides)) {
        if (typeof allowed !== 'boolean') continue;
        db.userPermissions.push({
          user_id: targetUserId,
          permission_id: permId,
          allowed,
        });
      }
    }

    const after = getUserAccess(targetUserId);
    logAccessAudit(db, actor.id, targetUserId, 'PERMISSION_CHANGE', before, after);
    logAction('access:update', { actorId: actor.id, targetUserId });
    return after;
  });
}

/**
 * Concede ou revoga acesso ao sistema (toggle). Apenas ADMIN.
 */
export function setUserSystemAccess(actor, targetUserId, hasSystemAccess) {
  return updateUserAccess(actor, targetUserId, { has_system_access: hasSystemAccess });
}

function logAccessAudit(db, actorUserId, targetUserId, eventType, beforeJson, afterJson) {
  db.accessAuditLogs = db.accessAuditLogs || [];
  db.accessAuditLogs.push({
    id: createId('audit'),
    actor_user_id: actorUserId,
    target_user_id: targetUserId,
    event_type: eventType,
    before_json: beforeJson,
    after_json: afterJson,
    created_at: new Date().toISOString(),
  });
}

/**
 * Lista logs de auditoria de acesso (somente ADMIN).
 */
export function getAccessAuditLogs(options = {}) {
  const db = loadDb();
  let list = [...(db.accessAuditLogs || [])];
  if (options.targetUserId) list = list.filter((x) => x.target_user_id === options.targetUserId);
  if (options.limit) list = list.slice(-options.limit);
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return list;
}

/**
 * Retorna lista de usuários com resumo de acesso (para /admin/acessos).
 */
export function listUsersWithAccess() {
  const db = loadDb();
  return (db.users || []).map((u) => {
    const access = getUserAccess(u.id);
    const lastAudit = (db.accessAuditLogs || [])
      .filter((a) => a.target_user_id === u.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      active: u.active !== false,
      has_system_access: access?.has_system_access !== false,
      lastAccessChange: lastAudit?.created_at || null,
    };
  });
}
