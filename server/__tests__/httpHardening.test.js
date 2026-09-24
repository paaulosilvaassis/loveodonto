import { describe, expect, it } from 'vitest';
import {
  createCorsOriginResolver,
  createRateLimiter,
  onlyForPaths,
  SENSITIVE_ROUTE_PATTERNS,
} from '../lib/httpHardening.js';

function mockRes() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    body: null,
    setHeader(k, v) { headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

function req({ method = 'POST', path = '/internal/app/users/password-reset', auth, xff } = {}) {
  const headers = {};
  if (auth) headers.authorization = `Bearer ${auth}`;
  if (xff) headers['x-forwarded-for'] = xff;
  return { method, path, headers, socket: { remoteAddress: '10.0.0.1' } };
}

describe('httpHardening — CORS allowlist', () => {
  it('produção: aceita loveodonto.com.br e *.vercel.app, recusa origem estranha e localhost', () => {
    const ok = createCorsOriginResolver({ NODE_ENV: 'production' });
    expect(ok('https://loveodonto.com.br')).toBe(true);
    expect(ok('https://www.loveodonto.com.br')).toBe(true);
    expect(ok('https://love-odonto-console.vercel.app')).toBe(true);
    expect(ok('https://evil.example.com')).toBe(false);
    expect(ok('http://localhost:5176')).toBe(false);
    expect(ok('https://loveodonto.com.br.evil.com')).toBe(false);
  });

  it('sem Origin (server-to-server, healthcheck) é permitido', () => {
    expect(createCorsOriginResolver({ NODE_ENV: 'production' })(undefined)).toBe(true);
  });

  it('dev aceita localhost', () => {
    expect(createCorsOriginResolver({ NODE_ENV: 'development' })('http://localhost:5176')).toBe(true);
  });

  it('ADMIN_API_CORS_ORIGINS substitui o default e desliga *.vercel.app', () => {
    const ok = createCorsOriginResolver({
      NODE_ENV: 'production',
      ADMIN_API_CORS_ORIGINS: 'https://a.com, https://b.com/',
    });
    expect(ok('https://a.com')).toBe(true);
    expect(ok('https://b.com')).toBe(true);
    expect(ok('https://loveodonto.com.br')).toBe(false);
    expect(ok('https://x.vercel.app')).toBe(false);
  });
});

describe('httpHardening — rate limiter', () => {
  it('bloqueia com 429 após o limite, por token', () => {
    const limiter = createRateLimiter({ name: 't', windowMs: 60_000, max: 2 });
    const calls = [];
    const next = () => calls.push('next');
    for (let i = 0; i < 2; i += 1) limiter(req({ auth: 'token-aaaaaaaaaaaaaaaa' }), mockRes(), next);
    expect(calls).toHaveLength(2);
    const res = mockRes();
    limiter(req({ auth: 'token-aaaaaaaaaaaaaaaa' }), res, next);
    expect(calls).toHaveLength(2);
    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('tokens diferentes têm baldes independentes', () => {
    const limiter = createRateLimiter({ name: 't', windowMs: 60_000, max: 1 });
    const calls = [];
    limiter(req({ auth: 'token-aaaaaaaaaaaaaaaa' }), mockRes(), () => calls.push(1));
    limiter(req({ auth: 'token-bbbbbbbbbbbbbbbb' }), mockRes(), () => calls.push(2));
    expect(calls).toEqual([1, 2]);
  });

  it('sem token usa o IP do X-Forwarded-For', () => {
    const limiter = createRateLimiter({ name: 't', windowMs: 60_000, max: 1 });
    const calls = [];
    limiter(req({ xff: '1.1.1.1, 10.0.0.1' }), mockRes(), () => calls.push(1));
    limiter(req({ xff: '2.2.2.2, 10.0.0.1' }), mockRes(), () => calls.push(2));
    const res = mockRes();
    limiter(req({ xff: '1.1.1.1, 10.0.0.1' }), res, () => calls.push(3));
    expect(calls).toEqual([1, 2]);
    expect(res.statusCode).toBe(429);
  });
});

describe('httpHardening — rotas sensíveis', () => {
  it.each([
    '/internal/app/users/password-reset',
    '/internal/app/users/create',
    '/internal/app/invitations/resend',
    '/internal/app/identities/abc-123/reset-password',
    '/internal/app/identities/abc-123/resend-invite',
    '/internal/app/contracts/signature-invite-email',
  ])('%s é limitada', (p) => {
    expect(SENSITIVE_ROUTE_PATTERNS.some((re) => re.test(p))).toBe(true);
  });

  it('GET e rotas comuns passam direto', () => {
    let hit = 0;
    const scoped = onlyForPaths(SENSITIVE_ROUTE_PATTERNS, () => { hit += 1; });
    let passed = 0;
    scoped(req({ method: 'GET' }), mockRes(), () => { passed += 1; });
    scoped(req({ path: '/internal/app/patients' }), mockRes(), () => { passed += 1; });
    scoped(req(), mockRes(), () => { passed += 1; });
    expect(passed).toBe(2);
    expect(hit).toBe(1);
  });
});
