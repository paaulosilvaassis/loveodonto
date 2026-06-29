/**
 * Garante que o usuário SaaS autenticado exista nas coleções internas do IndexedDB
 * (users, users_profile, memberships, collaborators, collaboratorAccess).
 *
 * Chamado uma vez por sessão no AuthContext após resolveSaasUserFromSession.
 * Idempotente: busca por id/email antes de inserir; atualiza se já existe.
 */
import { loadDb, withDb } from '../db/index.js';
import { ROLE_MASTER } from '../constants/tenantRoles.js';
import { isMasterMembershipRole } from '../utils/rbacHelpers.js';
import { looksLikeEmail } from '../utils/userDisplayName.js';
import { normalizeTenantId } from './tenantIsolation.js';
import { roleToMinimalRhProfile } from './tenantTeamRosterSync.js';

const COLLABORATOR_PREFIX = 'col-saas-';

function buildSyntheticCollaboratorId(authUserId) {
  return `${COLLABORATOR_PREFIX}${authUserId}`;
}

function findRhCollaborator(db, email, tenantId) {
  const emailNorm = String(email || '').trim().toLowerCase();
  if (!emailNorm) return null;
  const tid = normalizeTenantId(tenantId);
  const matches = (db.collaborators || []).filter(
    (c) => (c.email || '').trim().toLowerCase() === emailNorm,
  );
  if (matches.length === 0) return null;
  if (tid) {
    const inTenant = matches.find(
      (c) => normalizeTenantId(c.tenant_id || c.tenantId) === tid,
    );
    if (inTenant) return inTenant;
  }
  return matches.find((c) => !String(c.id || '').startsWith(COLLABORATOR_PREFIX)) || matches[0];
}

function syncPermissionOverrides(db, userId, permissionOverrides) {
  if (!userId || !permissionOverrides || typeof permissionOverrides !== 'object') return;
  db.userPermissions = db.userPermissions || [];
  const hasOverrides = Object.keys(permissionOverrides).length > 0;
  if (!hasOverrides) return;
  db.userPermissions = db.userPermissions.filter((x) => x.user_id !== userId);
  for (const [permId, allowed] of Object.entries(permissionOverrides)) {
    if (typeof allowed !== 'boolean') continue;
    db.userPermissions.push({
      user_id: userId,
      permission_id: permId,
      allowed,
    });
  }
}

/**
 * @param {{ id: string, name: string, email: string, role: string, tenantId: string, authMode: string, collaboratorId?: string, permissionOverrides?: object }} user
 *   Objeto user resolvido pelo AuthContext (resolveSaasUserFromSession).
 */
