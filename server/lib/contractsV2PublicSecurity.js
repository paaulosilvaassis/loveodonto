/**
 * Segurança HTTP pública Contracts V2 — Phase 10.12.
 * Mirror JS (Express) da política tipada em domain/contracts/runtime.
 * Sem wildcard, sem reflexão automática de Origin.
 */

const DEFAULT_LOCAL_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
];

const PUBLIC_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export function parseBool(value) {
  if (value === true || value === 1) return true;
  const s = String(value ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

export function normalizeOrigin(origin) {
  if (origin == null) return null;
  const raw = String(origin).trim();
  if (!raw) return null;
  if (raw === 'null') return 'null';
  try {
    const u = new URL(raw);
    if (u.username || u.password || u.search || u.hash) return null;
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
    if (path) return null;
    const host = u.hostname.toLowerCase();
    const port = u.port ? `:${u.port}` : '';
    return `${u.protocol}//${host}${port}`;
  } catch {
    return null;
  }
}

export function resolvePublicAllowedOrigins(env = process.env) {
  const explicit = String(env.CONTRACTS_V2_PUBLIC_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizeOrigin)
    .filter(Boolean);
  if (explicit.length) return explicit;
  const mode = String(env.CONTRACTS_V2_RUNTIME_MODE || 'disabled').trim().toLowerCase();
  if (mode === 'staging-disabled' || mode === 'production' || mode === 'production-enabled') {
    return [];
  }
  return DEFAULT_LOCAL_ORIGINS.map(normalizeOrigin).filter(Boolean);
}

export function getPublicSigningCorsPolicy(env = process.env) {
  return {
    allowedOrigins: resolvePublicAllowedOrigins(env),
    allowedMethods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Correlation-Id', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'X-Correlation-Id'],
    allowCredentials: false,
    maxAgeSeconds: 600,
  };
}

export function evaluatePublicSigningCors(policy, { origin, method } = {}) {
  const m = String(method || 'GET').toUpperCase();
  const preflight = m === 'OPTIONS';
  if (origin == null || String(origin).trim() === '') {
    return { allowed: true, origin: null, preflight, reason: null };
  }
  const normalized = normalizeOrigin(origin);
  if (normalized === 'null') {
    return { allowed: false, origin: null, preflight, reason: 'null_origin_denied' };
  }
  if (!normalized || normalized.includes('*')) {
    return { allowed: false, origin: null, preflight, reason: 'origin_invalid' };
  }
  if (!policy.allowedOrigins.includes(normalized)) {
    return { allowed: false, origin: null, preflight, reason: 'origin_not_allowlisted' };
  }
  if (!preflight && !policy.allowedMethods.includes(m)) {
    return { allowed: false, origin: null, preflight, reason: 'method_not_allowed' };
  }
  return { allowed: true, origin: normalized, preflight, reason: null };
}

export function applyPublicSigningCorsHeaders(res, policy, decision) {
  if (!decision.allowed || !decision.origin) return;
  res.setHeader('Access-Control-Allow-Origin', decision.origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', policy.allowedMethods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', policy.allowedHeaders.join(', '));
  if (policy.exposedHeaders.length) {
    res.setHeader('Access-Control-Expose-Headers', policy.exposedHeaders.join(', '));
  }
  res.setHeader('Access-Control-Max-Age', String(policy.maxAgeSeconds));
  if (policy.allowCredentials) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

export function applyContractsV2SecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', PUBLIC_CSP);
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
}

export function isValidIp(value) {
  if (!value || typeof value !== 'string') return false;
  const v = value.trim().replace(/^\[|\]$/g, '');
  const ipv4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
  if (v.startsWith('::ffff:')) return ipv4.test(v.slice(7));
  if (ipv4.test(v)) return true;
  return /^(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$|^::1$|^::$/.test(v);
}

export function hashClientIp(ip) {
  let h = 0;
  const raw = `contracts-v2:${ip}`;
  for (let i = 0; i < raw.length; i += 1) h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
  return `iph_${(h >>> 0).toString(16)}`;
}

/**
 * Trust proxy hops via CONTRACTS_V2_TRUST_PROXY (número).
 * 0 / ausente ⇒ ignora X-Forwarded-For.
 */
export function resolveTrustedClientAddress(req, env = process.env) {
  const hops = Math.max(0, Number.parseInt(String(env.CONTRACTS_V2_TRUST_PROXY ?? '0'), 10) || 0);
  const socketIp = req.socket?.remoteAddress || req.ip || null;
  const xff = String(req.headers?.['x-forwarded-for'] || '');

  if (hops <= 0) {
    const ip = isValidIp(socketIp) ? String(socketIp).replace(/^::ffff:/, '') : null;
    return {
      ip,
      ipHash: ip ? hashClientIp(ip) : hashClientIp('unknown'),
      source: ip ? 'socket' : 'unavailable',
      forwardedIgnored: Boolean(xff),
      valid: Boolean(ip),
    };
  }

  const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
  let candidate = null;
  if (parts.length) {
    candidate = hops === 1
      ? (parts.length >= 2 ? parts[parts.length - 2] : parts[0])
      : (parts[Math.max(0, parts.length - hops - 1)] || parts[0]);
  }
  if (isValidIp(candidate)) {
    const ip = String(candidate).replace(/^::ffff:/, '');
    return {
      ip,
      ipHash: hashClientIp(ip),
      source: 'trusted-proxy',
      forwardedIgnored: false,
      valid: true,
    };
  }

  const fallback = isValidIp(socketIp) ? String(socketIp).replace(/^::ffff:/, '') : null;
  return {
    ip: fallback,
    ipHash: fallback ? hashClientIp(fallback) : hashClientIp('unknown'),
    source: fallback ? 'socket' : 'unavailable',
    forwardedIgnored: Boolean(xff),
    valid: Boolean(fallback),
  };
}

export function createPublicSignaturesV2CorsMiddleware(env = process.env) {
  const policy = getPublicSigningCorsPolicy(env);
  return function publicSignaturesV2Cors(req, res, next) {
    applyContractsV2SecurityHeaders(res);
    const decision = evaluatePublicSigningCors(policy, {
      origin: req.headers?.origin,
      method: req.method,
    });
    if (!decision.allowed) {
      return res.status(403).json({
        error: 'Origem não autorizada.',
        code: 'CONTRACTS_V2_CORS_ORIGIN_DENIED',
      });
    }
    applyPublicSigningCorsHeaders(res, policy, decision);
    if (decision.preflight) {
      return res.status(204).end();
    }
    return next();
  };
}

export function createPersistedHttpRateLimitAdapter(deps = {}) {
  const service = deps.service;
  const publicTenantId = deps.publicTenantId || '00000000-0000-4000-8000-0000000000rl';
  const opMap = {
    OPEN_SESSION: 'OPEN_SESSION',
    OPEN: 'OPEN_SESSION',
    VIEW: 'OPEN_SESSION',
    STATUS: 'OPEN_SESSION',
    DOCUMENT: 'OPEN_SESSION',
    REQUEST_CHALLENGE: 'REQUEST_CHALLENGE',
    VERIFY_CHALLENGE: 'VERIFY_CHALLENGE',
    ACCEPT: 'SIGN',
    SIGN: 'SIGN',
    DECLINE: 'DECLINE',
  };
  return {
    async check(operation, ctx = {}) {
      if (!service) return { allowed: false, remaining: 0 };
      const persistedOp = opMap[operation] || 'OPEN_SESSION';
      const scopeKey = [
        `op:${persistedOp}`,
        ctx.ipHash ? `ip:${ctx.ipHash}` : null,
        ctx.sessionHint ? `sess:${ctx.sessionHint}` : null,
      ].filter(Boolean).join('|');
      try {
        const result = await service.checkAndConsume({
          tenantId: publicTenantId,
          scopeKey,
          operation: persistedOp,
        });
        return {
          allowed: result.allowed,
          remaining: result.remaining,
          retryAfterSeconds: result.retryAfterMs
            ? Math.ceil(result.retryAfterMs / 1000)
            : undefined,
        };
      } catch {
        return { allowed: false, remaining: 0 };
      }
    },
  };
}
