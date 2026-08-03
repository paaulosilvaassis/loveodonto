/**
 * Phase 10.10 — Secure Signing Session Persistence and Private Object Storage
 * Testes estáticos/unitários sempre; integração local apenas com opt-in completo.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  CONTRACT_FEATURE_FLAG_DEFAULTS,
  isContractFeatureEnabled,
} from '../domain/contracts/contract-feature-flags.ts';
import {
  createMemorySigningSessionRepository,
  createMemorySignatureAuthenticationChallengeRepository,
  createMemorySignatureRateLimitRepository,
  createPersistedSigningSessionTokenService,
  createPersistedSignatureAuthenticationChallengeService,
  createSignatureRateLimitService,
  buildSignatureRateLimitScope,
  hashSigningSessionToken,
  hashSignatureOtpCode,
  createMemoryContractPrivateStorage,
  createMemoryObjectStorageDriver,
  createSupabaseContractPrivateStorage,
  createContractFileReconciliationService,
  createSignatureGraphicArtifactService,
  sha256Bytes,
} from '../domain/contracts/index.ts';
import {
  createContractsV2Repositories,
  assessContractsV2DatabaseEnvironment,
  assessContractsV2LocalStorage,
  assertContractsV2LocalStorage,
  CONTRACTS_V2_LOCAL_DATABASE_REQUIRED,
  CONTRACTS_V2_LOCAL_STORAGE_REQUIRED,
  CONTRACTS_V2_PRIVATE_LOCAL_BUCKET,
  CONTRACT_V2_TABLES,
} from '../repositories/contracts/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function controllableClock(startMs) {
  let now = startMs;
  return {
    now: () => new Date(now),
    nowIso: () => new Date(now).toISOString(),
    advance(ms) { now += ms; },
  };
}

function pngBytes(size = 64) {
  // Cabeçalho PNG mínimo + padding (não precisa ser PNG válido para hash/MIME tests)
  const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const out = new Uint8Array(size);
  out.set(header);
  for (let i = header.length; i < size; i += 1) out[i] = i % 251;
  return out;
}

describe('Phase 10.10 — flags OFF', () => {
  it('todas as flags v2 permanecem false', () => {
    for (const [flag, value] of Object.entries(CONTRACT_FEATURE_FLAG_DEFAULTS)) {
      expect(value).toBe(false);
      expect(isContractFeatureEnabled(flag)).toBe(false);
    }
  });
});

describe('Phase 10.10 — environment guards', () => {
  it('storage guard bloqueia sem opt-in / bucket remoto', () => {
    const a = assessContractsV2LocalStorage({ env: {}, bucket: 'public-bucket' });
    expect(a.ok).toBe(false);
    expect(a.code).toBe(CONTRACTS_V2_LOCAL_STORAGE_REQUIRED);
    expect(() => assertContractsV2LocalStorage({ env: {} }))
      .toThrow(/CONTRACTS_V2_LOCAL_STORAGE_REQUIRED/);
  });

  it('storage guard aceita bucket local com marcadores', () => {
    const a = assessContractsV2LocalStorage({
      env: {
        CONTRACTS_V2_LOCAL_STORAGE: 'true',
        LOVE_ODONTO_LOCAL_DB_CONFIRMATION: 'LOCAL_DISPOSABLE_ONLY',
      },
      bucket: CONTRACTS_V2_PRIVATE_LOCAL_BUCKET,
      supabaseUrl: 'http://127.0.0.1:54321',
      explicitLocalMarker: true,
    });
    expect(a.ok).toBe(true);
  });

  it('postgres-storage-local-test exige DB + storage guards', () => {
    const db = assessContractsV2DatabaseEnvironment({
      mode: 'postgres-storage-local-test',
      env: {},
    });
    expect(db.ok).toBe(false);
    expect(db.code).toBe(CONTRACTS_V2_LOCAL_DATABASE_REQUIRED);

    expect(() => createContractsV2Repositories({
      mode: 'postgres-storage-local-test',
      env: {
        CONTRACTS_V2_LOCAL_DATABASE: 'true',
        CONTRACTS_V2_LOCAL_STORAGE: 'true',
        RUN_SUPABASE_LOCAL_INTEGRATION: 'true',
        LOVE_ODONTO_LOCAL_DB_CONFIRMATION: 'LOCAL_DISPOSABLE_ONLY',
      },
      supabaseUrl: 'http://127.0.0.1:54321',
      storageBucket: CONTRACTS_V2_PRIVATE_LOCAL_BUCKET,
      explicitLocalMarker: true,
    })).toThrow();
  });
});

describe('Phase 10.10 — factory', () => {
  it('memory mode expõe sessions/challenges/rateLimits/privateStorage', () => {
    const repos = createContractsV2Repositories({ mode: 'memory' });
    expect(repos.sessions).toBeTruthy();
    expect(repos.challenges).toBeTruthy();
    expect(repos.rateLimits).toBeTruthy();
    expect(repos.privateStorage).toBeTruthy();
  });

  it('unavailable não seleciona Postgres automaticamente', () => {
    const repos = createContractsV2Repositories({ mode: 'unavailable' });
    expect(repos.unavailable).toBe(true);
    expect(repos.sessions).toBeNull();
  });
});

describe('Phase 10.10 — session persistence (hash-only + restart)', () => {
  it('emite, valida, revoga e sobrevive a restart de service', async () => {
    const store = new Map();
    const clock = controllableClock(Date.parse('2026-08-03T12:00:00.000Z'));
    const repo = createMemorySigningSessionRepository(store);
    const svc1 = createPersistedSigningSessionTokenService(repo, clock, {
      deterministicToken: 'tok_phase1010',
    });

    const issued = await svc1.issue({
      tenantId: '11111111-1111-4111-8111-111111111111',
      envelopeId: '22222222-2222-4222-8222-222222222222',
      signerId: '33333333-3333-4333-8333-333333333333',
      expiresAt: '2026-08-03T14:00:00.000Z',
    });

    expect(issued.token).toBeTruthy();
    expect(issued.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    for (const row of store.values()) {
      expect(JSON.stringify(row)).not.toContain(issued.token);
      expect(row.tokenHash).toBe(issued.tokenHash);
    }

    // restart: novo service, mesmo store
    const svc2 = createPersistedSigningSessionTokenService(repo, clock);
    const validated = await svc2.validate(issued.token);
    expect(validated.tokenId).toBe(issued.tokenId);
    expect(validated.signerId).toBe('33333333-3333-4333-8333-333333333333');

    await svc2.revoke(issued.tokenId);
    const svc3 = createPersistedSigningSessionTokenService(repo, clock);
    await expect(svc3.validate(issued.token)).rejects.toMatchObject({
      code: 'SIGNATURE_SESSION_REVOKED',
    });
  });

  it('expiração e consumo bloqueiam replay após restart', async () => {
    const store = new Map();
    const clock = controllableClock(Date.parse('2026-08-03T12:00:00.000Z'));
    const repo = createMemorySigningSessionRepository(store);
    const svc = createPersistedSigningSessionTokenService(repo, clock, {
      deterministicToken: 'tok_exp',
    });
    const issued = await svc.issue({
      tenantId: '11111111-1111-4111-8111-111111111111',
      envelopeId: '22222222-2222-4222-8222-222222222222',
      signerId: '33333333-3333-4333-8333-333333333333',
      expiresAt: '2026-08-03T12:30:00.000Z',
    });
    clock.advance(40 * 60_000);
    const svc2 = createPersistedSigningSessionTokenService(repo, clock);
    await expect(svc2.validate(issued.token)).rejects.toMatchObject({
      code: 'SIGNATURE_SESSION_EXPIRED',
    });
  });

  it('hashSigningSessionToken é estável e SHA-256', async () => {
    const a = await hashSigningSessionToken('abc');
    const b = await hashSigningSessionToken('abc');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('Phase 10.10 — challenge persistence (OTP hash-only + restart)', () => {
  it('cria, falha tentativa, reinicia e mantém contador; replay bloqueado', async () => {
    const store = new Map();
    const clock = controllableClock(Date.parse('2026-08-03T12:00:00.000Z'));
    const repo = createMemorySignatureAuthenticationChallengeRepository(store);
    const sessionId = '44444444-4444-4444-8444-444444444444';
    const svc1 = createPersistedSignatureAuthenticationChallengeService(repo, clock, {
      deterministicCode: '123456',
      exposePlainCodeInTests: true,
    });

    const created = await svc1.createChallenge({
      tenantId: '11111111-1111-4111-8111-111111111111',
      envelopeId: '22222222-2222-4222-8222-222222222222',
      signerId: '33333333-3333-4333-8333-333333333333',
      sessionId,
      method: 'OTP_EMAIL',
      maxAttempts: 3,
      expiresAt: '2026-08-03T13:00:00.000Z',
    });
    expect(created.testOnlyPlainCode).toBe('123456');
    for (const row of store.values()) {
      expect(JSON.stringify(row)).not.toContain('123456');
      expect(row.codeHash).toMatch(/^[a-f0-9]{64}$/);
    }

    const fail1 = await svc1.verifyChallenge({
      tenantId: '11111111-1111-4111-8111-111111111111',
      challengeId: created.challengeId,
      code: '000000',
      envelopeId: '22222222-2222-4222-8222-222222222222',
      signerId: '33333333-3333-4333-8333-333333333333',
    });
    expect(fail1.valid).toBe(false);
    expect(fail1.attemptsRemaining).toBe(2);

    const svc2 = createPersistedSignatureAuthenticationChallengeService(repo, clock, {
      exposePlainCodeInTests: true,
    });
    const ok = await svc2.verifyChallenge({
      tenantId: '11111111-1111-4111-8111-111111111111',
      challengeId: created.challengeId,
      code: '123456',
      envelopeId: '22222222-2222-4222-8222-222222222222',
      signerId: '33333333-3333-4333-8333-333333333333',
    });
    expect(ok.valid).toBe(true);

    const svc3 = createPersistedSignatureAuthenticationChallengeService(repo, clock);
    const replay = await svc3.verifyChallenge({
      tenantId: '11111111-1111-4111-8111-111111111111',
      challengeId: created.challengeId,
      code: '123456',
      envelopeId: '22222222-2222-4222-8222-222222222222',
      signerId: '33333333-3333-4333-8333-333333333333',
    });
    expect(replay.valid).toBe(false);
    expect(replay.errorCode).toBe('SIGNATURE_CHALLENGE_ALREADY_CONSUMED');
  });

  it('hash OTP nunca igual ao código bruto', async () => {
    const h = await hashSignatureOtpCode('654321');
    expect(h).not.toBe('654321');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('Phase 10.10 — rate limit persistido + restart', () => {
  it('contador permanece após restart e bloqueia operação', async () => {
    const store = new Map();
    const clock = controllableClock(Date.parse('2026-08-03T12:00:00.000Z'));
    const repo = createMemorySignatureRateLimitRepository(store);
    const svc1 = createSignatureRateLimitService(repo, {
      clock,
      limits: {
        REQUEST_CHALLENGE: { windowMs: 60_000, maxRequests: 2, blockMs: 120_000 },
      },
    });
    const scope = buildSignatureRateLimitScope({
      envelopeId: 'env-a',
      signerId: 'sig-a',
    });
    const tenantId = '11111111-1111-4111-8111-111111111111';

    expect((await svc1.checkAndConsume({
      tenantId, scopeKey: scope, operation: 'REQUEST_CHALLENGE',
    })).allowed).toBe(true);
    expect((await svc1.checkAndConsume({
      tenantId, scopeKey: scope, operation: 'REQUEST_CHALLENGE',
    })).allowed).toBe(true);

    const svc2 = createSignatureRateLimitService(repo, {
      clock,
      limits: {
        REQUEST_CHALLENGE: { windowMs: 60_000, maxRequests: 2, blockMs: 120_000 },
      },
    });
    const blocked = await svc2.checkAndConsume({
      tenantId, scopeKey: scope, operation: 'REQUEST_CHALLENGE',
    });
    expect(blocked.allowed).toBe(false);

    // outro signer isolado
    const other = await svc2.checkAndConsume({
      tenantId,
      scopeKey: buildSignatureRateLimitScope({ envelopeId: 'env-a', signerId: 'sig-b' }),
      operation: 'REQUEST_CHALLENGE',
    });
    expect(other.allowed).toBe(true);
  });
});

describe('Phase 10.10 — private storage saga + reconciliation', () => {
  function memoryFileRepo() {
    const files = new Map();
    return {
      files,
      async create(tenantId, file) {
        const copy = { ...file, tenantId, rowVersion: 1 };
        files.set(`${tenantId}::${file.id}`, copy);
        return { ...copy };
      },
      async findById(tenantId, fileId) {
        const f = files.get(`${tenantId}::${fileId}`);
        return f ? { ...f } : null;
      },
      async updateStatus(tenantId, fileId, patch) {
        const key = `${tenantId}::${fileId}`;
        const cur = files.get(key);
        if (!cur) throw new Error('missing');
        const next = { ...cur, ...patch, rowVersion: (cur.rowVersion || 1) + 1 };
        files.set(key, next);
        return { ...next };
      },
      async listByContract(tenantId, contractId) {
        return [...files.values()].filter(
          (f) => f.tenantId === tenantId && f.contractId === contractId,
        );
      },
      async softDelete(tenantId, fileId, deletedAt) {
        return this.updateStatus(tenantId, fileId, { status: 'DELETED', deletedAt });
      },
    };
  }

  it('upload → verify → download; rejeita data URL e MIME inválido', async () => {
    const driver = createMemoryObjectStorageDriver();
    const fileRepo = memoryFileRepo();
    const ops = [];
    const storage = createSupabaseContractPrivateStorage({
      mode: 'local-test',
      bucket: CONTRACTS_V2_PRIVATE_LOCAL_BUCKET,
      driver,
      fileRepository: fileRepo,
      opsLedger: {
        async append(e) { ops.push(e); },
      },
    });

    const bytes = pngBytes(128);
    const hash = await sha256Bytes(bytes);
    const tenantId = '11111111-1111-4111-8111-111111111111';

    await expect(storage.put(tenantId, {
      contractId: 'ctr_1',
      contractVersionId: 'ver_1',
      fileType: 'SIGNATURE_IMAGE',
      purpose: 'SIGNATURE_EVIDENCE',
      binary: {
        bytes,
        mimeType: 'data:image/png;base64,xxx',
        sizeBytes: bytes.byteLength,
        sha256: hash,
      },
      contractNumber: 'CTR-1',
      versionNumber: 1,
      createdBy: 'tester',
    })).rejects.toBeTruthy();

    const { artifact } = await storage.put(tenantId, {
      contractId: 'ctr_1',
      contractVersionId: 'ver_1',
      fileType: 'SIGNATURE_IMAGE',
      purpose: 'SIGNATURE_EVIDENCE',
      binary: {
        bytes,
        mimeType: 'image/png',
        sizeBytes: bytes.byteLength,
        sha256: hash,
      },
      contractNumber: 'CTR-1',
      versionNumber: 1,
      createdBy: 'tester',
    });
    expect(artifact.status).toBe('VERIFIED');
    expect(artifact.storageReference.storageBucket).toBe(CONTRACTS_V2_PRIVATE_LOCAL_BUCKET);
    expect(ops.some((o) => o.eventType === 'FILE_UPLOAD_COMPLETED')).toBe(true);
    expect(ops.some((o) => o.eventType === 'FILE_VERIFIED')).toBe(true);

    // restart storage com mesmo driver/repo
    const storage2 = createSupabaseContractPrivateStorage({
      mode: 'local-test',
      bucket: CONTRACTS_V2_PRIVATE_LOCAL_BUCKET,
      driver,
      fileRepository: fileRepo,
    });
    const dl = await storage2.getAuthorizedDownload(tenantId, artifact.id, {
      userId: 'u1',
      permissions: ['contracts:download'],
    });
    expect(dl.sha256).toBe(hash);
    expect(dl.bytes.byteLength).toBe(bytes.byteLength);

    // cross-tenant negado
    await expect(storage2.getAuthorizedDownload(
      '99999999-9999-4999-8999-999999999999',
      artifact.id,
      { userId: 'u1', permissions: ['contracts:download'] },
    )).rejects.toBeTruthy();
  });

  it('upload falha → metadata FAILED; reconciliação detecta inconsistências', async () => {
    const driver = createMemoryObjectStorageDriver();
    const origUpload = driver.upload.bind(driver);
    let failUpload = true;
    driver.upload = async (...args) => {
      if (failUpload) throw new Error('upload boom');
      return origUpload(...args);
    };
    const fileRepo = memoryFileRepo();
    const storage = createSupabaseContractPrivateStorage({
      mode: 'local-test',
      bucket: CONTRACTS_V2_PRIVATE_LOCAL_BUCKET,
      driver,
      fileRepository: fileRepo,
    });
    const bytes = pngBytes(64);
    const hash = await sha256Bytes(bytes);
    await expect(storage.put('11111111-1111-4111-8111-111111111111', {
      contractId: 'ctr_2',
      contractVersionId: 'ver_2',
      fileType: 'SIGNATURE_IMAGE',
      purpose: 'SIGNATURE_EVIDENCE',
      binary: { bytes, mimeType: 'image/png', sizeBytes: bytes.byteLength, sha256: hash },
      contractNumber: 'CTR-2',
      versionNumber: 1,
      createdBy: 'tester',
    })).rejects.toBeTruthy();

    const pendingOrFailed = [...fileRepo.files.values()];
    expect(pendingOrFailed.some((f) => f.status === 'FAILED')).toBe(true);

    failUpload = false;
    const pdfBytes = new TextEncoder().encode('%PDF-1.4 test');
    const { artifact } = await storage.put('11111111-1111-4111-8111-111111111111', {
      contractId: 'ctr_2',
      contractVersionId: 'ver_2',
      fileType: 'SIGNED_PDF',
      purpose: 'DOCUMENT_OUTPUT',
      binary: {
        bytes: pdfBytes,
        mimeType: 'application/pdf',
        sizeBytes: pdfBytes.byteLength,
        sha256: await sha256Bytes(pdfBytes),
      },
      contractNumber: 'CTR-2',
      versionNumber: 1,
      createdBy: 'tester',
    });

    // simula metadata sem objeto
    await driver.remove(artifact.storageReference.storagePath);
    const recon = createContractFileReconciliationService({
      listFiles: (tid, cid) => fileRepo.listByContract(tid, cid),
      driver,
    });
    const result = await recon.inspect('11111111-1111-4111-8111-111111111111', 'ctr_2');
    expect(result.issues.length).toBeGreaterThan(0);
    const plan = recon.planRepair(result);
    expect(plan.every((a) => a.autoExecuted === false)).toBe(true);
  });
});

describe('Phase 10.10 — signature graphic artifact', () => {
  it('aceita PNG e rejeita SVG/base64', async () => {
    const storage = createMemoryContractPrivateStorage();
    const svc = createSignatureGraphicArtifactService(storage);
    const bytes = pngBytes(200);
    const hash = await sha256Bytes(bytes);
    const ref = await svc.store({
      tenantId: '11111111-1111-4111-8111-111111111111',
      contractId: 'ctr_g',
      contractVersionId: 'ver_g',
      envelopeId: 'env_g',
      signerId: 'sig_g',
      contractNumber: 'CTR-G',
      versionNumber: 1,
      createdBy: 'tester',
      binary: { bytes, mimeType: 'image/png', sizeBytes: bytes.byteLength, sha256: hash },
      expectedTenantId: '11111111-1111-4111-8111-111111111111',
      expectedSignerId: 'sig_g',
    });
    expect(ref.fileId).toBeTruthy();
    expect(ref.sha256).toBe(hash);

    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await expect(svc.store({
      tenantId: '11111111-1111-4111-8111-111111111111',
      contractId: 'ctr_g',
      contractVersionId: 'ver_g',
      contractNumber: 'CTR-G',
      versionNumber: 1,
      createdBy: 'tester',
      binary: {
        bytes: svg,
        mimeType: 'image/svg+xml',
        sizeBytes: svg.byteLength,
        sha256: await sha256Bytes(svg),
      },
    })).rejects.toBeTruthy();
  });
});

describe('Phase 10.10 — migrations e mirrors', () => {
  const names = [
    '032_app_signature_sessions_and_challenges.sql',
    '033_app_contract_private_storage_local.sql',
  ];

  it('migrations 032/033 existem e espelhos batem (quando presentes)', () => {
    for (const name of names) {
      const app = path.join(ROOT, 'supabase/migrations', name);
      expect(fs.existsSync(app)).toBe(true);
      const sql = fs.readFileSync(app, 'utf8');
      expect(sql).not.toMatch(/uoepkwhqztmsjnzirpev/);
      expect(sql).not.toMatch(/tckdjyunwmdpqmewrwvt/);
      if (name.startsWith('032')) {
        expect(sql).toContain('app_signature_sessions');
        expect(sql).toContain('app_signature_challenges');
        expect(sql).toContain('app_signature_rate_limits');
        expect(sql).toContain('token_hash');
        expect(sql).toContain('code_hash');
      }
      if (name.startsWith('033')) {
        expect(sql).toContain('contracts-v2-private-local');
        expect(sql).toContain('app_contract_storage_ops');
        expect(sql).toContain("public = false");
      }

      const mirrors = [
        path.join(ROOT, 'supabase-local/migrations', name),
        path.join(ROOT, 'supabase-local/supabase/migrations', name),
      ];
      for (const m of mirrors) {
        if (fs.existsSync(m)) {
          expect(sha256File(m)).toBe(sha256File(app));
        }
      }
    }

    expect(CONTRACT_V2_TABLES.SIGNATURE_SESSIONS).toBe('app_signature_sessions');
    expect(CONTRACT_V2_TABLES.SIGNATURE_CHALLENGES).toBe('app_signature_challenges');
    expect(CONTRACTS_V2_PRIVATE_LOCAL_BUCKET).toBe('contracts-v2-private-local');
  });
});

describe('Phase 10.10 — integração local opt-in', () => {
  it('pula sem marcadores (não aplica remoto)', () => {
    expect(process.env.CONTRACTS_V2_LOCAL_DATABASE).not.toBe('true');
  });
});
