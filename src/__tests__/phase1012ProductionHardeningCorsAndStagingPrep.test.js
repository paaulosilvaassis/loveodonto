/**
 * Phase 10.12 — Production Hardening, CORS Allowlist and Staging Cutover Prep
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  CONTRACT_FEATURE_FLAG_DEFAULTS,
  CONTRACT_FEATURE_FLAGS,
  isContractFeatureEnabled,
  createPublicSigningCorsPolicy,
  evaluatePublicSigningCors,
  normalizeOrigin,
  applyPublicSigningCorsHeaders,
  DEFAULT_CONTRACTS_V2_SECURITY_HEADERS,
  applyContractsV2SecurityHeaders,
  securityHeadersAsRecord,
  createTrustedClientAddressResolver,
  isValidIp,
  DEFAULT_PUBLIC_SIGNING_RATE_LIMITS,
  createInMemoryHttpSignatureRateLimitAdapter,
  createPersistedHttpSignatureRateLimitAdapter,
  createSignatureRateLimitService,
  createMemorySignatureRateLimitRepository,
  loadContractsV2EnvironmentConfig,
  assertContractsV2ConfigOrThrow,
  isSigningTokenSecretStrong,
  createContractsV2Runtime,
  evaluateContractsV2RuntimeReadiness,
  toPublicReadinessPayload,
  createContractsV2SecureLogger,
  redactSensitiveString,
  sanitizeLogMeta,
  resolveContractsV2RequestIds,
  createInMemoryContractsV2Metrics,
  CONTRACTS_V2_EXPECTED_MIGRATIONS,
} from '../domain/contracts/index.ts';

import {
  applyContractsV2SecurityHeaders as applyHeadersJs,
  resolveTrustedClientAddress,
  createPublicSignaturesV2CorsMiddleware,
} from '../../server/lib/contractsV2PublicSecurity.js';

import {
  createPublicSignaturesV2Handlers,
  applyPublicSignatureSecurityHeaders,
  isPublicSignaturesV2ApiEnabled,
} from '../../server/lib/publicSignaturesV2Api.js';

import { createContractsV2RuntimeReadinessHandlers } from '../../server/lib/contractsV2RuntimeReadinessApi.js';
import { runStagingPreflightDryRun } from '../../scripts/contracts-v2-staging-preflight.mjs';
import { buildPermissionsCatalog } from '../permissions/catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function mockRes() {
  const headers = {};
  let statusCode = 200;
  let body;
  let ended = false;
  return {
    headers,
    statusCode,
    ended,
    body: () => body,
    setHeader(k, v) { headers[k] = v; },
    status(code) { statusCode = code; this.statusCode = code; return this; },
    json(payload) { body = payload; return this; },
    send(payload) { body = payload; return this; },
    end() { ended = true; this.ended = true; return this; },
  };
}

describe('Phase 10.12 — feature flags defaults OFF', () => {
  it('falha se qualquer default mudar para true', () => {
    expect(CONTRACT_FEATURE_FLAGS).toHaveLength(15);
    for (const flag of CONTRACT_FEATURE_FLAGS) {
      expect(CONTRACT_FEATURE_FLAG_DEFAULTS[flag]).toBe(false);
      expect(isContractFeatureEnabled(flag)).toBe(false);
    }
    expect(isPublicSignaturesV2ApiEnabled({})).toBe(false);
  });
});

describe('Phase 10.12 — CORS allowlist', () => {
  const policy = createPublicSigningCorsPolicy({ environment: 'local' });

  it('permite origem local autorizada', () => {
    const d = evaluatePublicSigningCors(policy, {
      origin: 'http://localhost:5173',
      method: 'POST',
    });
    expect(d.allowed).toBe(true);
    expect(d.origin).toBe('http://localhost:5173');
  });

  it('nega origem não autorizada e subdomínio malicioso', () => {
    expect(evaluatePublicSigningCors(policy, {
      origin: 'https://evil.example.com',
      method: 'POST',
    }).allowed).toBe(false);
    expect(evaluatePublicSigningCors(policy, {
      origin: 'http://localhost.evil.com:5173',
      method: 'GET',
    }).allowed).toBe(false);
  });

  it('nega null origin', () => {
    expect(evaluatePublicSigningCors(policy, { origin: 'null', method: 'GET' }).allowed).toBe(false);
  });

  it('sem origin permite (non-browser) sem ecoar ACAO', () => {
    const d = evaluatePublicSigningCors(policy, { method: 'GET' });
    expect(d.allowed).toBe(true);
    expect(d.origin).toBeNull();
    const headers = {};
    applyPublicSigningCorsHeaders((k, v) => { headers[k] = v; }, policy, d);
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('preflight consistente e sem reflexão arbitrária', () => {
    const d = evaluatePublicSigningCors(policy, {
      origin: 'http://127.0.0.1:5173',
      method: 'OPTIONS',
    });
    expect(d.allowed).toBe(true);
    expect(d.preflight).toBe(true);
    const headers = {};
    applyPublicSigningCorsHeaders((k, v) => { headers[k] = v; }, policy, d);
    expect(headers['Access-Control-Allow-Origin']).toBe('http://127.0.0.1:5173');
    expect(headers['Access-Control-Allow-Methods']).toContain('POST');
    expect(policy.allowCredentials).toBe(false);
  });

  it('staging sem origins falha com código dedicado', () => {
    expect(() => createPublicSigningCorsPolicy({ environment: 'staging' })).toThrow(
      /CONTRACTS_V2_PUBLIC_ORIGIN_CONFIGURATION_REQUIRED/,
    );
  });

  it('normaliza trailing slash / porta e bloqueia path', () => {
    expect(normalizeOrigin('http://localhost:5173/')).toBe('http://localhost:5173');
    expect(normalizeOrigin('http://localhost:5173/assinar')).toBeNull();
  });

  it('middleware JS nega origem não allowlisted', () => {
    const mw = createPublicSignaturesV2CorsMiddleware({
      CONTRACTS_V2_RUNTIME_MODE: 'local-integration',
      CONTRACTS_V2_PUBLIC_ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
    });
    const res = mockRes();
    let nextCalled = false;
    mw(
      { method: 'POST', headers: { origin: 'https://evil.example' } },
      res,
      () => { nextCalled = true; },
    );
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });
});

describe('Phase 10.12 — security headers', () => {
  it('aplica todos os headers públicos exigidos', () => {
    const headers = {};
    applyContractsV2SecurityHeaders((k, v) => { headers[k] = v; });
    const record = securityHeadersAsRecord();
    expect(headers['Cache-Control']).toBe('no-store, private');
    expect(headers.Pragma).toBe('no-cache');
    expect(headers['Referrer-Policy']).toBe('no-referrer');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['Content-Security-Policy']).toContain("object-src 'none'");
    expect(headers['X-Robots-Tag']).toContain('noindex');
    expect(headers['Permissions-Policy']).toBeTruthy();
    expect(record['Cache-Control']).toBe(DEFAULT_CONTRACTS_V2_SECURITY_HEADERS.cacheControl);

    const res = mockRes();
    applyPublicSignatureSecurityHeaders(res);
    applyHeadersJs(res);
    expect(res.headers['X-Frame-Options']).toBe('DENY');
  });
});

describe('Phase 10.12 — trust proxy', () => {
  it('conexão direta ignora XFF', () => {
    const resolver = createTrustedClientAddressResolver({ trustProxyHops: 0 });
    const r = resolver.resolve({
      socket: { remoteAddress: '10.0.0.5' },
      headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.5' },
    });
    expect(r.ip).toBe('10.0.0.5');
    expect(r.forwardedIgnored).toBe(true);
    expect(r.source).toBe('socket');
  });

  it('proxy confiável com hops=1', () => {
    const resolver = createTrustedClientAddressResolver({ trustProxyHops: 1 });
    const r = resolver.resolve({
      socket: { remoteAddress: '10.0.0.5' },
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.5' },
    });
    expect(r.ip).toBe('203.0.113.10');
    expect(r.source).toBe('trusted-proxy');
    expect(r.ipHash).toBeTruthy();
  });

  it('IP inválido / spoofing sem hops', () => {
    expect(isValidIp('not-an-ip')).toBe(false);
    const js = resolveTrustedClientAddress(
      {
        socket: { remoteAddress: '127.0.0.1' },
        headers: { 'x-forwarded-for': '8.8.8.8' },
      },
      { CONTRACTS_V2_TRUST_PROXY: '0' },
    );
    expect(js.ip).toBe('127.0.0.1');
    expect(js.forwardedIgnored).toBe(true);
  });
});

describe('Phase 10.12 — rate limit HTTP', () => {
  it('adapter memory respeita operações distintas', async () => {
    const store = new Map();
    const rl = createInMemoryHttpSignatureRateLimitAdapter({
      store,
      config: {
        ...DEFAULT_PUBLIC_SIGNING_RATE_LIMITS,
        open: { windowSeconds: 60, maxAttempts: 2, scopes: ['ip', 'operation'] },
      },
    });
    expect((await rl.check('OPEN', { ipHash: 'a' })).allowed).toBe(true);
    expect((await rl.check('OPEN', { ipHash: 'a' })).allowed).toBe(true);
    expect((await rl.check('OPEN', { ipHash: 'a' })).allowed).toBe(false);
    expect((await rl.check('SIGN', { ipHash: 'a' })).allowed).toBe(true);
  });

  it('adapter persistido é restart-safe via repo', async () => {
    const repo = createMemorySignatureRateLimitRepository();
    const service = createSignatureRateLimitService(repo);
    const rl = createPersistedHttpSignatureRateLimitAdapter({ service });
    for (let i = 0; i < 25; i += 1) {
      await rl.check('OPEN_SESSION', { ipHash: 'iph_1' });
    }
    const after = await rl.check('OPEN_SESSION', { ipHash: 'iph_1' });
    expect(after.allowed).toBe(false);

    const rl2 = createPersistedHttpSignatureRateLimitAdapter({
      service: createSignatureRateLimitService(repo),
    });
    const restart = await rl2.check('OPEN_SESSION', { ipHash: 'iph_1' });
    expect(restart.allowed).toBe(false);
  });

  it('falha de storage fecha o adapter', async () => {
    const rl = createPersistedHttpSignatureRateLimitAdapter({
      service: {
        async checkAndConsume() {
          throw new Error('storage down');
        },
      },
    });
    expect((await rl.check('SIGN', { ipHash: 'x' })).allowed).toBe(false);
  });
});

describe('Phase 10.12 — config / bootstrap / readiness', () => {
  it('defaults seguros e modos válidos', () => {
    const r = loadContractsV2EnvironmentConfig({});
    expect(r.ok).toBe(true);
    expect(r.config.runtimeMode).toBe('disabled');
    expect(r.config.deliveryMode).toBe('disabled');
    expect(r.config.databaseMode).toBe('unavailable');
  });

  it('rejeita production-enabled, secret fraco, staging+localhost, staging+memory', () => {
    expect(loadContractsV2EnvironmentConfig({
      CONTRACTS_V2_RUNTIME_MODE: 'production-enabled',
    }).ok).toBe(false);

    expect(loadContractsV2EnvironmentConfig({
      CONTRACTS_V2_RUNTIME_MODE: 'local-integration',
      CONTRACTS_V2_SIGNING_TOKEN_SECRET: 'short',
      CONTRACTS_V2_DATABASE_MODE: 'memory',
      CONTRACTS_V2_STORAGE_MODE: 'memory',
      CONTRACTS_V2_RATE_LIMIT_MODE: 'memory-test',
    }).ok).toBe(false);

    expect(loadContractsV2EnvironmentConfig({
      CONTRACTS_V2_RUNTIME_MODE: 'staging-disabled',
      CONTRACTS_V2_DATABASE_MODE: 'postgres-staging-disabled',
      CONTRACTS_V2_STORAGE_MODE: 'private-staging-configured',
      CONTRACTS_V2_RATE_LIMIT_MODE: 'persisted',
      CONTRACTS_V2_PUBLIC_ALLOWED_ORIGINS: 'http://localhost:5173',
      CONTRACTS_V2_PUBLIC_BASE_URL: 'https://staging.example.com',
      CONTRACTS_V2_SIGNING_TOKEN_SECRET: 'a'.repeat(32),
      CONTRACTS_V2_TRUST_PROXY: '1',
    }).ok).toBe(false);

    expect(loadContractsV2EnvironmentConfig({
      CONTRACTS_V2_RUNTIME_MODE: 'staging-disabled',
      CONTRACTS_V2_DATABASE_MODE: 'memory',
      CONTRACTS_V2_STORAGE_MODE: 'private-staging-configured',
      CONTRACTS_V2_RATE_LIMIT_MODE: 'persisted',
      CONTRACTS_V2_PUBLIC_ALLOWED_ORIGINS: 'https://staging.example.com',
      CONTRACTS_V2_PUBLIC_BASE_URL: 'https://staging.example.com',
      CONTRACTS_V2_SIGNING_TOKEN_SECRET: 'a'.repeat(32),
      CONTRACTS_V2_TRUST_PROXY: '1',
    }).ok).toBe(false);

    expect(isSigningTokenSecretStrong('changeme')).toBe(false);
    expect(isSigningTokenSecretStrong('x'.repeat(32))).toBe(true);
  });

  it('bootstrap modes e harness isolation', async () => {
    const disabled = createContractsV2Runtime({
      env: { CONTRACTS_V2_RUNTIME_MODE: 'disabled' },
    });
    expect(disabled.publicRoutesMountable).toBe(false);
    expect(disabled.harnessMountable).toBe(false);

    const mem = createContractsV2Runtime({
      env: {
        CONTRACTS_V2_RUNTIME_MODE: 'memory-test',
        CONTRACTS_V2_DATABASE_MODE: 'memory',
        CONTRACTS_V2_STORAGE_MODE: 'memory',
        CONTRACTS_V2_RATE_LIMIT_MODE: 'memory-test',
        CONTRACTS_V2_DELIVERY_MODE: 'simulation',
      },
      allowLocalHarness: true,
      migrationsPresent: true,
      rlsOk: true,
      ledgerOk: true,
      rendererOk: true,
      tokenServiceOk: true,
      database: { ok: true },
      storage: { ok: true, privateBucket: true },
    });
    expect(mem.harnessMountable).toBe(true);
    const readyMem = await mem.readiness.check();
    expect(readyMem.state).toBe('READY_FOR_LOCAL_TEST');
    expect(readyMem.readyForProduction).toBe(false);

    expect(() => createContractsV2Runtime({
      env: {
        CONTRACTS_V2_RUNTIME_MODE: 'staging-disabled',
        CONTRACTS_V2_DATABASE_MODE: 'postgres-staging-disabled',
        CONTRACTS_V2_STORAGE_MODE: 'private-staging-configured',
        CONTRACTS_V2_RATE_LIMIT_MODE: 'persisted',
        CONTRACTS_V2_PUBLIC_ALLOWED_ORIGINS: 'https://staging.example.com',
        CONTRACTS_V2_PUBLIC_BASE_URL: 'https://staging.example.com',
        CONTRACTS_V2_SIGNING_TOKEN_SECRET: 'b'.repeat(32),
        CONTRACTS_V2_TRUST_PROXY: '1',
        CONTRACTS_V2_PRIVATE_BUCKET: 'contracts-v2-private-staging',
      },
      allowLocalHarness: true,
      harnessMounted: true,
    })).toThrow(/Harness|HARNESS/);
  });

  it('readiness states e payload sem secrets', () => {
    expect(evaluateContractsV2RuntimeReadiness({ config: null }).state).toMatch(/NOT_CONFIGURED|DISABLED/);
    expect(evaluateContractsV2RuntimeReadiness({
      config: assertContractsV2ConfigOrThrow({ CONTRACTS_V2_RUNTIME_MODE: 'disabled' }),
    }).state).toBe('DISABLED');

    const stagingCfg = assertContractsV2ConfigOrThrow({
      CONTRACTS_V2_RUNTIME_MODE: 'staging-disabled',
      CONTRACTS_V2_DATABASE_MODE: 'postgres-staging-disabled',
      CONTRACTS_V2_STORAGE_MODE: 'private-staging-configured',
      CONTRACTS_V2_RATE_LIMIT_MODE: 'persisted',
      CONTRACTS_V2_PUBLIC_ALLOWED_ORIGINS: 'https://staging.example.com',
      CONTRACTS_V2_PUBLIC_BASE_URL: 'https://staging.example.com',
      CONTRACTS_V2_SIGNING_TOKEN_SECRET: 'c'.repeat(32),
      CONTRACTS_V2_TRUST_PROXY: '1',
      CONTRACTS_V2_PRIVATE_BUCKET: 'contracts-v2-private-staging',
      CONTRACTS_V2_DELIVERY_MODE: 'disabled',
    });
    const ready = evaluateContractsV2RuntimeReadiness({
      config: stagingCfg,
      databaseOk: true,
      migrationsPresent: true,
      rlsOk: true,
      storageOk: true,
      bucketPrivate: true,
      deliveryProviderOk: true,
      rateLimiterOk: true,
      tokenServiceOk: true,
      ledgerOk: true,
      rendererOk: true,
      publicOriginsConfigured: true,
      secretsOk: true,
    });
    expect(ready.state).toBe('READY_FOR_STAGING_VALIDATION');
    expect(ready.readyForProduction).toBe(false);
    const payload = toPublicReadinessPayload(ready);
    expect(JSON.stringify(payload)).not.toMatch(/service_role|Bearer |sk_live|eyJ/);
    expect(payload).not.toHaveProperty('signingTokenSecret');
    expect(payload.expectedMigrations).toEqual([...CONTRACTS_V2_EXPECTED_MIGRATIONS]);
  });

  it('health check interno exige permissão', async () => {
    const handlers = createContractsV2RuntimeReadinessHandlers({
      env: { CONTRACTS_V2_RUNTIME_MODE: 'disabled' },
    });
    const denied = mockRes();
    await handlers.getRuntimeReadiness({ tenantContext: { permissions: [] } }, denied);
    expect(denied.statusCode).toBe(403);

    const okRes = mockRes();
    await handlers.getRuntimeReadiness({
      tenantContext: { permissions: ['contracts:runtime_readiness'] },
    }, okRes);
    expect(okRes.statusCode).toBe(200);
    expect(okRes.body().readyForProduction).toBe(false);
    expect(okRes.body().flagsEnabled).toBe(false);
  });
});

describe('Phase 10.12 — logging / correlation / metrics', () => {
  it('redige token, OTP, e-mail, URL e authorization', () => {
    const lines = [];
    const logger = createContractsV2SecureLogger((line) => lines.push(line));
    logger.log({
      level: 'info',
      message: 'otp=123456 email=a@b.com token=abcdef0123456789abcdef0123456789 url=http://127.0.0.1:5173/assinar/v2/secrettoken',
      meta: {
        authorization: 'Bearer abc.def',
        otp: '999999',
        html: '<p>contract</p>',
      },
    });
    const joined = lines.join('\n');
    expect(joined).not.toContain('123456');
    expect(joined).not.toContain('a@b.com');
    expect(joined).not.toContain('secrettoken');
    expect(joined).not.toContain('Bearer abc');
    expect(joined).toContain('[REDACTED');
    expect(sanitizeLogMeta({ cpf: '123.456.789-00' }).cpf).toBe('[REDACTED]');
    expect(redactSensitiveString('Bearer xyz')).toContain('[REDACTED]');
  });

  it('correlation IDs server-side; client inválido ignorado', () => {
    const ids = resolveContractsV2RequestIds({
      clientCorrelationId: 'bad',
      clientRequestId: 'also-bad',
    });
    expect(ids.clientProvidedIgnored).toBe(true);
    expect(ids.requestId.startsWith('req_')).toBe(true);
    expect(ids.correlationId.startsWith('corr_')).toBe(true);

    const ok = resolveContractsV2RequestIds({
      clientCorrelationId: 'client-corr-12345678',
    });
    expect(ok.correlationId).toBe('client-corr-12345678');
  });

  it('métricas sem PII em labels', () => {
    const m = createInMemoryContractsV2Metrics();
    m.increment('contracts_v2_public_request_total', { operation: 'OPEN', email: 'x@y.com' });
    const snap = JSON.stringify(m.snapshot());
    expect(snap).not.toContain('x@y.com');
    expect(snap).toContain('OPEN');
  });
});

describe('Phase 10.12 — permissions / harness / public handlers', () => {
  it('permissões no catálogo sem roleDefaults', () => {
    const catalog = buildPermissionsCatalog();
    const actions = catalog
      .filter((p) => p.module_key === 'contract_signatures')
      .map((p) => p.action_key);
    expect(actions).toContain('runtime_readiness');
    expect(actions).toContain('staging_preflight');
    expect(actions).toContain('view_security_diagnostics');
    const roleDefaults = fs.readFileSync(path.join(ROOT, 'src/permissions/roleDefaults.js'), 'utf8');
    expect(roleDefaults).not.toContain('runtime_readiness');
    expect(roleDefaults).not.toContain('staging_preflight');
  });

  it('handlers públicos bloqueiam staging-disabled', async () => {
    const h = createPublicSignaturesV2Handlers({
      env: { CONTRACTS_V2_RUNTIME_MODE: 'staging-disabled' },
      isEnabled: () => true,
      getSignerService: () => ({}),
    });
    const res = mockRes();
    await h.publicOpen({
      params: { token: 'tok123' },
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    }, res);
    expect(res.statusCode).toBe(403);
  });
});

describe('Phase 10.12 — staging preflight dry-run', () => {
  it('passa fechado sem mutação remota', () => {
    const report = runStagingPreflightDryRun({
      CONTRACTS_V2_DELIVERY_MODE: 'disabled',
      CONTRACTS_V2_RATE_LIMIT_MODE: 'persisted',
    });
    expect(report.mode).toBe('dry-run');
    expect(report.appliedMigrations).toBe(false);
    expect(report.createdRemoteBucket).toBe(false);
    expect(report.readyForProduction).toBe(false);
    expect(report.ok).toBe(true);
  });

  it('falha se flag ligada', () => {
    const report = runStagingPreflightDryRun({
      VITE_CONTRACTS_DOMAIN_V2_ENABLED: 'true',
    });
    expect(report.ok).toBe(false);
  });
});

describe('Phase 10.12 — migrations mirrors / legado', () => {
  it('mirrors 028–034 OK e 006 intacta no diff de nomes', () => {
    for (const m of CONTRACTS_V2_EXPECTED_MIGRATIONS) {
      const a = path.join(ROOT, 'supabase/migrations', m);
      const b = path.join(ROOT, 'supabase-local/supabase/migrations', m);
      const c = path.join(ROOT, 'supabase-local/migrations', m);
      expect(fs.existsSync(a)).toBe(true);
      expect(fs.existsSync(b)).toBe(true);
      expect(sha256File(a)).toBe(sha256File(b));
      if (fs.existsSync(c)) expect(sha256File(a)).toBe(sha256File(c));
    }
    const migs = fs.readdirSync(path.join(ROOT, 'supabase/migrations'));
    expect(migs.some((f) => f.startsWith('006_'))).toBe(true);
  });

  it('manifesto e relatório 10.12 existem', () => {
    expect(fs.existsSync(path.join(ROOT, 'docs/reports/PHASE_10_CHANGESET_MANIFEST.md'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'docs/reports/PHASE_10_CHANGESET_MANIFEST.json'))).toBe(true);
    expect(fs.existsSync(path.join(
      ROOT,
      'docs/reports/PHASE_10_12_PRODUCTION_HARDENING_CORS_AND_STAGING_CUTOVER_PREP.md',
    ))).toBe(true);
  });
});
