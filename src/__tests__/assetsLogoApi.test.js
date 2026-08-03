import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AssetsLogoProfileError,
  AssetsLogoRollbackError,
  AssetsLogoValidationError,
  CLINIC_LOGOS_BUCKET,
  LOGO_MAX_BYTES,
  PRODUCTION_PROJECT_REF,
  buildLogoObjectPath,
  createAssetsLogoHandler,
  detectImageMimeFromBuffer,
  uploadLogoAsset,
  validateLogoFileInput,
} from '../../server/lib/assetsLogoApi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const TENANT_A = '7aba7127-409c-4ea4-8dbc-807efc5e189c';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const JPEG_MIN = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'
  + 'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIy'
  + 'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA'
  + 'AhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEB'
  + 'AQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A'
  + '/9k=',
  'base64',
);

const WEBP_MIN = Buffer.from(
  'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/vuUAAA=',
  'base64',
);

function buildLogoMockSupabase({
  existingProfile = {
    tenant_id: TENANT_A,
    logo_url: 'https://old.example/logo.png',
    name: 'Clínica Teste',
    email: 'admin@clinic.test',
  },
  profileExists = true,
  profileUpdateShouldFail = false,
  storageUploadShouldFail = false,
  rollbackDeleteShouldFail = false,
} = {}) {
  const writes = { storage: [], profiles: [] };

  return {
    writes,
    storage: {
      from(bucket) {
        return {
          upload(objectPath, buffer, opts) {
            writes.storage.push({ op: 'upload', bucket, objectPath, size: buffer.length, opts });
            if (storageUploadShouldFail) {
              return Promise.resolve({ error: { message: 'storage upload failed' } });
            }
            return Promise.resolve({ error: null });
          },
          getPublicUrl(objectPath) {
            return {
              data: {
                publicUrl: `https://staging.example/storage/v1/object/public/${bucket}/${objectPath}`,
              },
            };
          },
          remove(paths) {
            writes.storage.push({ op: 'remove', paths });
            if (rollbackDeleteShouldFail) {
              return Promise.resolve({ error: { message: 'delete failed' } });
            }
            return Promise.resolve({ error: null });
          },
        };
      },
    },
    from(table) {
      if (table !== 'clinic_profiles') throw new Error(`unexpected table ${table}`);
      return {
        update(payload) {
          writes.profiles.push({ op: 'update', payload: { ...payload } });
          if (profileUpdateShouldFail) {
            return {
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: null, error: { message: 'profile update failed' } }),
                }),
              }),
            };
          }
          return {
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: profileExists
                    ? { ...existingProfile, logo_url: payload.logo_url }
                    : null,
                  error: null,
                }),
              }),
            }),
          };
        },
        insert(payload) {
          writes.profiles.push({ op: 'insert', payload: { ...payload } });
          return {
            select: () => ({
              single: async () => ({
                data: {
                  tenant_id: payload.tenant_id,
                  logo_url: payload.logo_url,
                  name: payload.name,
                },
                error: null,
              }),
            }),
          };
        },
      };
    },
  };
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('assetsLogoApi — validateLogoFileInput', () => {
  it('detecta png/jpeg/webp', () => {
    expect(detectImageMimeFromBuffer(PNG_1X1)).toBe('image/png');
    expect(detectImageMimeFromBuffer(JPEG_MIN)).toBe('image/jpeg');
    expect(detectImageMimeFromBuffer(WEBP_MIN)).toBe('image/webp');
  });

  it('rejeita MIME inválido', () => {
    expect(() => validateLogoFileInput({
      buffer: Buffer.from('%PDF-1.4'),
      mimeType: 'application/pdf',
      filename: 'x.pdf',
    })).toThrow(AssetsLogoValidationError);
  });

  it('rejeita extensão inválida', () => {
    expect(() => validateLogoFileInput({
      buffer: PNG_1X1,
      mimeType: 'image/png',
      filename: 'logo.svg',
    })).toThrow(AssetsLogoValidationError);
  });

  it('rejeita base64 no buffer', () => {
    expect(() => validateLogoFileInput({
      buffer: Buffer.from('data:image/png;base64,abc'),
      mimeType: 'text/plain',
      filename: 'logo.png',
    })).toThrow(AssetsLogoValidationError);
  });

  it('rejeita >2MB', () => {
    const big = Buffer.alloc(LOGO_MAX_BYTES + 1, 0);
    big[0] = 0x89;
    big[1] = 0x50;
    big[2] = 0x4e;
    big[3] = 0x47;
    expect(() => validateLogoFileInput({
      buffer: big,
      mimeType: 'image/png',
      filename: 'big.png',
    })).toThrow(AssetsLogoValidationError);
  });

  it('aceita png/jpeg/webp', () => {
    expect(validateLogoFileInput({ buffer: PNG_1X1, mimeType: 'image/png', filename: 'a.png' }).mimeType).toBe('image/png');
    expect(validateLogoFileInput({ buffer: JPEG_MIN, mimeType: 'image/jpeg', filename: 'a.jpg' }).mimeType).toBe('image/jpeg');
    expect(validateLogoFileInput({ buffer: WEBP_MIN, mimeType: 'image/webp', filename: 'a.webp' }).mimeType).toBe('image/webp');
  });
});

