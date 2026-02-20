/**
 * Serviço de credenciais (user_auth): email + senha hasheada.
 * Nunca retorna senha. Apenas ADMIN pode alterar.
 */
import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';
import { createMembership } from './membershipService.js';
import { getDefaultTenant } from './tenantService.js';
import { canManageAccess } from './accessService.js';
// #region agent log
try { fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53053a'},body:JSON.stringify({sessionId:'53053a',location:'userAuthService.js:load',message:'userAuthService loaded',data:{hasCanManage:typeof canManageAccess},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{}); } catch (e) {}
// #endregion
const SALT_ROUNDS = 10;

/**
 * @param {string} plainPassword
 * @returns {Promise<string>} hash bcrypt
 */
async function hashPassword(plainPassword) {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/**
 * @param {string} plainPassword
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plainPassword, hash) {
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(plainPassword, hash);
}

/**
 * Retorna user_auth por collaboratorId (sem expor passwordHash).
 */
export function getUserAuthByCollaborator(collaboratorId) {
  const db = loadDb();
  const row = (db.userAuth || []).find((r) => r.collaboratorId === collaboratorId);
  if (!row) return null;
  return {
    id: row.id,
    collaboratorId: row.collaboratorId,
    email: row.email,
    mustChangePassword: row.mustChangePassword !== false,
    isActive: row.isActive !== false,
    lastLoginAt: row.lastLoginAt || null,
    createdAt: row.createdAt,
  };
}

/**
 * Salva ou atualiza user_auth. Apenas ADMIN.
 * @param {object} actor - usuário logado
 * @param {string} collaboratorId
 * @param {{ email: string; password: string; mustChangePassword: boolean }} payload
 * @param {boolean} isNewPassword - true se password foi preenchida (senão mantém hash existente)
 * @param {string} [passwordHash] - hash já calculado (para uso em transação)
 */
export async function saveUserAuth(actor, collaboratorId, payload, isNewPassword = true, passwordHash = null) {
  if (!canManageAccess(actor)) {
    throw new Error('Apenas Administrador pode alterar credenciais.');
  }
  const email = (payload.email || '').trim().toLowerCase();
  if (!email) throw new Error('E-mail é obrigatório.');

  const db = loadDb();
  const existing = (db.userAuth || []).find((r) => r.collaboratorId === collaboratorId);
  const otherWithEmail = (db.userAuth || []).find(
    (r) => r.collaboratorId !== collaboratorId && (r.email || '').toLowerCase() === email
  );
  if (otherWithEmail) throw new Error('Este e-mail já está em uso por outro colaborador.');

  let hash = passwordHash;
  if (!hash) {
    if (isNewPassword && payload.password) {
      hash = await hashPassword(payload.password);
    } else if (isNewPassword && !existing) {
      throw new Error('Senha é obrigatória ao criar credenciais.');
    } else {
      hash = existing?.passwordHash;
    }
  }

  const now = new Date().toISOString();

  withDb((d) => {
    d.userAuth = d.userAuth || [];
    const idx = d.userAuth.findIndex((r) => r.collaboratorId === collaboratorId);
    const row = {
      id: existing?.id || createId('uauth'),
      collaboratorId,
      email,
      passwordHash: hash || existing?.passwordHash,
      mustChangePassword: payload.mustChangePassword !== false,
      isActive: true,
      lastLoginAt: existing?.lastLoginAt || null,
      createdAt: existing?.createdAt || now,
    };
    if (idx >= 0) {
      d.userAuth[idx] = row;
    } else {
      d.userAuth.push(row);
    }
    return d;
  });
}

/**
 * Autentica por e-mail e senha. Retorna { userId, tenantId } ou null.
 * Verifica isActive e atualiza lastLoginAt.
 */
export async function authenticateByEmailPassword(email, password) {
  const emailNorm = (email || '').trim().toLowerCase();
  if (!emailNorm || !password) return null;

  const db = loadDb();
  const row = (db.userAuth || []).find(
    (r) => (r.email || '').toLowerCase() === emailNorm && r.isActive !== false
  );
  if (!row || !row.passwordHash) return null;

  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) return null;

  const access = (db.collaboratorAccess || []).find((a) => a.collaboratorId === row.collaboratorId);
  if (!access?.userId) return null;

  const tenant = getDefaultTenant();
  if (!tenant) return null;

  const membership = (db.memberships || []).find(
    (m) => m.tenant_id === tenant.id && m.user_id === access.userId && m.status === 'active'
  );
  if (!membership || membership.has_system_access === false) return null;

  const now = new Date().toISOString();
  withDb((d) => {
    const idx = (d.userAuth || []).findIndex((r) => r.id === row.id);
    if (idx >= 0 && d.userAuth[idx]) {
      d.userAuth[idx] = { ...d.userAuth[idx], lastLoginAt: now };
    }
    return d;
  });

  return { userId: access.userId, tenantId: tenant.id };
}

/**
 * Cria usuário (se necessário) e vincula ao colaborador.
 * Retorna userId.
 */
export function ensureUserAndLinkForCollaborator(actor, collaboratorId, email, role, hasSystemAccess) {
  if (!canManageAccess(actor)) {
    throw new Error('Apenas Administrador pode criar vínculo de usuário.');
  }
  const emailNorm = (email || '').trim().toLowerCase();
  if (!emailNorm) throw new Error('E-mail é obrigatório.');

  const tenant = getDefaultTenant();
  if (!tenant) throw new Error('Nenhuma clínica configurada.');

  const db = loadDb();
  const existing = (db.users || []).find((u) => (u.email || '').toLowerCase() === emailNorm);
  if (existing) {
    const access = db.collaboratorAccess || [];
    const idx = access.findIndex((a) => a.collaboratorId === collaboratorId);
    withDb((d) => {
      d.collaboratorAccess = d.collaboratorAccess || [];
      d.collaboratorAccess = d.collaboratorAccess.filter((a) => a.collaboratorId !== collaboratorId);
      d.collaboratorAccess.push({
        collaboratorId,
        userId: existing.id,
        role: role || 'atendimento',
        permissions: [],
        lastLoginAt: '',
      });
      return d;
    });
    createMembership(tenant.id, existing.id, { role: role || 'atendimento', has_system_access: hasSystemAccess });
    return existing.id;
  }

  const userId = createId('user');
  const now = new Date().toISOString();
  withDb((d) => {
    d.users = d.users || [];
    d.users.push({
      id: userId,
      name: (emailNorm.split('@')[0] || 'Usuário').trim(),
      email: emailNorm,
      active: true,
      has_system_access: hasSystemAccess !== false,
      role: role || 'atendimento',
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
    d.collaboratorAccess = d.collaboratorAccess || [];
    d.collaboratorAccess = d.collaboratorAccess.filter((a) => a.collaboratorId !== collaboratorId);
    d.collaboratorAccess.push({
      collaboratorId,
      userId,
      role: role || 'atendimento',
      permissions: [],
      lastLoginAt: '',
    });
    return d;
  });
  createMembership(tenant.id, userId, { role: role || 'atendimento', has_system_access: hasSystemAccess });
  return userId;
}
