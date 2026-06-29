import { loadDb } from '../db/index.js';
import { normalizeTenantAccessRole } from '../utils/collaboratorAccessPanel.js';
import { isCollaboratorEmailValid } from '../utils/collaboratorAccessRole.js';
import {
  ensureLocalUserForSaasAccess,
  getUserAccess,
  getPermissionsCatalog,
  setUserSystemAccess,
  updateUserAccess,
  canManageAccess,
} from './accessService.js';
import {
  resolvePermissionStateFromTenantUser,
  syncPermissionStateToLocalDb,
} from './collaboratorPermissionPersistence.js';
import {
  linkCollaboratorTenantAccess,
  listTenantUsersAccess,
  setCollaboratorSystemAccess,
  setTenantUserSystemAccess,
  isCollaboratorAccessLinkNotFoundError,
} from './collaboratorAccessProvisionService.js';
import { syncLocalCollaboratorAccess } from './collaboratorService.js';
import { isSaasModeEnabled } from './saasAuthService.js';

export function getCollaboratorAccessLink(collaboratorId) {
  const id = String(collaboratorId || '').trim();
  if (!id) return null;
  const db = loadDb();
  const row = (db.collaboratorAccess || []).find((item) => item.collaboratorId === id);
  if (!row?.userId) return null;
  return {
    collaboratorId: id,
    userId: row.userId,
    role: row.role || 'atendimento',
  };
}

export function syncCollaboratorAccessFromTenantUser(
  collaboratorId,
  tenantUser,
  {
    collaborator = null,
    tenantId = '',
    currentUser = null,
    profileRole = null,
  } = {},
) {
  const userId = String(tenantUser?.user_id || '').trim();
  if (!collaboratorId || !userId) return null;

  const role = normalizeTenantAccessRole(
    profileRole || tenantUser?.role || tenantUser?.role_slug || 'atendimento',
  );
  const email = String(tenantUser?.email || collaborator?.email || '').trim().toLowerCase();
  const displayName = String(
    collaborator?.nomeCompleto || collaborator?.apelido || tenantUser?.full_name || '',
  ).trim();

  syncLocalCollaboratorAccess(collaboratorId, tenantUser, role);
  const catalogIds = getPermissionsCatalog().map((p) => p.id);
  const serverState = resolvePermissionStateFromTenantUser(tenantUser, role, catalogIds);
  syncPermissionStateToLocalDb(userId, {
    role,
    hasCustomPermissions: serverState.hasCustomPermissions,
    sparseOverrides: serverState.sparseOverrides,
    customPermissions: serverState.customPermissions,
    email,
    displayName,
    tenantId,
    collaboratorId,
    has_system_access: tenantUser?.has_system_access !== false,
  });
  ensureLocalUserForSaasAccess(userId, {
    email,
    role,
    has_system_access: tenantUser?.has_system_access !== false,
    displayName,
    tenantId,
    collaboratorId,
  });

  if (currentUser && canManageAccess(currentUser)) {
    try {
      const existing = getUserAccess(userId);
      if (existing) {
        updateUserAccess(currentUser, userId, {
          has_system_access: tenantUser?.has_system_access !== false,
          role,
          overrides: existing.overrides || {},
        });
      }
    } catch {
      /* permissão local opcional */
    }
  }

  return { collaboratorId, userId, role };
}

async function resolveTenantUserForCollaborator({
  tenantId,
  collaboratorId,
  collaborator,
  tenantUser = null,
}) {
  if (tenantUser?.id && tenantUser?.user_id) return tenantUser;

  const email = String(collaborator?.email || tenantUser?.email || '').trim().toLowerCase();
  if (!tenantId || !isCollaboratorEmailValid(email)) return tenantUser || null;

  try {
    const { users = [] } = await listTenantUsersAccess(tenantId);
    const byCollaborator = users.find((row) => row.collaborator_id === collaboratorId);
    if (byCollaborator?.id) return byCollaborator;
    const byEmail = users.find(
      (row) => String(row.email || '').trim().toLowerCase() === email,
    );
    return byEmail || tenantUser || null;
  } catch {
    return tenantUser || null;
  }
}

/**
 * Reconcilia vínculo Colaborador ↔ tenant_user ↔ collaboratorAccess ↔ RBAC local.
 * Silencioso: nunca propaga erro ao usuário.
 */
