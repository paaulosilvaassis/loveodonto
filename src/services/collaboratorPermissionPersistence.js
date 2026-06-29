/**
 * Persistência de permissões customizadas por colaborador (SaaS).
 * Fonte canónica: Supabase Auth app_metadata (has_custom_permissions + custom_permissions).
 * IndexedDB espelha o estado para UI offline e can() local.
 */
import { withDb } from '../db/index.js';
import { getRoleDefaultPermissionIds, ensureLocalUserForSaasAccess } from './accessService.js';

function readAuthMeta(source) {
  if (!source || typeof source !== 'object') return {};
  if (source.app_metadata && typeof source.app_metadata === 'object') return source.app_metadata;
  if (source.auth_meta && typeof source.auth_meta === 'object') return source.auth_meta;
  return source;
}

function readBooleanFlag(value) {
  return value === true;
}

function readPermissionMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

/**
 * Converte mapa efetivo completo em overrides esparsos (diff vs padrão do perfil).
 */
export function sparseOverridesFromEffectiveMap(customPermissions, role) {
  const roleDefaults = new Set(getRoleDefaultPermissionIds(role));
  const sparse = {};
  if (!customPermissions || typeof customPermissions !== 'object') return sparse;
  for (const [permId, allowed] of Object.entries(customPermissions)) {
    if (typeof allowed !== 'boolean') continue;
    const base = roleDefaults.has(permId);
    if (allowed !== base) sparse[permId] = allowed;
  }
  return sparse;
}

/**
 * Reconstrói mapa efetivo a partir de overrides esparsos + padrão do perfil.
 */
export function effectiveMapFromSparseOverrides(sparseOverrides, role, catalogIds) {
  const roleDefaults = new Set(getRoleDefaultPermissionIds(role));
  const sparse = sparseOverrides && typeof sparseOverrides === 'object' ? sparseOverrides : {};
  const map = {};
  for (const permId of catalogIds) {
    map[permId] = sparse[permId] !== undefined
      ? sparse[permId]
      : roleDefaults.has(permId);
  }
  return map;
}

/**
 * @param {object} tenantUser — linha de tenant_users com auth_meta ou campos explícitos
 * @param {string} role — perfil normalizado
 * @param {string[]} catalogIds — ids do catálogo de permissões
 */
export function resolvePermissionStateFromTenantUser(tenantUser, role, catalogIds = []) {
  const meta = readAuthMeta(tenantUser);
  const explicitHasCustom = readBooleanFlag(tenantUser?.has_custom_permissions ?? meta.has_custom_permissions);
  const explicitCustom = readPermissionMap(tenantUser?.custom_permissions ?? meta.custom_permissions);
  const sparseOverrides = readPermissionMap(tenantUser?.permission_overrides ?? meta.permission_overrides) || {};

  if (explicitHasCustom && explicitCustom) {
    return {
      hasCustomPermissions: true,
      customPermissions: explicitCustom,
      sparseOverrides: sparseOverridesFromEffectiveMap(explicitCustom, role),
    };
  }

  if (Object.keys(sparseOverrides).length > 0) {
    const customPermissions = effectiveMapFromSparseOverrides(sparseOverrides, role, catalogIds);
    return {
      hasCustomPermissions: true,
      customPermissions,
      sparseOverrides,
    };
  }

  return {
    hasCustomPermissions: false,
    customPermissions: null,
    sparseOverrides: {},
  };
}

/**
 * Conta permissões efetivas permitidas.
 */
export function countAllowedPermissions({ sparseOverrides, role, catalogIds }) {
  const map = effectiveMapFromSparseOverrides(sparseOverrides, role, catalogIds);
  return Object.values(map).filter(Boolean).length;
}

/**
 * Sincroniza estado vindo do servidor para IndexedDB (sem auditoria).
 */
export function syncPermissionStateToLocalDb(userId, {
  role = 'atendimento',
  hasCustomPermissions = false,
  sparseOverrides = {},
  customPermissions = null,
  email = '',
  displayName = '',
  tenantId = '',
  collaboratorId = '',
  has_system_access: hasSystemAccess = true,
} = {}) {
  if (!userId) return false;

  ensureLocalUserForSaasAccess(userId, {
    email,
    role,
    has_system_access: hasSystemAccess,
    displayName,
    tenantId,
    collaboratorId,
  });

  const overrides = hasCustomPermissions
    ? (sparseOverrides && typeof sparseOverrides === 'object' ? sparseOverrides : {})
    : {};

  withDb((db) => {
    db.users = db.users || [];
    const uIdx = db.users.findIndex((u) => u.id === userId);
    if (uIdx >= 0) {
      db.users[uIdx] = {
        ...db.users[uIdx],
        role,
        has_custom_permissions: hasCustomPermissions,
        custom_permissions: hasCustomPermissions ? (customPermissions || {}) : undefined,
        permissionOverrides: overrides,
      };
    }

    db.userPermissions = db.userPermissions || [];
    db.userPermissions = db.userPermissions.filter((x) => x.user_id !== userId);
    if (hasCustomPermissions) {
      for (const [permId, allowed] of Object.entries(overrides)) {
        if (typeof allowed !== 'boolean') continue;
        db.userPermissions.push({
          user_id: userId,
          permission_id: permId,
          allowed,
        });
      }
    }
    return db;
  });

  return true;
}

/**
 * Sincroniza permissões de todos os membros do roster que tenham user_id.
 */
export function syncTeamRosterPermissionStates(teamRoster, tenantId, catalogIds = []) {
  if (!Array.isArray(teamRoster) || teamRoster.length === 0) return 0;
  let synced = 0;
  for (const member of teamRoster) {
    const userId = String(member?.user_id || member?.userId || '').trim();
    if (!userId) continue;
    const role = String(member?.role || member?.role_slug || 'atendimento').trim().toLowerCase();
    const state = resolvePermissionStateFromTenantUser(member, role, catalogIds);
    if (!state.hasCustomPermissions && Object.keys(state.sparseOverrides).length === 0) {
      const existing = syncPermissionStateToLocalDb(userId, {
        role,
        hasCustomPermissions: false,
        sparseOverrides: {},
        email: member?.email || '',
        displayName: member?.full_name || member?.fullName || '',
        tenantId,
        collaboratorId: member?.collaborator_id || member?.collaboratorId || '',
        has_system_access: member?.has_system_access !== false,
      });
      if (existing) synced += 1;
      continue;
    }
    syncPermissionStateToLocalDb(userId, {
      role,
      hasCustomPermissions: state.hasCustomPermissions,
      sparseOverrides: state.sparseOverrides,
      customPermissions: state.customPermissions,
      email: member?.email || '',
      displayName: member?.full_name || member?.fullName || '',
      tenantId,
      collaboratorId: member?.collaborator_id || member?.collaboratorId || '',
      has_system_access: member?.has_system_access !== false,
    });
    synced += 1;
  }
  return synced;
}