describe('assetsLogoApi — uploadLogoAsset', () => {
  it('usa path {tenant_id}/logo.webp e bucket clinic-logos', async () => {
    const supabase = buildLogoMockSupabase();
    const result = await uploadLogoAsset({
      supabase,
      tenantId: TENANT_A,
      buffer: WEBP_MIN,
      mimeType: 'image/webp',
      filename: 'logo.webp',
    });
    expect(result.path).toBe(`${TENANT_A}/logo.webp`);
    expect(supabase.writes.storage[0].bucket).toBe(CLINIC_LOGOS_BUCKET);
    expect(supabase.writes.storage[0].objectPath).toBe(buildLogoObjectPath(TENANT_A));
  });

  it('atualiza clinic_profiles.logo_url', async () => {
    const supabase = buildLogoMockSupabase();
    const result = await uploadLogoAsset({
      supabase,
      tenantId: TENANT_A,
      buffer: PNG_1X1,
      mimeType: 'image/png',
      filename: 'logo.png',
    });
    expect(supabase.writes.profiles[0].op).toBe('update');
    expect(supabase.writes.profiles[0].payload.logo_url).toBe(result.url);
    expect(supabase.writes.profiles[0].payload).not.toHaveProperty('name');
    expect(supabase.writes.profiles[0].payload).not.toHaveProperty('email');
  });

  it('rollback delete storage se update profile falhar', async () => {
    const supabase = buildLogoMockSupabase({ profileUpdateShouldFail: true });
    await expect(uploadLogoAsset({
      supabase,
      tenantId: TENANT_A,
      buffer: PNG_1X1,
      mimeType: 'image/png',
      filename: 'logo.png',
    })).rejects.toBeInstanceOf(AssetsLogoProfileError);
    expect(supabase.writes.storage.some((w) => w.op === 'remove')).toBe(true);
  });

  it('503 ROLLBACK_FAILED', async () => {
    const supabase = buildLogoMockSupabase({
      profileUpdateShouldFail: true,
      rollbackDeleteShouldFail: true,
    });
    await expect(uploadLogoAsset({
      supabase,
      tenantId: TENANT_A,
      buffer: PNG_1X1,
      mimeType: 'image/png',
      filename: 'logo.png',
    })).rejects.toBeInstanceOf(AssetsLogoRollbackError);
  });
});

