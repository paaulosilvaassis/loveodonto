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

const COLLABORATOR_PREFIX = 'col-saas-';

function buildCollaboratorId(authUserId) {
  return `${COLLABORATOR_PREFIX}${authUserId}`;
}

/**
 * @param {{ id: string, name: string, email: string, role: string, tenantId: string, authMode: string }} user
 *   Objeto user resolvido pelo AuthContext (resolveSaasUserFromSession).
 */
export function ensureSaasUserInLocalDb(user) {
  if (!user || user.authMode !== 'saas' || !user.id || !user.tenantId) return;

  const db = loadDb();
  const authUserId = user.id;
  const tenantId = user.tenantId;
  const email = (user.email || '').trim().toLowerCase();
  const fullName = user.name || email.split('@')[0] || 'Usuário';
  const isMaster = user.isMaster || isMasterMembershipRole(user.role) || isMasterMembershipRole(user.saasAppRole);
  const membershipRole = isMaster ? ROLE_MASTER : (user.role || 'atendimento');
  const now = new Date().toISOString();

  const existingUser = (db.users || []).find((u) => u.id === authUserId);
  const existingProfile = (db.users_profile || []).find((p) => p.id === authUserId);
  const existingMembership = (db.memberships || []).find(
    (m) => m.tenant_id === tenantId && m.user_id === authUserId,
  );

  const collabId = buildCollaboratorId(authUserId);
  const existingCollab = (db.collaborators || []).find(
    (c) => c.id === collabId || ((c.email || '').toLowerCase() === email && email),
  );
  const existingAccess = (db.collaboratorAccess || []).find(
    (a) => a.userId === authUserId,
  );

  const needsAnyChange =
    !existingUser
    || !existingProfile
    || !existingMembership
    || !existingCollab
    || !existingAccess
    || existingUser.name !== fullName
    || existingUser.email !== email
    || existingMembership.role !== membershipRole;

  if (!needsAnyChange) return;

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
      role: isMaster ? 'admin' : (user.role || 'atendimento'),
      active: true,
      has_system_access: true,
    };
    if (uIdx >= 0) {
      d.users[uIdx] = { ...d.users[uIdx], ...userRecord };
    } else {
      d.users.push(userRecord);
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
      has_system_access: true,
      status: 'active',
      created_at: now,
      updated_at: now,
    };
    if (mIdx >= 0) {
      d.memberships[mIdx] = {
        ...d.memberships[mIdx],
        role: membershipRole,
        has_system_access: true,
        status: 'active',
        updated_at: now,
      };
    } else {
      d.memberships.push(membershipRecord);
    }

    const cIdx = d.collaborators.findIndex(
      (c) => c.id === collabId || ((c.email || '').toLowerCase() === email && email),
    );
    const collaboratorRecord = {
      id: collabId,
      status: 'ativo',
      apelido: fullName.split(' ')[0] || fullName,
      nomeCompleto: fullName,
      nomeSocial: '',
      sexo: '',
      dataNascimento: '',
      fotoUrl: '',
      rhCategoria: 'Diretoria e Gestão',
      cargo: 'Gestor Geral',
      rhFuncaoDescricao: '',
      conselhoNome: '',
      conselhoUf: '',
      tipoVinculo: '',
      setor: 'Gestão',
      especialidades: [],
      registroProfissional: '',
      email,
      createdAt: now,
      updatedAt: now,
    };
    if (cIdx >= 0) {
      d.collaborators[cIdx] = {
        ...d.collaborators[cIdx],
        id: collabId,
        nomeCompleto: fullName,
        apelido: fullName.split(' ')[0] || fullName,
        email,
        status: 'ativo',
        updatedAt: now,
      };
    } else {
      d.collaborators.push(collaboratorRecord);
    }

    const aIdx = d.collaboratorAccess.findIndex((a) => a.userId === authUserId);
    const accessRecord = {
      collaboratorId: collabId,
      userId: authUserId,
      role: isMaster ? 'admin' : (user.role || 'atendimento'),
      permissions: [],
      lastLoginAt: now,
    };
    if (aIdx >= 0) {
      d.collaboratorAccess[aIdx] = {
        ...d.collaboratorAccess[aIdx],
        collaboratorId: collabId,
        role: accessRecord.role,
        lastLoginAt: now,
      };
    } else {
      d.collaboratorAccess.push(accessRecord);
    }

    return d;
  });
}