export function ensureSaasUserInLocalDb(user) {
  if (!user || user.authMode !== 'saas' || !user.id || !user.tenantId) return;

  const authUserId = user.id;
  const tenantId = user.tenantId;
  const email = (user.email || '').trim().toLowerCase();
  const db = loadDb();
  const rhCollab = findRhCollaborator(db, email, tenantId);
  const serverCollaboratorId = String(user.collaboratorId || '').trim();
  const resolvedCollabId = rhCollab?.id
    || serverCollaboratorId
    || buildSyntheticCollaboratorId(authUserId);

  const fullName = (() => {
    const fromRh = String(rhCollab?.nomeCompleto || rhCollab?.apelido || '').trim();
    if (fromRh && !looksLikeEmail(fromRh)) return fromRh;
    const fromUser = String(user.name || '').trim();
    if (fromUser && !looksLikeEmail(fromUser)) return fromUser;
    return email.split('@')[0] || 'Usuário';
  })();

  const isMaster = user.isMaster || isMasterMembershipRole(user.role) || isMasterMembershipRole(user.saasAppRole);
  const appRole = isMaster ? 'admin' : (user.role || 'atendimento');
  const membershipRole = isMaster ? ROLE_MASTER : appRole;
  const hasSystemAccess = user.has_system_access !== false;
  const permissionOverrides = user.permissionOverrides && typeof user.permissionOverrides === 'object'
    ? user.permissionOverrides
    : {};
  const existingDbUser = (loadDb().users || []).find((u) => u.id === authUserId);
  const preserveCustomFromDb = existingDbUser?.has_custom_permissions === true
    && existingDbUser?.custom_permissions
    && typeof existingDbUser.custom_permissions === 'object'
    && Object.keys(permissionOverrides).length === 0
    && !user.has_custom_permissions;
  const effectiveOverrides = preserveCustomFromDb
    ? (existingDbUser.permissionOverrides || {})
    : permissionOverrides;
  const effectiveHasCustom = preserveCustomFromDb
    ? true
    : (user.has_custom_permissions === true || existingDbUser?.has_custom_permissions === true);
  const effectiveCustomPermissions = preserveCustomFromDb
    ? existingDbUser.custom_permissions
    : (user.custom_permissions || existingDbUser?.custom_permissions || null);

  const now = new Date().toISOString();

  const existingUser = (db.users || []).find((u) => u.id === authUserId);
  const existingProfile = (db.users_profile || []).find((p) => p.id === authUserId);
  const existingMembership = (db.memberships || []).find(
    (m) => m.tenant_id === tenantId && m.user_id === authUserId,
  );
  const existingAccess = (db.collaboratorAccess || []).find((a) => a.userId === authUserId);
  const existingCollab = (db.collaborators || []).find((c) => c.id === resolvedCollabId);

  const overridesJson = JSON.stringify(effectiveOverrides);
  const prevOverridesJson = JSON.stringify(existingUser?.permissionOverrides || {});

  const needsAnyChange =
    !existingUser
    || !existingProfile
    || !existingMembership
    || !existingCollab
    || !existingAccess
    || existingUser.name !== fullName
    || existingUser.email !== email
    || existingUser.role !== appRole
    || existingUser.has_system_access !== hasSystemAccess
    || existingMembership.role !== membershipRole
    || existingAccess?.collaboratorId !== resolvedCollabId
    || overridesJson !== prevOverridesJson;

  if (!needsAnyChange) return;

  const rhStub = roleToMinimalRhProfile(appRole);

  withDb((d) => {
    d.users = d.users || [];
    d.users_profile = d.users_profile || [];
    d.memberships = d.memberships || [];
    d.collaborators = d.collaborators || [];
    d.collaboratorAccess = d.collaboratorAccess || [];

    const uIdx = d.users.findIndex((u) => u.id === authUserId);
    const userRecord = {
      id: authUserId,
      name: fullName,
      email,
      role: appRole,
      active: true,
      has_system_access: hasSystemAccess,
      permissionOverrides: effectiveOverrides,
      has_custom_permissions: effectiveHasCustom,
      custom_permissions: effectiveHasCustom ? effectiveCustomPermissions : undefined,
    };
    if (uIdx >= 0) {
      d.users[uIdx] = { ...d.users[uIdx], ...userRecord };
    } else {
      d.users.push(userRecord);
    }
    if (!preserveCustomFromDb) {
      syncPermissionOverrides(d, authUserId, effectiveOverrides);
    }

    const pIdx = d.users_profile.findIndex((p) => p.id === authUserId);
    const profileRecord = {
      id: authUserId,
      full_name: fullName,
      email,
      phone: '',
      tenant_id: tenantId,
      created_at: now,
      updated_at: now,
    };
    if (pIdx >= 0) {
      d.users_profile[pIdx] = {
        ...d.users_profile[pIdx],
        full_name: fullName,
        email,
        tenant_id: tenantId,
        updated_at: now,
      };
    } else {
      d.users_profile.push(profileRecord);
    }

    const mIdx = d.memberships.findIndex(
      (m) => m.tenant_id === tenantId && m.user_id === authUserId,
    );
    const membershipRecord = {
      id: `memb-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      user_id: authUserId,
      role: membershipRole,
      has_system_access: hasSystemAccess,
      status: 'active',
      created_at: now,
      updated_at: now,
    };
    if (mIdx >= 0) {
      d.memberships[mIdx] = {
        ...d.memberships[mIdx],
        role: membershipRole,
        has_system_access: hasSystemAccess,
        status: 'active',
        updated_at: now,
      };
    } else {
      d.memberships.push(membershipRecord);
    }

    const cIdx = d.collaborators.findIndex(
      (c) => c.id === resolvedCollabId || ((c.email || '').toLowerCase() === email && email),
    );
    const collaboratorRecord = {
      id: resolvedCollabId,
      tenant_id: tenantId,
      status: 'ativo',
      apelido: fullName.split(' ')[0] || fullName,
      nomeCompleto: fullName,
      nomeSocial: '',
      sexo: '',
      dataNascimento: '',
      fotoUrl: '',
      email,
      especialidades: [],
      registroProfissional: '',
      conselhoNome: '',
      conselhoUf: '',
      rhFuncaoDescricao: '',
      createdAt: now,
      updatedAt: now,
      ...rhStub,
    };
    if (cIdx >= 0) {
      const prev = d.collaborators[cIdx];
      d.collaborators[cIdx] = {
        ...collaboratorRecord,
        ...prev,
        id: prev.id || resolvedCollabId,
        tenant_id: tenantId,
        nomeCompleto: prev.nomeCompleto || fullName,
        apelido: prev.apelido || collaboratorRecord.apelido,
        email,
        status: 'ativo',
        rhCategoria: prev.rhCategoria || rhStub.rhCategoria,
        cargo: prev.cargo || rhStub.cargo,
        tipoVinculo: prev.tipoVinculo || rhStub.tipoVinculo,
        setor: prev.setor || rhStub.setor,
        updatedAt: now,
      };
    } else {
      d.collaborators.push(collaboratorRecord);
    }

    d.collaboratorAccess = d.collaboratorAccess.filter(
      (a) => a.userId !== authUserId || a.collaboratorId === resolvedCollabId,
    );
    const aIdx = d.collaboratorAccess.findIndex((a) => a.userId === authUserId);
    const accessRecord = {
      collaboratorId: resolvedCollabId,
      userId: authUserId,
      tenant_id: tenantId,
      role: appRole,
      permissions: [],
      lastLoginAt: now,
    };
    if (aIdx >= 0) {
      d.collaboratorAccess[aIdx] = {
        ...d.collaboratorAccess[aIdx],
        ...accessRecord,
      };
    } else {
      d.collaboratorAccess.push(accessRecord);
    }

    const syntheticId = buildSyntheticCollaboratorId(authUserId);
    if (resolvedCollabId !== syntheticId) {
      d.collaborators = d.collaborators.filter((c) => c.id !== syntheticId);
      d.collaboratorAccess = d.collaboratorAccess.filter((a) => a.collaboratorId !== syntheticId);
    }

    return d;
  });
}