export async function reconcileCollaboratorAccessState({
  collaboratorId,
  collaborator = null,
  tenantUser = null,
  tenantId = '',
  currentUser = null,
}) {
  if (!collaboratorId || !tenantId) {
    return { tenantUser: tenantUser || null, access: null, recovered: false };
  }

  let resolvedTenantUser = await resolveTenantUserForCollaborator({
    tenantId,
    collaboratorId,
    collaborator,
    tenantUser,
  });

  const email = String(
    collaborator?.email || resolvedTenantUser?.email || '',
  ).trim().toLowerCase();

  if (
    isSaasModeEnabled()
    && resolvedTenantUser?.id
    && email
    && resolvedTenantUser.collaborator_id !== collaboratorId
  ) {
    try {
      const linked = await linkCollaboratorTenantAccess({
        tenant_id: tenantId,
        collaborator_id: collaboratorId,
        email,
        full_name: collaborator?.nomeCompleto || collaborator?.apelido || resolvedTenantUser.full_name || email,
      });
      resolvedTenantUser = linked?.tenant_user || resolvedTenantUser;
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.debug('[collaboratorAccessRecovery] link skipped', err?.message);
      }
    }
  }

  const existingLink = getCollaboratorAccessLink(collaboratorId);
  const needsLocalSync = resolvedTenantUser?.user_id
    && (!existingLink || existingLink.userId !== resolvedTenantUser.user_id);

  let access = existingLink;
  if (resolvedTenantUser?.user_id) {
    access = syncCollaboratorAccessFromTenantUser(collaboratorId, resolvedTenantUser, {
      collaborator,
      tenantId,
      currentUser,
    }) || existingLink;
  }

  return {
    tenantUser: resolvedTenantUser,
    access,
    recovered: Boolean(needsLocalSync && access),
  };
}

/**
 * Desativa/reativa acesso preservando vínculos e sincronizando local + remoto.
 */
export async function setCollaboratorSystemAccessWithRecovery({
  collaboratorId,
  collaborator,
  tenantUser,
  tenantId,
  currentUser,
  hasSystemAccess,
  lifecycle = null,
}) {
  const reconciled = await reconcileCollaboratorAccessState({
    collaboratorId,
    collaborator,
    tenantUser,
    tenantId,
    currentUser,
  });

  let resolvedTenantUser = reconciled.tenantUser || tenantUser;
  const email = String(
    collaborator?.email || resolvedTenantUser?.email || tenantUser?.email || '',
  ).trim().toLowerCase();
  const fullName = String(
    collaborator?.nomeCompleto || collaborator?.apelido || resolvedTenantUser?.full_name || tenantUser?.full_name || '',
  ).trim();

  if (
    isSaasModeEnabled()
    && resolvedTenantUser?.id
    && email
    && resolvedTenantUser.collaborator_id !== collaboratorId
  ) {
    try {
      const linked = await linkCollaboratorTenantAccess({
        tenant_id: tenantId,
        collaborator_id: collaboratorId,
        email,
        full_name: fullName,
      });
      resolvedTenantUser = linked?.tenant_user || resolvedTenantUser;
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.debug('[collaboratorAccessRecovery] link before toggle skipped', err?.message);
      }
    }
  }

  let result;
  try {
    result = await setCollaboratorSystemAccess(collaboratorId, {
      tenant_id: tenantId,
      has_system_access: hasSystemAccess,
      email,
      full_name: fullName,
      tenant_user_id: resolvedTenantUser?.id || tenantUser?.id || null,
      reason: lifecycle?.reason || undefined,
      reason_description: lifecycle?.reason_description || undefined,
      expected_return_at: lifecycle?.expected_return_at || undefined,
      suspended: lifecycle?.suspended || undefined,
    });
  } catch (err) {
    const tenantUserId = String(resolvedTenantUser?.id || tenantUser?.id || '').trim();
    if (!tenantUserId || !isCollaboratorAccessLinkNotFoundError(err?.message)) {
      throw err;
    }
    result = await setTenantUserSystemAccess(tenantUserId, {
      tenant_id: tenantId,
      has_system_access: hasSystemAccess,
    });
    if (result?.tenant_user) {
      result = {
        ...result,
        recovered_via_tenant_user: true,
      };
    }
  }

  const updatedTenantUser = {
    ...(resolvedTenantUser || tenantUser || {}),
    ...(result?.tenant_user || {}),
    has_system_access: hasSystemAccess,
    is_active: hasSystemAccess,
    status: hasSystemAccess ? 'active' : 'inactive',
  };
  const userId = String(updatedTenantUser?.user_id || '').trim();

  if (userId && currentUser) {
    syncCollaboratorAccessFromTenantUser(collaboratorId, updatedTenantUser, {
      collaborator,
      tenantId,
      currentUser,
    });
    try {
      setUserSystemAccess(currentUser, userId, hasSystemAccess);
    } catch {
      /* RBAC local opcional */
    }
  }

  return result;
}
