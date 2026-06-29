/**
 * Serviço de Acessos (RBAC): catálogo, can(), role defaults, user overrides, auditoria.
 * Backend é a fonte da verdade.
 */

import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';
import { logAction } from './logService.js';
import { buildPermissionsCatalog } from '../permissions/catalog.js';
import { ROLE_DEFAULT_PERMISSIONS } from '../permissions/roleDefaults.js';
import { isSaasModeEnabled } from './saasAuthService.js';

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
  return role === ROLE_ADMIN || role === ROLE_MASTER || role === 'owner' || role === 'gerente';
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
  const u = resolveEffectiveUser(db, user);
  const hasAccess = u.has_system_access !== false && u.active !== false;
  if (!hasAccess) return false;
  const roleNorm = String(u.role || '').toLowerCase();
  if (roleNorm === ROLE_ADMIN || roleNorm === 'master' || roleNorm === 'owner' || u.isMaster) return true;

  const catalog = getPermissionsCatalog();
  const permission = catalog.find((p) => p.module_key === moduleKey && p.action_key === actionKey);
  const pid = permission?.id;
  if (!pid) return false;

  const rolePerms = getRolePermissionIds(db, u.role);
  const baseAllowed = rolePerms.includes(pid);
  const saasOverrides = u?.permissionOverrides && typeof u.permissionOverrides === 'object' && !Array.isArray(u.permissionOverrides)
    ? u.permissionOverrides
    : null;
  if (saasOverrides && Object.prototype.hasOwnProperty.call(saasOverrides, pid)) {
    const overrideVal = saasOverrides[pid];
    if (typeof overrideVal === 'boolean') return overrideVal;
  }
  const userOverride = (db.userPermissions || []).find((x) => x.user_id === u.id && x.permission_id === pid);
  if (userOverride && typeof userOverride.allowed === 'boolean') return userOverride.allowed;
  return baseAllowed;
}

/**
 * Usuário pode cadastrar novo colaborador (RH).
 * Admin/master/owner/gerente: sempre; demais: permissão equipe:create ou colaboradores:create.
 */
export function canCreateCollaborator(user) {
  if (!user) return false;
  if (user.isMaster === true) return true;
  const role = String(user.role || '').toLowerCase();
  if (['admin', 'owner', 'master', 'gerente'].includes(role)) return true;
  if (can(user, 'equipe', 'create')) return true;
  if (can(user, 'colaboradores', 'create')) return true;
  return false;
}

function resolveEffectiveUser(db, user) {
  if (!user?.id) return user;
  const dbUser = db.users?.find((x) => x.id === user.id);
  if (!dbUser) return user;
  return {
    ...dbUser,
    role: user.role || dbUser.role,
    isMaster: user.isMaster ?? dbUser.isMaster,
    permissionOverrides: user.permissionOverrides ?? dbUser.permissionOverrides,
    has_system_access: user.has_system_access ?? dbUser.has_system_access,
    active: user.active ?? dbUser.active,
  };
}

function getRolePermissionIds(db, role) {
  const fromDb = (db.rolePermissions || []).filter((r) => r.role === role).map((r) => r.permission_id);
  if (fromDb.length > 0) return fromDb;
  return ROLE_DEFAULT_PERMISSIONS[role] || [];
}

const LEGACY_ACTION_MAP = { read: 'view', write: 'edit' };

/**
 * Verificação legada: can(user, 'scope:action') — ex: agenda:write, patients:read.
 * Converte para can(user, module_key, action_key). read -> view, write -> edit.
 */
export function canByPermission(user, permission) {
  if (!user) return false;
  const db = loadDb();
  const u = resolveEffectiveUser(db, user);
  if (u.has_system_access === false || u.active === false) return false;
  const roleNorm = String(u.role || '').toLowerCase();
  if (roleNorm === ROLE_ADMIN || roleNorm === 'master' || roleNorm === 'owner' || u.isMaster) return true;
  if (permission === '*') return true;
  const [moduleKey, rawAction] = (permission || '').split(':');
  const actionKey = LEGACY_ACTION_MAP[rawAction] || rawAction;
  if (moduleKey && actionKey) return can(u, moduleKey, actionKey);
  return false;
}

/**
 * Retorna permissões padrão do perfil (role).
 */
export function getRoleDefaultPermissionIds(role) {
  const db = loadDb();
  return getRolePermissionIds(db, role);
}

/**
 * Compatibilidade SaaS: garante linha mínima no IndexedDB para user_id remoto
 * antes de aplicar overrides locais de permissão.
 */
