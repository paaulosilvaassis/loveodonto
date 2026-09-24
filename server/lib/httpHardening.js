/**
 * Endurecimento HTTP da Admin API: CORS por allowlist, headers de segurança
 * e rate limiting em memória para rotas que disparam e-mail / mexem em acesso.
 */
import crypto from 'node:crypto';

const DEFAULT_CORS_ORIGINS = [
  'https://loveodonto.com.br',
  'https://www.loveodonto.com.br',
];

const DEV_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const VERCEL_PREVIEW_RE = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

/**
 * `ADMIN_API_CORS_ORIGINS` (lista separada por vírgula) substitui o default.
 * Sem Origin (curl, server-to-server, Railway healthcheck) é permitido: CORS só protege browsers.
 */
export function createCorsOriginResolver(env = process.env) {
  const raw = String(env.ADMIN_API_CORS_ORIGINS || '').trim();
  const allowAny = raw === '*';
  const explicit = raw && !allowAny
    ? raw.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean)
    : DEFAULT_CORS_ORIGINS;
  const allowDev = env.NODE_ENV !== 'production' || String(env.ADMIN_API_CORS_ALLOW_LOCALHOST || '') === '1';
  const allowVercel = !raw || String(env.ADMIN_API_CORS_ALLOW_VERCEL || '') === '1';

  return function isAllowedOrigin(origin) {
    if (!origin) return true;
    if (allowAny) return true;
    const o = String(origin).replace(/\/+$/, '');
    if (explicit.includes(o)) return true;
    if (allowVercel && VERCEL_PREVIEW_RE.test(o)) return true;
    if (allowDev && DEV_ORIGIN_RE.test(o)) return true;
    return false;
  };
}

export function buildCorsOptions(env = process.env) {
  const isAllowed = createCorsOriginResolver(env);
  return {
    origin(origin, callback) {
      callback(null, isAllowed(origin));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Platform-Key'],
    maxAge: 600,
  };
}

/**
 * Headers defensivos globais. Sem CSP/CORP/X-Frame-Options aqui: a API também serve
 * imagens/PDFs consumidos cross-site pelo app; rotas públicas de assinatura aplicam os seus.
 */
export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

function clientKey(req) {
  const auth = String(req.headers?.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ') && auth.length > 20) {
    return `t:${crypto.createHash('sha256').update(auth.slice(7)).digest('hex').slice(0, 32)}`;
  }
  const xff = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return `ip:${xff || req.socket?.remoteAddress || 'unknown'}`;
}

/**
 * Fixed-window limiter em memória. A API roda em uma instância no Railway;
 * com múltiplas réplicas o limite passa a valer por réplica (ainda útil contra abuso).
 */
export function createRateLimiter({ windowMs, max, name }) {
  const buckets = new Map();
  let lastSweep = Date.now();

  return function rateLimit(req, res, next) {
    if (req.method === 'OPTIONS') return next();
    const now = Date.now();
    if (now - lastSweep > windowMs) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      lastSweep = now;
    }
    const key = clientKey(req);
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      console.warn(`[RATE_LIMIT] ${name} excedido`, { path: req.path, retryAfter });
      return res.status(429).json({
        ok: false,
        code: 'RATE_LIMITED',
        error: 'Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.',
        retryAfterSeconds: retryAfter,
      });
    }
    return next();
  };
}

/** Rotas que enviam e-mail ou alteram credenciais/acesso de usuários. */
export const SENSITIVE_ROUTE_PATTERNS = [
  /^\/internal\/app\/users\/(create|password-reset)$/,
  /^\/internal\/app\/invitations\/(resend|reconcile)$/,
  /^\/internal\/app\/collaborators\/(provision|link|access-bundle)$/,
  /^\/internal\/app\/identities\/provision$/,
  /^\/internal\/app\/identities\/[^/]+\/(resend-invite|reset-password|revoke-sessions|repair)$/,
  /^\/internal\/app\/contracts\/signature-invite-email$/,
];

/** Aplica o middleware só em escritas cujo path casa com algum padrão. */
export function onlyForPaths(patterns, middleware) {
  return function scoped(req, res, next) {
    if (req.method === 'GET' || req.method === 'OPTIONS') return next();
    if (patterns.some((re) => re.test(req.path))) return middleware(req, res, next);
    return next();
  };
}
