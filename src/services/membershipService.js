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

export function countActiveMasters(tenantId) {
  const db = loadDb();
  return (db.memberships || []).filter(
    (m) => m.tenant_id === tenantId && m.status === 'active' && m.role === ROLE_MASTER
  ).length;
}

/**
 * Garante que não se desmonte o único MASTER (perfil, acesso ou remoção).
 */
function assertSoleMasterProtected(db, tenantId, userId, { nextRole, disableAccess, remove } = {}) {
  const m = (db.memberships || []).find(
    (x) => x.tenant_id === tenantId && x.user_id === userId && x.status === 'active'
  );
  if (!m || m.role !== ROLE_MASTER) return;
  const masterCount = (db.memberships || []).filter(
    (x) => x.tenant_id === tenantId && x.status === 'active' && x.role === ROLE_MASTER
  ).length;
  if (masterCount > 1) return;
  if (remove || disableAccess === true) {
    throw new Error('Não é possível desativar ou remover o único administrador MASTER da clínica.');
  }
  if (nextRole !== undefined && nextRole !== ROLE_MASTER) {
    throw new Error(
      'Não é possível alterar o perfil do único administrador MASTER. Promova outro usuário a MASTER antes.'
    );
  }
}

export function listMembers(tenantId) {
  const db = loadDb();
  const memberships = (db.memberships || []).filter((m) => m.tenant_id === tenantId && m.status === 'active');
  const users = db.users || [];
  const profiles = db.users_profile || [];
  const tenants = db.tenants || [];
  const tenantName = tenants.find((t) => t.id === tenantId)?.name || 'Clínica';
  return memberships.map((m) => {
    const u = users.find((x) => x.id === m.user_id);
    const p = profiles.find((x) => x.id === m.user_id);
    const access = (db.collaboratorAccess || []).find((a) => a.userId === m.user_id);
    const collab = access
      ? (db.collaborators || []).find((c) => c.id === access.collaboratorId)
      : null;
    const emailRaw = (p?.email || u?.email || '').trim();
    const nameRaw = (p?.full_name || u?.name || '').trim();
    return {
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      has_system_access: m.has_system_access !== false,
      user_active: u?.active !== false,
      status: m.status,
      created_at: m.created_at,
      updated_at: m.updated_at,
      name: nameRaw || '—',
      email: emailRaw || '—',
      phone: (p?.phone || u?.phone || '').trim() || '',
      internal_notes: (p?.internal_notes || '').trim() || '',
      collaborator_id: access?.collaboratorId || null,
      cargo: (collab?.cargo || '').trim() || '—',
      tenant_name: tenantName,
    };
  });
}

/**
 * Atualiza dados cadastrais (users + users_profile) de um membro do tenant.
 */
export function updateMemberProfile(actor, tenantId, userId, payload) {
  requireMaster(actor, tenantId);
  const fullName = (payload.full_name || '').trim();
  const emailNorm = (payload.email || '').trim().toLowerCase();
  const phone = (payload.phone || '').trim();
  const internalNotes =
    payload.internal_notes !== undefined ? String(payload.internal_notes || '').trim() : undefined;

  if (!fullName) throw new Error('Nome completo é obrigatório.');
  if (!emailNorm) throw new Error('E-mail é obrigatório.');

  return withDb((db) => {
    const memb = (db.memberships || []).find(
      (m) => m.tenant_id === tenantId && m.user_id === userId && m.status === 'active'
    );
    if (!memb) throw new Error('Usuário não encontrado nesta clínica.');

    const emailTaken = (db.users || []).some(
      (x) => x.id !== userId && (x.email || '').toLowerCase() === emailNorm
    );
    const profileTaken = (db.users_profile || []).some(
      (x) => x.id !== userId && (x.email || '').toLowerCase() === emailNorm
    );
    if (emailTaken || profileTaken) {
      throw new Error('Este e-mail já está em uso por outro usuário.');
    }

    const now = new Date().toISOString();
    memb.updated_at = now;
    const uIdx = (db.users || []).findIndex((x) => x.id === userId);
    if (uIdx >= 0) {
      db.users[uIdx].name = fullName;
      db.users[uIdx].email = emailNorm;
      if (phone !== undefined) db.users[uIdx].phone = phone;
    }

    db.users_profile = db.users_profile || [];
    let pIdx = db.users_profile.findIndex((x) => x.id === userId);
    if (pIdx < 0) {
      db.users_profile.push({
        id: userId,
        full_name: fullName,
        email: emailNorm,
        phone: phone || '',
        tenant_id: tenantId,
        internal_notes: internalNotes !== undefined ? internalNotes : '',
        created_at: now,
        updated_at: now,
      });
    } else {
      db.users_profile[pIdx].full_name = fullName;
      db.users_profile[pIdx].email = emailNorm;
      if (phone !== undefined) db.users_profile[pIdx].phone = phone;
      if (!String(db.users_profile[pIdx].tenant_id || '').trim()) db.users_profile[pIdx].tenant_id = tenantId;
      if (internalNotes !== undefined) db.users_profile[pIdx].internal_notes = internalNotes;
      db.users_profile[pIdx].updated_at = now;
    }

    logAccessAudit(db, tenantId, actor.id, userId, ACCESS_AUDIT_EVENTS.PROFILE_UPDATED, null, {
      full_name: fullName,
      email: emailNorm,
    });
    logAction('membership:update-profile', { actorId: actor.id, tenantId, userId });
    return { userId, full_name: fullName, email: emailNorm, phone, internal_notes: internalNotes };
  });
}

export function updateMemberRole(actor, tenantId, userId, role) {
  requireMaster(actor, tenantId);
  if (userId === actor.id && role !== ROLE_MASTER) {
    throw new Error('Você não pode remover seu próprio perfil de administrador.');
  }
  if (!MEMBERSHIP_ROLES.includes(role)) throw new Error('Perfil inválido.');
  const dbPreview = loadDb();
  assertSoleMasterProtected(dbPreview, tenantId, userId, { nextRole: role });
  if (role === ROLE_MASTER) {
    const existingMaster = (dbPreview.memberships || []).find(
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
    if (uIdx >= 0) db.users[uIdx].role = role === ROLE_MASTER ? 'admin' : role;
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
  if (!hasSystemAccess) {
    assertSoleMasterProtected(loadDb(), tenantId, userId, { disableAccess: true });
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
      if (uIdx >= 0) {
        db.users[uIdx].has_system_access = Boolean(hasSystemAccess);
        if (!hasSystemAccess) db.users[uIdx].active = false;
        else db.users[uIdx].active = true;
      }
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
  assertSoleMasterProtected(loadDb(), tenantId, userId, { remove: true });

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
