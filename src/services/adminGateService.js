/**
 * Porteiro de acesso administrativo: PIN + token em cookie.
 * PIN único do sistema (não por usuário). Rate limit: 5 tentativas, bloqueio 15 min.
 * Token em cookie (10 min) para persistência e possível validação server-side.
 */
import { loadDb, withDb } from '../db/index.js';
import { logAction } from './logService.js';

const ADMIN_GATE_KEY = 'appgestaoodonto.adminGate';
const ADMIN_GATE_COOKIE = 'admin_gate';
const RATE_LIMIT_KEY = 'appgestaoodonto.adminGate.rateLimit';
const MAX_ATTEMPTS = 5;
const BLOCK_MINUTES = 15;
const TOKEN_EXPIRY_MINUTES = 10;

async function hashPin(pin) {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin) {
  const pinStr = (pin || '').trim();
  if (pinStr.length !== 6) return { ok: false, error: 'PIN deve ter 6 dígitos.' };

  const rate = getRateLimit();
  if (rate.blockedUntil && new Date(rate.blockedUntil) > new Date()) {
    return { ok: false, error: `Acesso bloqueado. Tente novamente em ${Math.ceil((new Date(rate.blockedUntil) - new Date()) / 60000)} minutos.` };
  }

  const db = loadDb();
  const rec = (db.adminSecurity || [])[0];
  if (!rec?.pinHash) {
    return { ok: false, needsSetup: true };
  }

  const bcrypt = await import('bcryptjs');
  const valid = await bcrypt.compare(pinStr, rec.pinHash);
  if (valid) {
    incrementRateLimit(true);
    logAction('ADMIN_PIN_VERIFY', { success: true });
    const { token, expiresAt } = createGateToken();
    saveGateTokenToStorage(token, expiresAt);
    return { ok: true, adminGateToken: token, expiresAt };
  }

  incrementRateLimit(false);
  logAction('ADMIN_PIN_VERIFY', { success: false });
  return { ok: false, error: 'PIN inválido.' };
}

export async function setPin(pin, confirmPin) {
  const pinStr = (pin || '').trim();
  const confirmStr = (confirmPin || '').trim();
  if (pinStr.length !== 6) throw new Error('PIN deve ter 6 dígitos.');
  if (pinStr !== confirmStr) throw new Error('PIN e confirmação não conferem.');

  const db = loadDb();
  const pinHash = await hashPin(pinStr);
  const now = new Date().toISOString();
  const rec = { id: 'admin-gate-1', pinHash, updatedAt: now };

  withDb((d) => {
    d.adminSecurity = d.adminSecurity || [];
    const idx = d.adminSecurity.findIndex((r) => r.id === rec.id);
    if (idx >= 0) d.adminSecurity[idx] = rec;
    else d.adminSecurity.push(rec);
    return d;
  });
}

export function hasPinConfigured() {
  // #region agent log
  try {
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53053a'},body:JSON.stringify({sessionId:'53053a',location:'adminGateService:hasPinConfigured:entry',message:'hasPinConfigured called',data:{},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  } catch (_) {}
  // #endregion
  const db = loadDb();
  const rec = (db.adminSecurity || [])[0];
  const result = !!(rec?.pinHash);
  // #region agent log
  try {
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53053a'},body:JSON.stringify({sessionId:'53053a',location:'adminGateService:hasPinConfigured:exit',message:'hasPinConfigured result',data:{result,hasAdminSecurity:Array.isArray(db.adminSecurity)},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  } catch (_) {}
  // #endregion
  return result;
}

function createGateToken() {
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + TOKEN_EXPIRY_MINUTES);
  return { token, expiresAt: expiresAt.toISOString() };
}

/** Salva token em cookie (10 min) e sessionStorage (fallback legado). */
function saveGateTokenToStorage(token, expiresAt) {
  try {
    const expires = new Date(expiresAt);
    const maxAge = Math.max(0, Math.floor((expires - new Date()) / 1000));
    const cookieValue = encodeURIComponent(JSON.stringify({ token, expiresAt }));
    const secure = typeof window !== 'undefined' && window.location?.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${ADMIN_GATE_COOKIE}=${cookieValue}; max-age=${maxAge}; path=/; SameSite=Lax${secure}`;
    sessionStorage.setItem(ADMIN_GATE_KEY, JSON.stringify({ token, expiresAt }));
  } catch (_) {}
}

/** Obtém token válido do cookie (prioridade) ou sessionStorage (fallback). */
export function getGateTokenFromStorage() {
  try {
    if (typeof document === 'undefined') return null;
    const cookieMatch = document.cookie.match(new RegExp(`(?:^|;\\s*)${ADMIN_GATE_COOKIE}=([^;]*)`));
    let raw = null;
    if (cookieMatch) {
      try {
        raw = decodeURIComponent(cookieMatch[1]);
      } catch (_) {}
    }
    if (!raw) raw = sessionStorage.getItem(ADMIN_GATE_KEY);
    if (!raw) return null;
    const { token, expiresAt } = JSON.parse(raw);
    if (new Date(expiresAt) <= new Date()) {
      clearGateToken();
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function clearGateToken() {
  try {
    if (typeof document !== 'undefined') {
      document.cookie = `${ADMIN_GATE_COOKIE}=; max-age=0; path=/`;
    }
    sessionStorage.removeItem(ADMIN_GATE_KEY);
  } catch (_) {}
}

export function isGateTokenValid() {
  return !!getGateTokenFromStorage();
}

function getRateLimit() {
  try {
    const raw = sessionStorage.getItem(RATE_LIMIT_KEY);
    return raw ? JSON.parse(raw) : { attempts: 0, blockedUntil: null };
  } catch {
    return { attempts: 0, blockedUntil: null };
  }
}

function incrementRateLimit(success) {
  if (success) {
    try {
      sessionStorage.removeItem(RATE_LIMIT_KEY);
    } catch (_) {}
    return;
  }
  const rate = getRateLimit();
  rate.attempts = (rate.attempts || 0) + 1;
  if (rate.attempts >= MAX_ATTEMPTS) {
    const blockedUntil = new Date();
    blockedUntil.setMinutes(blockedUntil.getMinutes() + BLOCK_MINUTES);
    rate.blockedUntil = blockedUntil.toISOString();
    rate.attempts = 0;
  }
  try {
    sessionStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(rate));
  } catch (_) {}
}