describe('assetsLogoApi — HTTP handler', () => {
  const getTenantAdminActorOrThrow = vi.fn();
  const parseMultipart = vi.fn();
  const logAssetAudit = vi.fn();
  let supabase;
  let handler;

  beforeEach(() => {
    getTenantAdminActorOrThrow.mockReset();
    parseMultipart.mockReset();
    logAssetAudit.mockReset();
    supabase = buildLogoMockSupabase();
    getTenantAdminActorOrThrow.mockResolvedValue({ tenant_id: TENANT_A, role: 'master' });
    parseMultipart.mockResolvedValue({
      buffer: WEBP_MIN,
      mimeType: 'image/webp',
      filename: 'logo.webp',
      fields: {},
    });
    handler = createAssetsLogoHandler({
      supabase,
      getTenantAdminActorOrThrow,
      parseMultipart,
      logAssetAudit,
    });
  });

  it('401 sem auth', async () => {
    const res = mockRes();
    await handler({ appAuthUser: null, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('403 sem admin', async () => {
    getTenantAdminActorOrThrow.mockRejectedValue(
      new Error('Apenas administradores da clínica podem executar esta ação.'),
    );
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-1' }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('ADMIN_REQUIRED');
  });

  it('400 tenant_id na query', async () => {
    const res = mockRes();
    await handler({
      appAuthUser: { id: 'auth-admin' },
      query: { tenant_id: TENANT_A },
      headers: {},
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('TENANT_QUERY_FORBIDDEN');
  });

  it('400 tenant_id no multipart', async () => {
    parseMultipart.mockResolvedValue({
      buffer: WEBP_MIN,
      mimeType: 'image/webp',
      filename: 'logo.webp',
      fields: { tenant_id: TENANT_A },
    });
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-admin' }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('TENANT_BODY_FORBIDDEN');
  });

  it('400 multipart inválido', async () => {
    parseMultipart.mockRejectedValue(
      new AssetsLogoValidationError('Content-Type multipart/form-data é obrigatório.', 'UNSUPPORTED_MEDIA_TYPE'),
    );
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-admin' }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 file ausente', async () => {
    parseMultipart.mockRejectedValue(
      new AssetsLogoValidationError('Campo file é obrigatório.', 'PAYLOAD_INVALID'),
    );
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-admin' }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('PAYLOAD_INVALID');
  });

  it('400 MIME inválido', async () => {
    parseMultipart.mockResolvedValue({
      buffer: Buffer.from('%PDF-1.4 fake'),
      mimeType: 'application/pdf',
      filename: 'logo.png',
      fields: {},
    });
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-admin' }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_FILE_TYPE');
  });

  it('413 >2MB', async () => {
    const big = Buffer.alloc(LOGO_MAX_BYTES + 1, 0);
    big[0] = 0x89;
    big[1] = 0x50;
    big[2] = 0x4e;
    big[3] = 0x47;
    parseMultipart.mockResolvedValue({
      buffer: big,
      mimeType: 'image/png',
      filename: 'big.png',
      fields: {},
    });
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-admin' }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(413);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
  });

  it('200 envelope correto', async () => {
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-admin' }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({
      asset_type: 'logo',
      path: `${TENANT_A}/logo.webp`,
      url_type: 'public',
    });
    expect(res.body.meta.audit_event).toBe('ASSET_LOGO_UPLOADED');
    expect(res.body.meta.updated_by).toBe('auth-admin');
    expect(logAssetAudit).toHaveBeenCalled();
  });

  it('usa req.tenantContext quando middleware já resolveu tenant admin', async () => {
    const res = mockRes();
    await handler({
      appAuthUser: { id: 'auth-admin' },
      query: {},
      headers: {},
      tenantContext: { tenantId: TENANT_A, mode: 'admin' },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.meta.tenant_id).toBe(TENANT_A);
    expect(getTenantAdminActorOrThrow).not.toHaveBeenCalled();
  });

  it('500 storage upload failed', async () => {
    supabase = buildLogoMockSupabase({ storageUploadShouldFail: true });
    handler = createAssetsLogoHandler({
      supabase,
      getTenantAdminActorOrThrow,
      parseMultipart,
    });
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-admin' }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('STORAGE_UPLOAD_FAILED');
  });
});

describe('assetsLogoApi — segurança operacional', () => {
  it('não usa IndexedDB', () => {
    const content = fs.readFileSync(path.join(REPO_ROOT, 'server/lib/assetsLogoApi.js'), 'utf8');
    expect(content).not.toMatch(/\b(withDb|loadDb|indexedDB)\s*\(/i);
  });

  it('produção intocada', () => {
    const content = fs.readFileSync(path.join(REPO_ROOT, 'server/lib/assetsLogoApi.js'), 'utf8');
    expect(content).toContain(PRODUCTION_PROJECT_REF);
    expect(content).not.toMatch(new RegExp(`supabase\\.co.*${PRODUCTION_PROJECT_REF}`));
  });

  it('registra rota POST assets/logo com core auth/tenant', () => {
    const content = fs.readFileSync(path.join(REPO_ROOT, 'server/index.js'), 'utf8');
    expect(content).toMatch(/app\.post\(\s*['"]\/internal\/app\/assets\/logo['"]/);
    expect(content).toContain('createAssetsLogoHandler');
    expect(content).toContain('requireAppUserAssetsWrite');
    expect(content).toContain('requireTenantAdminAssetsWrite');
  });
});
