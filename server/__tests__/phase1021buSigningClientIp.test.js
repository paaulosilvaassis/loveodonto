import { describe, expect, it } from 'vitest';
import { resolveSigningClientIp, resolveTrustProxyHops } from '../lib/signingClientIp.js';
import { createSigningClientContextHandler } from '../lib/signingClientContextApi.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    set(name, value) { this.headers[name] = value; return this; },
  };
  return res;
}

describe('PHASE_10.21BU signing client IP', () => {
  it('produção com proxy não transforma IP remoto em local', () => {
    const resolved = resolveSigningClientIp(
      {
        socket: { remoteAddress: '::ffff:10.0.0.8' },
        headers: { 'x-forwarded-for': '198.51.100.20, 10.0.0.8' },
      },
      { NODE_ENV: 'production', TRUST_PROXY_HOPS: '1' },
    );
    expect(resolved.ip).toBe('198.51.100.20');
    expect(resolved.source).toBe('trusted-proxy');
    expect(resolved.ip).not.toBe('local');
  });

  it('dev loopback permanece local', () => {
    const resolved = resolveSigningClientIp(
      { socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': '8.8.8.8' } },
      { NODE_ENV: 'development' },
    );
    expect(resolved.ip).toBe('local');
    expect(resolved.source).toBe('local-dev');
    expect(resolved.forwardedIgnored).toBe(true);
  });

  it('endpoint público devolve IP observado e ignora query spoof', () => {
    const handler = createSigningClientContextHandler();
    const res = mockRes();
    handler({
      socket: { remoteAddress: '10.1.1.1' },
      headers: { 'x-forwarded-for': '203.0.113.77, 10.1.1.1' },
      query: { ip: '1.2.3.4' },
      body: { ip: '9.9.9.9' },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ip).not.toBe('1.2.3.4');
    expect(readFileSync(path.join(ROOT, 'server/index.js'), 'utf8')).toContain(
      "app.get('/internal/app/contracts/signing-client-context'",
    );
  });

  it('produção default hops=1', () => {
    expect(resolveTrustProxyHops({ NODE_ENV: 'production' })).toBe(1);
    expect(resolveTrustProxyHops({ NODE_ENV: 'development' })).toBe(0);
  });
});
