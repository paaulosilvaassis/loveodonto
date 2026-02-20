import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';
import { ROLE_MASTER, MEMBERSHIP_ROLES, ACCESS_AUDIT_EVENTS } from '../constants/tenantRoles.js';
import { logAction } from './logService.js';

function logAccessAudit(db, tenantId, actorUserId, targetUserId, eventType, beforeJson, afterJson) {
  db.accessAuditLogs = db.accessAuditLogs || [];
  db.accessAuditLogs.push({
    id: createId('audit'),
    tenant_id: tenantId,
    actor_user_id: actorUserId,
    target_user_id: targetUserId ?? null,
    event_type: eventType,
    before_json: beforeJson,
    after_json: afterJson,
    created_at: new Date().toISOString(),
  });
}

export function requireMaster(actor, tenantId) {
  const db = loadDb();
  const m = (db.memberships || []).find(
    (x) => x.tenant_id === tenantId && x.user_id === actor.id && x.status === 'active'
  );
  if (!m || m.role !== ROLE_MASTER) {
    const err = new Error('Apenas o administrador (MASTER) pode realizar esta ação.');
    err.code = 'FORBIDDEN';
    throw err;
  }
}

export function getMembership(tenantId, userId) {
  const db = loadDb();
  const m = (db.memberships || []).find(
    (x) => x.tenant_id === tenantId && x.user_id === userId && x.status === 'active'
  );
  return m ? { ...m } : null;
}

export function listMembers(tenantId) {
  const db = loadDb();
  const memberships = (db.memberships || []).filter((m) => m.tenant_id === tenantId && m.status === 'active');
  const users = db.users || [];
  const profiles = db.users_profile || [];
  return memberships.map((m) => {
    const u = users.find((x) => x.id === m.user_id);
    const p = profiles.find((x) => x.id === m.user_id);
    return {
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      has_system_access: m.has_system_access !== false,
      status: m.status,
      created_at: m.created_at,
      updated_at: m.updated_at,
      name: (p?.full_name || u?.name || '').trim() || '—',
      email: (p?.email || u?.email || '').trim() || '—',
    };
  });
}

export function updateMemberRole(actor, tenantId, userId, role) {
  requireMaster(actor, tenantId);
  if (userId === actor.id && role !== ROLE_MASTER) {
    throw new Error('Você não pode remover seu próprio perfil de administrador.');
  }
  if (!MEMBERSHIP_ROLES.includes(role)) throw new Error('Perfil inválido.');
  if (role === ROLE_MASTER) {
    const db = loadDb();
    const existingMaster = (db.memberships || []).find(
      (m) => m.tenant_id === tenantId && m.role === ROLE_MASTER && m.status === 'active'
    );
    if (existingMaster && existingMaster.user_id !== userId) {
      throw new Error('Já existe um administrador (MASTER) nesta clínica.');
    }
  }

  return withDb((db) => {
    const idx = (db.memberships || []).findIndex(
      (m) => m.tenant_id === tenantId && m.user_id === userId && m.status === 'active'
    );
    if (idx < 0) throw new Error('Usuário não encontrado neste tenant.');
    const before = { ...db.memberships[idx] };
    db.memberships[idx].role = role;
    db.memberships[idx].updated_at = new Date().toISOString();
    const uIdx = (db.users || []).findIndex((u) => u.id === userId);
    if (uIdx >= 0) db.users[uIdx].role = role;
    logAccessAudit(db, tenantId, actor.id, userId, ACCESS_AUDIT_EVENTS.ROLE_CHANGED, before, db.memberships[idx]);
    logAction('membership:update-role', { actorId: actor.id, tenantId, userId, role });
    return db.memberships[idx];
  });
}

export function setMemberSystemAccess(actor, tenantId, userId, hasSystemAccess) {
  requireMaster(actor, tenantId);
  if (userId === actor.id && !hasSystemAccess) {
    throw new Error('Você não pode desativar seu próprio acesso.');
  }

  return withDb((db) => {
    const idx = (db.memberships || []).findIndex(
      (m) => m.tenant_id === tenantId && m.user_id === userId && m.status === 'active'
    );
    if (idx < 0) throw new Error('Usuário não encontrado neste tenant.');
    const before = { ...db.memberships[idx] };
    db.memberships[idx].has_system_access = Boolean(hasSystemAccess);
    db.memberships[idx].updated_at = new Date().toISOString();
    logAccessAudit(db, tenantId, actor.id, userId, ACCESS_AUDIT_EVENTS.ACCESS_TOGGLED, before, db.memberships[idx]);
    if (db.users) {
      const uIdx = db.users.findIndex((u) => u.id === userId);
      if (uIdx >= 0) db.users[uIdx].has_system_access = Boolean(hasSystemAccess);
    }
    logAction('membership:toggle-access', { actorId: actor.id, tenantId, userId, hasSystemAccess });
    return db.memberships[idx];
  });
}

export function removeMember(actor, tenantId, userId) {
  requireMaster(actor, tenantId);
  if (userId === actor.id) {
    throw new Error('Você não pode remover seu próprio vínculo com a clínica.');
  }

  return withDb((db) => {
    const idx = (db.memberships || []).findIndex((m) => m.tenant_id === tenantId && m.user_id === userId);
    if (idx < 0) throw new Error('Usuário não encontrado neste tenant.');
    const before = { ...db.memberships[idx] };
    db.memberships[idx].status = 'inactive';
    db.memberships[idx].updated_at = new Date().toISOString();
    logAccessAudit(db, tenantId, actor.id, userId, ACCESS_AUDIT_EVENTS.USER_REMOVED, before, db.memberships[idx]);
    logAction('membership:remove', { actorId: actor.id, tenantId, userId });
    return db.memberships[idx];
  });
}

export function createMembership(tenantId, userId, { role, has_system_access = true }) {
  const db = loadDb();
  const exists = (db.memberships || []).find(
    (m) => m.tenant_id === tenantId && m.user_id === userId && m.status === 'active'
  );
  if (exists) return exists;

  return withDb((db) => {
    const now = new Date().toISOString();
    const m = {
      id: createId('memb'),
      tenant_id: tenantId,
      user_id: userId,
      role: role || 'atendimento',
      has_system_access: has_system_access !== false,
      status: 'active',
      created_at: now,
      updated_at: now,
    };
    db.memberships = db.memberships || [];
    db.memberships.push(m);
    if (db.users) {
      const uIdx = db.users.findIndex((u) => u.id === userId);
      if (uIdx >= 0) db.users[uIdx].has_system_access = m.has_system_access;
    }
    return m;
  });
}
