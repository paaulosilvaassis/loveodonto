/**
 * Convites para ativação de acesso (colaborador → user_auth).
 * Token é armazenado como hash. Apenas admin pode criar.
 */
import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';
import { canManageAccess } from './accessService.js';
import { createMembership } from './membershipService.js';
import { getDefaultTenant } from './tenantService.js';
import { INVITABLE_ROLES } from '../constants/tenantRoles.js';
import { logAction } from './logService.js';

const INVITE_EXPIRY_HOURS = 72;

async function hashToken(token) {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(token, 10);
}

export async function verifyTokenHash(plainToken, hash) {
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(plainToken, hash);
}

function generateToken() {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

/**
 * Cria convite de ativação. Apenas admin.
 * Retorna { invite, inviteUrl } - o token em inviteUrl é o raw (nunca salvo).
 */
export async function createUserInvite(actor, { collaboratorId, email, role, mustChangePassword = true }) {
  if (!canManageAccess(actor)) {
    throw new Error('Apenas Administrador pode enviar convites.');
  }
  const emailNorm = (email || '').trim().toLowerCase();
  if (!emailNorm) throw new Error('E-mail é obrigatório.');
  if (!collaboratorId) throw new Error('Colaborador é obrigatório.');
  if (!INVITABLE_ROLES.includes(role)) throw new Error('Perfil inválido.');

  const db = loadDb();
  const collab = db.collaborators?.find((c) => c.id === collaboratorId);
  if (!collab) throw new Error('Colaborador não encontrado.');

  const pending = (db.userInvites || []).find(
    (i) => i.collaboratorId === collaboratorId && !i.usedAt && i.expiresAt > new Date().toISOString()
  );
  if (pending) throw new Error('Já existe um convite pendente para este colaborador.');

  const rawToken = generateToken();
  const tokenHash = await hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setHours(expiresAt.getHours() + INVITE_EXPIRY_HOURS);

  const invite = {
    id: createId('uinv'),
    collaboratorId,
    email: emailNorm,
    tokenHash,
    role: role || 'atendimento',
    mustChangePassword: mustChangePassword !== false,
    expiresAt: expiresAt.toISOString(),
    usedAt: null,
    createdByUserId: actor.id,
    createdAt: now.toISOString(),
  };

  withDb((d) => {
    d.userInvites = d.userInvites || [];
    d.userInvites.push(invite);
    return d;
  });

  logAction('user_invite:create', { actorId: actor.id, collaboratorId, email: emailNorm });
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const inviteUrl = `${origin}/activate?token=${encodeURIComponent(rawToken)}`;
  return { invite: { ...invite, tokenHash: undefined }, inviteUrl };
}

/**
 * Busca convite válido por token (compara hash).
 */
export async function getUserInviteByToken(rawToken) {
  const t = (rawToken || '').trim();
  if (!t) return null;
  const db = loadDb();
  const now = new Date().toISOString();
  const pending = (db.userInvites || []).filter((i) => !i.usedAt && i.expiresAt > now);
  for (const inv of pending) {
    if (inv.tokenHash && (await verifyTokenHash(t, inv.tokenHash))) {
      return { ...inv, tokenHash: undefined };
    }
  }
  return null;
}

/**
 * Ativa conta: valida token+email, cria user+user_auth+membership+collaboratorAccess, marca convite usado.
 * Redireciona para login.
 */
export async function activateUserInvite(rawToken, { email, password }) {
  const emailNorm = (email || '').trim().toLowerCase();
  if (!emailNorm) throw new Error('E-mail é obrigatório.');
  if (!password || password.length < 8) throw new Error('Senha deve ter no mínimo 8 caracteres.');
  const inv = await getUserInviteByToken(rawToken);
  if (!inv) throw new Error('Convite inválido ou expirado.');
  if (inv.email.toLowerCase() !== emailNorm) throw new Error('E-mail não confere com o convite.');
  if (!inv.collaboratorId) throw new Error('Convite inválido: colaborador não vinculado.');

  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.hash(password, 10);
  const tenant = getDefaultTenant();
  if (!tenant) throw new Error('Nenhuma clínica configurada.');

  const db = loadDb();
  let userId = (db.users || []).find((u) => (u.email || '').toLowerCase() === emailNorm)?.id;
  const now = new Date().toISOString();

  if (!userId) {
    userId = createId('user');
    withDb((d) => {
      d.users = d.users || [];
      d.users.push({
        id: userId,
        name: (emailNorm.split('@')[0] || 'Usuário').trim(),
        email: emailNorm,
        active: true,
        has_system_access: true,
        role: inv.role || 'atendimento',
      });
      d.users_profile = d.users_profile || [];
      d.users_profile.push({
        id: userId,
        full_name: (emailNorm.split('@')[0] || 'Usuário').trim(),
        email: emailNorm,
        phone: '',
        created_at: now,
        updated_at: now,
      });
      return d;
    });
  }

  withDb((d) => {
    d.collaboratorAccess = d.collaboratorAccess || [];
    d.collaboratorAccess = d.collaboratorAccess.filter((a) => a.collaboratorId !== inv.collaboratorId);
    d.collaboratorAccess.push({
      collaboratorId: inv.collaboratorId,
      userId,
      role: inv.role || 'atendimento',
      permissions: [],
      lastLoginAt: '',
    });
    return d;
  });

  createMembership(tenant.id, userId, {
    role: inv.role || 'atendimento',
    has_system_access: true,
  });

  withDb((d) => {
    d.userAuth = d.userAuth || [];
    const idx = d.userAuth.findIndex((r) => r.collaboratorId === inv.collaboratorId);
    const row = {
      id: createId('uauth'),
      collaboratorId: inv.collaboratorId,
      email: emailNorm,
      passwordHash,
      mustChangePassword: inv.mustChangePassword !== false,
      isActive: true,
      lastLoginAt: null,
      createdAt: now,
    };
    if (idx >= 0) {
      d.userAuth[idx] = row;
    } else {
      d.userAuth.push(row);
    }
    const invIdx = (d.userInvites || []).findIndex((i) => i.id === inv.id);
    if (invIdx >= 0) {
      d.userInvites[invIdx].usedAt = now;
    }
    return d;
  });

  logAction('user_invite:activate', { userId, collaboratorId: inv.collaboratorId });
  return { userId, tenantId: tenant.id };
}

/**
 * Lista convites (todos ou por colaborador).
 */
export function listUserInvites(options = {}) {
  const db = loadDb();
  let list = [...(db.userInvites || [])];
  if (options.collaboratorId) {
    list = list.filter((i) => i.collaboratorId === options.collaboratorId);
  }
  if (options.onlyPending) {
    const now = new Date().toISOString();
    list = list.filter((i) => !i.usedAt && i.expiresAt > now);
  }
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list.map((i) => ({
    ...i,
    tokenHash: undefined,
    inviteUrl: null,
  }));
}
