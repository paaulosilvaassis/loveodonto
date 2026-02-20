import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';
import {
  ROLE_MASTER,
  INVITABLE_ROLES,
  INVITATION_EXPIRY_DAYS,
  ACCESS_AUDIT_EVENTS,
} from '../constants/tenantRoles.js';
import { requireMaster, createMembership } from './membershipService.js';
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

function generateToken() {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

export function createInvitation(actor, tenantId, { email, role, has_system_access = true }) {
  requireMaster(actor, tenantId);
  const emailNorm = (email || '').trim().toLowerCase();
  if (!emailNorm) throw new Error('E-mail é obrigatório.');
  if (!INVITABLE_ROLES.includes(role)) {
    throw new Error('Perfil inválido para convite.');
  }

  const db = loadDb();
  const existingMembership = (db.memberships || []).find(
    (m) => m.tenant_id === tenantId && m.status === 'active'
  );
  const profileWithEmail = (db.users_profile || []).find(
    (p) => (p.email || '').toLowerCase() === emailNorm
  );
  const userWithEmail = (db.users || []).find(
    (u) => (u.email || '').toLowerCase() === emailNorm
  );
  const userId = profileWithEmail?.id || userWithEmail?.id;
  if (userId) {
    const alreadyMember = (db.memberships || []).find(
      (m) => m.tenant_id === tenantId && m.user_id === userId && m.status === 'active'
    );
    if (alreadyMember) throw new Error('Este e-mail já está vinculado à clínica.');
  }

  const pendingSameEmail = (db.invitations || []).find(
    (i) => i.tenant_id === tenantId && (i.email || '').toLowerCase() === emailNorm && !i.accepted_at
  );
  if (pendingSameEmail && pendingSameEmail.expires_at > new Date().toISOString()) {
    throw new Error('Já existe um convite pendente para este e-mail.');
  }

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

  return withDb((db) => {
    const token = generateToken();
    const inv = {
      id: createId('inv'),
      tenant_id: tenantId,
      email: emailNorm,
      role,
      has_system_access,
      token,
      expires_at: expiresAt.toISOString(),
      accepted_at: null,
      created_by_user_id: actor.id,
      created_at: now.toISOString(),
    };
    db.invitations = db.invitations || [];
    db.invitations.push(inv);
    logAccessAudit(db, tenantId, actor.id, null, ACCESS_AUDIT_EVENTS.INVITE_CREATED, null, inv);
    logAction('invitation:create', { actorId: actor.id, tenantId, email: emailNorm, role });
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return { ...inv, invite_url: `${origin}/convite?token=${token}` };
  });
}

export function getInvitationByToken(token) {
  const db = loadDb();
  const t = (token || '').trim();
  if (!t) return null;
  const inv = (db.invitations || []).find(
    (i) => i.token === t && !i.accepted_at && i.expires_at > new Date().toISOString()
  );
  return inv ? { ...inv } : null;
}

export function listInvitations(tenantId, onlyPending = true) {
  const db = loadDb();
  let list = (db.invitations || []).filter((i) => i.tenant_id === tenantId);
  if (onlyPending) {
    const now = new Date().toISOString();
    list = list.filter((i) => !i.accepted_at && i.expires_at > now);
  }
  return list.map((i) => ({
    ...i,
    invite_url: `${typeof window !== 'undefined' ? window.location.origin : ''}/convite?token=${i.token}`,
  }));
}

/**
 * Aceita convite: cria/atualiza user e membership, marca invitation.accepted_at.
 * Se userId for passado (usuário já logado), vincula esse user. Senão, payload deve ter email/name para criar user.
 */
export function acceptInvitation(token, { userId, email, name, password } = {}) {
  const db = loadDb();
  const inv = getInvitationByToken(token);
  if (!inv) throw new Error('Convite inválido ou expirado.');

  const tenantId = inv.tenant_id;
  let targetUserId = userId;

  if (!targetUserId) {
    const emailNorm = (email || inv.email || '').trim().toLowerCase();
    if (!emailNorm) throw new Error('E-mail é obrigatório.');
    const existing = (db.users || []).find((u) => (u.email || '').toLowerCase() === emailNorm);
    if (existing) {
      targetUserId = existing.id;
    } else {
      targetUserId = createId('user');
      const now = new Date().toISOString();
      withDb((d) => {
        d.users = d.users || [];
        d.users.push({
          id: targetUserId,
          name: (name || emailNorm).trim() || 'Usuário',
          email: emailNorm,
          active: true,
          has_system_access: inv.has_system_access !== false,
          role: inv.role,
        });
        d.users_profile = d.users_profile || [];
        d.users_profile.push({
          id: targetUserId,
          full_name: (name || emailNorm).trim() || 'Usuário',
          email: emailNorm,
          phone: '',
          created_at: now,
          updated_at: now,
        });
        return d;
      });
    }
  }

  createMembership(tenantId, targetUserId, {
    role: inv.role,
    has_system_access: inv.has_system_access !== false,
  });

  withDb((d) => {
    const idx = (d.invitations || []).findIndex((i) => i.id === inv.id);
    if (idx >= 0) {
      d.invitations[idx].accepted_at = new Date().toISOString();
    }
    d.accessAuditLogs = d.accessAuditLogs || [];
    d.accessAuditLogs.push({
      id: createId('audit'),
      tenant_id: tenantId,
      actor_user_id: targetUserId,
      target_user_id: targetUserId,
      event_type: ACCESS_AUDIT_EVENTS.INVITE_ACCEPTED,
      before_json: inv,
      after_json: { accepted_at: d.invitations[idx]?.accepted_at },
      created_at: new Date().toISOString(),
    });
    return d;
  });

  logAction('invitation:accept', { userId: targetUserId, tenantId, invitationId: inv.id });
  return { userId: targetUserId, tenantId };
}
