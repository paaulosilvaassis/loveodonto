/**
 * Resolução de IP observada no servidor — PHASE_10.21BU.
 *
 * TRUST BOUNDARY
 * - Nunca confiar em IP enviado no body/query do frontend.
 * - Confiar em socket.remoteAddress e, se TRUST_PROXY_HOPS > 0, headers de proxy
 *   da infraestrutura (Vercel/Railway): x-forwarded-for, x-real-ip, x-vercel-forwarded-for.
 * - Produção (default hops=1): IP remoto real NÃO vira "local".
 * - Dev/test (hops=0): loopback continua identificado como local/dev.
 *
 * Espelho de src/contracts/signingClientIp.js — o deploy Railway usa Root Directory=server.
 */

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6 = /^(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$|^::1$|^::$/;

export function isValidIp(value) {
  if (!value || typeof value !== 'string') return false;
  const v = normalizeIp(value);
  if (!v) return false;
  if (v.startsWith('::ffff:')) return IPV4.test(v.slice(7));
  return IPV4.test(v) || IPV6.test(v);
}

export function normalizeIp(value) {
  if (value == null) return '';
  let v = String(value).trim().replace(/^\[|\]$/g, '');
  if (v.startsWith('::ffff:')) v = v.slice(7);
  return v;
}

export function isLoopbackIp(value) {
  const ip = normalizeIp(value);
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip === '0.0.0.0';
}

function headerValue(headers, name) {
  if (!headers) return '';
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

function pickTrustedForwardedIp(xff, trustProxyHops) {
  if (!xff || trustProxyHops <= 0) return '';
  const parts = xff.split(',').map((part) => normalizeIp(part)).filter(Boolean);
  if (!parts.length) return '';
  let candidate;
  if (trustProxyHops === 1) {
    candidate = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  } else {
    candidate = parts[Math.max(0, parts.length - trustProxyHops - 1)] || parts[0];
  }
  return isValidIp(candidate) ? candidate : '';
}

export function resolveTrustProxyHops(env = {}) {
  const raw = env.TRUST_PROXY_HOPS;
  if (raw != null && String(raw).trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return env.NODE_ENV === 'production' ? 1 : 0;
}

export function resolveSigningClientIp(req = {}, env = {}) {
  const nodeEnv = env.NODE_ENV || 'development';
  const hops = resolveTrustProxyHops(env);
  const headers = req.headers || {};
  const socketIp = normalizeIp(req.socket?.remoteAddress || req.ip || '');

  if (hops <= 0) {
    const ip = isValidIp(socketIp) ? normalizeIp(socketIp) : '';
    const local = !ip || isLoopbackIp(ip);
    return {
      ip: local ? 'local' : ip,
      source: local ? 'local-dev' : 'socket',
      environment: nodeEnv,
      forwardedIgnored: Boolean(headerValue(headers, 'x-forwarded-for')),
    };
  }

  const vercel = normalizeIp(headerValue(headers, 'x-vercel-forwarded-for'));
  const realIp = normalizeIp(headerValue(headers, 'x-real-ip'));
  const forwarded = pickTrustedForwardedIp(headerValue(headers, 'x-forwarded-for'), hops);
  const candidate = [vercel, realIp, forwarded].find((value) => isValidIp(value)) || '';
  if (candidate) {
    return {
      ip: normalizeIp(candidate),
      source: 'trusted-proxy',
      environment: nodeEnv,
      forwardedIgnored: false,
    };
  }

  if (isValidIp(socketIp) && !isLoopbackIp(socketIp)) {
    return {
      ip: normalizeIp(socketIp),
      source: 'socket',
      environment: nodeEnv,
      forwardedIgnored: Boolean(headerValue(headers, 'x-forwarded-for')),
    };
  }

  return {
    ip: nodeEnv === 'production' ? 'unavailable' : 'local',
    source: nodeEnv === 'production' ? 'unavailable' : 'local-dev',
    environment: nodeEnv,
    forwardedIgnored: Boolean(headerValue(headers, 'x-forwarded-for')),
  };
}

export function resolveSigningClientIpFromRequest(req, env = process.env) {
  return resolveSigningClientIp(req, env);
}
