/**
 * PHASE_10.21AI — production private storage runtime binding (fail-closed).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createContractStoragePathBuilder,
  createMemoryObjectStorageDriver,
  createSupabaseContractPrivateStorage,
  loadContractsV2EnvironmentConfig,
  resolveContractsV2PrivateStorageBinding,
  resolvePackageArtifactStorageTarget,
  sha256Bytes,
  CONTRACTS_V2_PACKAGE_ARTIFACT_KINDS,
  CONTRACTS_V2_PRIVATE_LOCAL_BUCKET,
  CONTRACTS_V2_PRIVATE_PRODUCTION_BUCKET,
  CONTRACTS_V2_PRIVATE_STAGING_BUCKET,
  CONTRACTS_V2_PRODUCTION_PROJECT_REF,
  CONTRACTS_V2_STAGING_PROJECT_REF,
} from '../domain/contracts/index.ts';
import { resolveContractsV2PrivateStorageBinding as resolveServerBinding } from '../../server/lib/contractsV2PrivateStorageBinding.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PROD_URL = `https://${CONTRACTS_V2_PRODUCTION_PROJECT_REF}.supabase.co`;
const STAGING_URL = `https://${CONTRACTS_V2_STAGING_PROJECT_REF}.supabase.co`;
const PILOTO = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const OTHER = 'f2615848-d67d-4a87-96f1-508049953b84';

function productionEnv(extra = {}) {
  return {
    CONTRACTS_V2_RUNTIME_MODE: 'disabled',
    CONTRACTS_V2_STORAGE_MODE: 'private-production',
    CONTRACTS_V2_PRIVATE_BUCKET: CONTRACTS_V2_PRIVATE_PRODUCTION_BUCKET,
    SUPABASE_URL: PROD_URL,
    SUPABASE_PROJECT_REF: CONTRACTS_V2_PRODUCTION_PROJECT_REF,
    ...extra,
  };
}

function pngBytes(size = 64) {
  const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const out = new Uint8Array(size);
  out.set(header);
  for (let i = header.length; i < size; i += 1) out[i] = i % 251;
  return out;
}

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
      return [...files.values()].filter((f) => f.tenantId === tenantId && f.contractId === contractId);
    },
    async softDelete(tenantId, fileId, deletedAt) {
      return this.updateStatus(tenantId, fileId, { status: 'DELETED', deletedAt });
    },
  };
}

describe('PHASE_10.21AI production private storage runtime binding', () => {
  it('1. production → production bucket', () => {
    const binding = resolveContractsV2PrivateStorageBinding(productionEnv());
    expect(binding.ok).toBe(true);
    expect(binding.bound).toBe(true);
    expect(binding.bucket).toBe(CONTRACTS_V2_PRIVATE_PRODUCTION_BUCKET);
    expect(loadContractsV2EnvironmentConfig(productionEnv()).ok).toBe(true);
    expect(loadContractsV2EnvironmentConfig(productionEnv()).config.privateBucket)
      .toBe(CONTRACTS_V2_PRIVATE_PRODUCTION_BUCKET);
  });

  it('2. staging → staging bucket', () => {
    const env = {
      CONTRACTS_V2_RUNTIME_MODE: 'staging-disabled',
      CONTRACTS_V2_STORAGE_MODE: 'private-staging-configured',
      CONTRACTS_V2_PRIVATE_BUCKET: CONTRACTS_V2_PRIVATE_STAGING_BUCKET,
      CONTRACTS_V2_DATABASE_MODE: 'postgres-staging-disabled',
      CONTRACTS_V2_RATE_LIMIT_MODE: 'persisted',
      CONTRACTS_V2_PUBLIC_ALLOWED_ORIGINS: 'https://staging.example.com',
      CONTRACTS_V2_PUBLIC_BASE_URL: 'https://staging.example.com',
      CONTRACTS_V2_SIGNING_TOKEN_SECRET: 's'.repeat(32),
      CONTRACTS_V2_TRUST_PROXY: '1',
      SUPABASE_URL: STAGING_URL,
    };
    const binding = resolveContractsV2PrivateStorageBinding(env);
    expect(binding.ok).toBe(true);
    expect(binding.bucket).toBe(CONTRACTS_V2_PRIVATE_STAGING_BUCKET);
    expect(loadContractsV2EnvironmentConfig(env).ok).toBe(true);
  });

  it('3. local → local bucket', () => {
    const env = {
      CONTRACTS_V2_STORAGE_MODE: 'private-local',
      CONTRACTS_V2_PRIVATE_BUCKET: CONTRACTS_V2_PRIVATE_LOCAL_BUCKET,
    };
    const binding = resolveContractsV2PrivateStorageBinding(env);
    expect(binding.ok).toBe(true);
    expect(binding.bucket).toBe(CONTRACTS_V2_PRIVATE_LOCAL_BUCKET);
  });

  it('4. production não cai para staging', () => {
    const binding = resolveContractsV2PrivateStorageBinding(productionEnv({
      CONTRACTS_V2_PRIVATE_BUCKET: CONTRACTS_V2_PRIVATE_STAGING_BUCKET,
    }));
    expect(binding.ok).toBe(false);
    expect(binding.bound).toBe(false);
    expect(binding.code).toMatch(/BUCKET_MISMATCH|STAGING/);
  });

  it('5. production não cai para local', () => {
    const binding = resolveContractsV2PrivateStorageBinding(productionEnv({
      CONTRACTS_V2_PRIVATE_BUCKET: CONTRACTS_V2_PRIVATE_LOCAL_BUCKET,
    }));
    expect(binding.ok).toBe(false);
    expect(binding.bound).toBe(false);
    expect(loadContractsV2EnvironmentConfig(productionEnv({
      CONTRACTS_V2_STORAGE_MODE: 'private-local',
      CONTRACTS_V2_PRIVATE_BUCKET: CONTRACTS_V2_PRIVATE_LOCAL_BUCKET,
    })).ok).toBe(false);
  });

  it('6. production project incorreto → fail closed', () => {
    const stagingInProd = resolveContractsV2PrivateStorageBinding(productionEnv({
      SUPABASE_URL: STAGING_URL,
      SUPABASE_PROJECT_REF: CONTRACTS_V2_STAGING_PROJECT_REF,
    }));
    expect(stagingInProd.ok).toBe(false);
    expect(stagingInProd.code).toBe('CONTRACTS_V2_STAGING_REF_IN_PRODUCTION');

    const missingProject = resolveContractsV2PrivateStorageBinding({
      CONTRACTS_V2_STORAGE_MODE: 'private-production',
      CONTRACTS_V2_PRIVATE_BUCKET: CONTRACTS_V2_PRIVATE_PRODUCTION_BUCKET,
    });
    expect(missingProject.ok).toBe(false);
    expect(missingProject.code).toBe('CONTRACTS_V2_PRODUCTION_PROJECT_MISMATCH');
  });

  it('7. bucket ausente → fail closed', () => {
    const binding = resolveContractsV2PrivateStorageBinding(productionEnv({
      CONTRACTS_V2_PRIVATE_BUCKET: '',
    }));
    expect(binding.ok).toBe(false);
    expect(binding.code).toBe('CONTRACTS_V2_PRODUCTION_BUCKET_REQUIRED');
    expect(loadContractsV2EnvironmentConfig(productionEnv({
      CONTRACTS_V2_PRIVATE_BUCKET: undefined,
    })).ok).toBe(false);
  });

  it('8. own-tenant path correto', () => {
    const pathStr = createContractStoragePathBuilder().build({
      tenantId: PILOTO,
      contractId: 'contract-1',
      versionId: 'version-1',
      fileType: 'GENERATED_PDF',
      fileId: 'file-1',
      mimeType: 'application/pdf',
    });
    expect(pathStr.startsWith(`tenants/${PILOTO}/contracts/`)).toBe(true);
    expect(pathStr).not.toContain('..');
  });

  it('9. cross-tenant path rejeitado no download', async () => {
    const driver = createMemoryObjectStorageDriver();
    const storage = createSupabaseContractPrivateStorage({
      mode: 'private-production',
      bucket: CONTRACTS_V2_PRIVATE_PRODUCTION_BUCKET,
      driver,
      fileRepository: memoryFileRepo(),
    });
    const bytes = pngBytes(96);
    const hash = await sha256Bytes(bytes);
    const { artifact } = await storage.put(PILOTO, {
      contractId: 'ctr_ai',
      contractVersionId: 'ver_ai',
      fileType: 'SIGNATURE_IMAGE',
      purpose: 'SIGNATURE_EVIDENCE',
      binary: { bytes, mimeType: 'image/png', sizeBytes: bytes.byteLength, sha256: hash },
      contractNumber: 'CTR-AI',
      versionNumber: 1,
      createdBy: 'tester',
    });
    expect(artifact.storageReference.storageBucket).toBe(CONTRACTS_V2_PRIVATE_PRODUCTION_BUCKET);
    expect(artifact.storageReference.storagePath.startsWith(`tenants/${PILOTO}/`)).toBe(true);

    await expect(storage.getAuthorizedDownload(OTHER, artifact.id, {
      userId: 'u1',
      permissions: ['contracts:download'],
    })).rejects.toMatchObject({ domainError: { code: 'CONTRACT_FILE_NOT_FOUND' } });
  });

  it('10. signed artifact access seguro (sem URL pública permanente)', async () => {
    const driver = createMemoryObjectStorageDriver();
    const signed = [];
    const orig = driver.createSignedUrl.bind(driver);
    driver.createSignedUrl = async (p, ttl) => {
      const result = await orig(p, ttl);
      signed.push(result);
      expect(result.url.startsWith('memory://')).toBe(true);
      expect(result.url).not.toMatch(/getPublicUrl|public$/i);
      return result;
    };
    const storage = createSupabaseContractPrivateStorage({
      mode: 'private-production',
      bucket: CONTRACTS_V2_PRIVATE_PRODUCTION_BUCKET,
      driver,
      fileRepository: memoryFileRepo(),
    });
    const bytes = pngBytes(80);
    const hash = await sha256Bytes(bytes);
    const { artifact } = await storage.put(PILOTO, {
      contractId: 'ctr_sign',
      contractVersionId: 'ver_sign',
      fileType: 'SIGNATURE_IMAGE',
      purpose: 'SIGNATURE_EVIDENCE',
      binary: { bytes, mimeType: 'image/png', sizeBytes: bytes.byteLength, sha256: hash },
      contractNumber: 'CTR-S',
      versionNumber: 1,
      createdBy: 'tester',
    });
    const dl = await storage.getAuthorizedDownload(PILOTO, artifact.id, {
      userId: 'u1',
      permissions: ['contracts:download'],
    });
    expect(dl.bytes.byteLength).toBe(bytes.byteLength);
    expect(dl.temporaryToken).toBeTruthy();
    expect(signed.length).toBeGreaterThan(0);
    const adapterSrc = fs.readFileSync(
      path.join(ROOT, 'src/domain/contracts/files/supabase-contract-private-storage.ts'),
      'utf8',
    );
    expect(adapterSrc).toContain('createSignedUrl');
    expect(adapterSrc).not.toMatch(/getPublicUrl/);
  });

  it('11. nenhuma secret exposta em frontend / payload público', () => {
    const viteFiles = [
      path.join(ROOT, '.env.example'),
      path.join(ROOT, 'src/domain/contracts/files/contracts-v2-private-storage-binding.ts'),
      path.join(ROOT, 'server/lib/contractsV2PrivateStorageBinding.js'),
      path.join(ROOT, 'server/index.js'),
    ];
    for (const file of viteFiles) {
      const src = fs.readFileSync(file, 'utf8');
      expect(src).not.toMatch(/VITE_SUPABASE_SERVICE_ROLE/);
      expect(src).not.toMatch(/VITE_CONTRACTS_V2_SIGNING_TOKEN_SECRET/);
      expect(src).not.toMatch(/VITE_CONTRACTS_V2_PRIVATE_BUCKET/);
    }
    const binding = resolveContractsV2PrivateStorageBinding(productionEnv({
      CONTRACTS_V2_SIGNING_TOKEN_SECRET: 'super-secret-value-not-for-logs',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-should-not-leak',
    }));
    const payload = JSON.stringify({
      ok: binding.ok,
      bound: binding.bound,
      bucket: binding.bucket,
      mode: binding.storageMode,
      code: binding.code,
    });
    expect(payload).not.toContain('super-secret-value-not-for-logs');
    expect(payload).not.toContain('service-role-should-not-leak');
  });

  it('12. V1 intacto — rotas públicas e login permanecem no App', () => {
    const app = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
    const protectedApp = fs.readFileSync(path.join(ROOT, 'src/ProtectedApp.jsx'), 'utf8');
    expect(app).toMatch(/\/login/);
    expect(app).toMatch(/\/assinatura\//);
    expect(protectedApp).toMatch(/\/pacientes/);
    expect(protectedApp).toMatch(/\/agenda/);
    expect(protectedApp).toMatch(/financeiro|orçamento|orcamento|budget/i);
  });

  it('package artifacts resolvem para o bucket production quando bound', () => {
    const binding = resolveContractsV2PrivateStorageBinding(productionEnv());
    for (const kind of CONTRACTS_V2_PACKAGE_ARTIFACT_KINDS) {
      const target = resolvePackageArtifactStorageTarget(binding, kind);
      expect(target.bucket).toBe(CONTRACTS_V2_PRIVATE_PRODUCTION_BUCKET);
    }
  });

  it('adapter rejeita mix de modo/bucket e server JS espelha o domínio', () => {
    expect(() => createSupabaseContractPrivateStorage({
      mode: 'private-production',
      bucket: CONTRACTS_V2_PRIVATE_LOCAL_BUCKET,
      driver: createMemoryObjectStorageDriver(),
      fileRepository: memoryFileRepo(),
    })).toThrow();

    expect(() => createSupabaseContractPrivateStorage({
      mode: 'local-test',
      bucket: CONTRACTS_V2_PRIVATE_PRODUCTION_BUCKET,
      driver: createMemoryObjectStorageDriver(),
      fileRepository: memoryFileRepo(),
    })).toThrow();

    const domain = resolveContractsV2PrivateStorageBinding(productionEnv());
    const server = resolveServerBinding(productionEnv());
    expect(server.bucket).toBe(domain.bucket);
    expect(server.ok).toBe(domain.ok);
    expect(server.code).toBe(domain.code);
  });

  it('unavailable em production project não faz fallback silencioso', () => {
    const binding = resolveContractsV2PrivateStorageBinding({
      SUPABASE_URL: PROD_URL,
      SUPABASE_PROJECT_REF: CONTRACTS_V2_PRODUCTION_PROJECT_REF,
    });
    expect(binding.ok).toBe(true);
    expect(binding.bound).toBe(false);
    expect(binding.bucket).toBe(null);
  });
});