export function ensureLocalUserForSaasAccess(targetUserId, {
  email = '',
  role = 'atendimento',
  has_system_access: hasSystemAccess = true,
  displayName = '',
  tenantId = '',
  collaboratorId = '',
} = {}) {
  if (!targetUserId) return false;
  const db = loadDb();
  const createdUser = !db.users?.some((u) => u.id === targetUserId);

  const emailNorm = String(email || '').trim().toLowerCase();
  const now = new Date().toISOString();
  const tid = String(tenantId || '').trim();
  if (!tid && isSaasModeEnabled()) return false;
  const roleNorm = String(role || '').trim().toLowerCase();
  const appRole = ROLES.includes(roleNorm) ? roleNorm : 'atendimento';
  const membershipRole = appRole === ROLE_ADMIN ? ROLE_MASTER : appRole;
  const name = String(displayName || '').trim() || (emailNorm ? emailNorm.split('@')[0] : 'Usuário');
  const collabId = String(collaboratorId || '').trim();

  withDb((d) => {
    d.users = d.users || [];
    const uIdx = d.users.findIndex((u) => u.id === targetUserId);
    const userRecord = {
      id: targetUserId,
      name,
      email: emailNorm,
      role: appRole,
      active: true,
      has_system_access: hasSystemAccess !== false,
    };
    if (uIdx >= 0) {
      d.users[uIdx] = { ...d.users[uIdx], ...userRecord };
    } else {
      d.users.push(userRecord);
    }

    d.users_profile = d.users_profile || [];
    const pIdx = d.users_profile.findIndex((p) => p.id === targetUserId);
    const profileRecord = {
      id: targetUserId,
      full_name: name,
      email: emailNorm,
      phone: '',
      tenant_id: tid || undefined,
      created_at: now,
      updated_at: now,
    };
    if (pIdx >= 0) {
      d.users_profile[pIdx] = { ...d.users_profile[pIdx], ...profileRecord };
    } else {
      d.users_profile.push(profileRecord);
    }

    if (tid) {
      d.memberships = d.memberships || [];
      const mIdx = d.memberships.findIndex((m) => m.tenant_id === tid && m.user_id === targetUserId);
      const membershipRecord = {
        id: mIdx >= 0 ? d.memberships[mIdx].id : `memb-${crypto.randomUUID()}`,
        tenant_id: tid,
        user_id: targetUserId,
        role: membershipRole,
        has_system_access: hasSystemAccess !== false,
        status: 'active',
        created_at: mIdx >= 0 ? d.memberships[mIdx].created_at : now,
        updated_at: now,
      };
      if (mIdx >= 0) {
        d.memberships[mIdx] = { ...d.memberships[mIdx], ...membershipRecord };
      } else {
        d.memberships.push(membershipRecord);
      }
    }

    if (collabId) {
      d.collaboratorAccess = d.collaboratorAccess || [];
      const aIdx = d.collaboratorAccess.findIndex((a) => a.collaboratorId === collabId);
      const accessRecord = {
        collaboratorId: collabId,
        userId: targetUserId,
        tenant_id: tid || undefined,
        role: appRole,
        permissions: aIdx >= 0 ? (d.collaboratorAccess[aIdx].permissions || []) : [],
        lastLoginAt: aIdx >= 0 ? (d.collaboratorAccess[aIdx].lastLoginAt || '') : '',
      };
      if (aIdx >= 0) {
        d.collaboratorAccess[aIdx] = { ...d.collaboratorAccess[aIdx], ...accessRecord };
      } else {
        d.collaboratorAccess.push(accessRecord);
      }
    }

    return d;
  });
  return createdUser;
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
function countPrivilegedUsers(db) {
  return (db.users || []).filter((u) => {
    const role = String(u.role || '').toLowerCase();
    return u.has_system_access !== false && (role === ROLE_ADMIN || role === 'master' || role === 'owner');
  }).length;
}

export function updateUserAccess(actor, targetUserId, payload) {
  const db = loadDb();
  if (!canManageAccess(actor)) {
    const err = new Error('Apenas Administrador pode alterar acessos.');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }
  const target = db.users?.find((x) => x.id === targetUserId);
  if (!target) throw new Error('Usuário não encontrado.');

  const targetRole = String(target.role || '').toLowerCase();
  const actorIsTarget = actor.id === targetUserId;
  const privilegedRoles = new Set([ROLE_ADMIN, 'master', 'owner']);

  if (payload.role === ROLE_ADMIN && targetUserId !== actor.id) {
    const err = new Error('Não é permitido atribuir o perfil Administrador.');
    err.code = 'ROLE_ADMIN_FORBIDDEN';
    throw err;
  }

  if (typeof payload.has_system_access === 'boolean' && payload.has_system_access === false) {
    if (privilegedRoles.has(targetRole)) {
      const remaining = countPrivilegedUsers(db) - (target.has_system_access !== false ? 1 : 0);
      if (remaining < 1) {
        const err = new Error('Não é possível desativar o único administrador da clínica.');
        err.code = 'LAST_ADMIN_PROTECTED';
        throw err;
      }
    }
    if (actorIsTarget && privilegedRoles.has(targetRole)) {
      const err = new Error('Você não pode remover seu próprio acesso administrativo.');
      err.code = 'SELF_ADMIN_LOCKOUT';
      throw err;
    }
  }

  if (payload.role && privilegedRoles.has(targetRole) && payload.role !== target.role) {
    if (actorIsTarget && countPrivilegedUsers(db) <= 1) {
      const err = new Error('Você não pode remover seu próprio perfil administrativo por ser o único admin.');
      err.code = 'SELF_ADMIN_LOCKOUT';
      throw err;
    }
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
