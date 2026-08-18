/**
 * GET /internal/app/contracts/signing-client-context
 * Público (página /assinatura/:token). Não consome token. Não aceita IP do cliente.
 */
import { resolveSigningClientIpFromRequest } from './signingClientIp.js';

const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;

function rateLimited(key) {
  const now = Date.now();
  const row = hits.get(key);
  if (!row || now - row.startedAt > WINDOW_MS) {
    hits.set(key, { startedAt: now, count: 1 });
    return false;
  }
  row.count += 1;
  return row.count > MAX_PER_WINDOW;
}

export function createSigningClientContextHandler() {
  return function handleSigningClientContext(req, res) {
    const purpose = String(req.headers?.purpose || req.headers?.['sec-purpose'] || '').toLowerCase();
    const prefetch = purpose.includes('prefetch');
    const resolved = resolveSigningClientIpFromRequest(req);
    const key = resolved.ip || req.socket?.remoteAddress || 'unknown';
    if (rateLimited(key)) {
      return res.status(429).json({ ok: false, code: 'RATE_LIMITED' });
    }
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      ip: resolved.ip,
      source: resolved.source,
      environment: resolved.environment,
      prefetch,
    });
  };
}
