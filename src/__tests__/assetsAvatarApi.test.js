import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AVATAR_MAX_BYTES,
  AVATAR_SIGNED_URL_TTL_SECONDS,
  AssetsAvatarNotFoundError,
  AssetsAvatarProfileError,
  AssetsAvatarRollbackError,
  AssetsAvatarValidationError,
  COLLABORATOR_PHOTOS_BUCKET,
  PRODUCTION_PROJECT_REF,
  buildAvatarObjectPath,
  createAssetsAvatarGetHandler,
  createAssetsAvatarPostHandler,
  resolveAvatarObjectPathFromFotoUrl,
  uploadAvatarAsset,
} from '../../server/lib/assetsAvatarApi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const TENANT_A = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const TENANT_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const JULIANA_ID = 'a1000002-0002-4002-8002-000000000002';
const RENATA_ID = 'a1000003-0003-4003-8003-000000000003';
const MELISSA_ID = 'a1000004-0004-4004-8004-000000000004';
const PAULO_ID = 'a1000001-0001-4001-8001-000000000001';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const WEBP_MIN = Buffer.from(
  'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/vuUAAA=',
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

const COLLABORATORS = [
  {
    id: JULIANA_ID,
    tenant_id: TENANT_A,
    legacy_id: 'col-juliana-staging',
    email: 'juliana+staging@implanprime.test',
    apelido: 'Juliana',
    nome_completo: 'Juliana',
    status: 'ativo',
    foto_url: null,
    deleted_at: null,
  },
  {
    id: RENATA_ID,
    tenant_id: TENANT_A,
    legacy_id: 'col-renata-staging',
    email: 'renata+staging@implanprime.test',
    apelido: 'Renata',
    nome_completo: 'Renata',
    status: 'ativo',
    foto_url: `${TENANT_A}/collaborators/${RENATA_ID}/avatar.webp`,
    deleted_at: null,
  },
  {
    id: MELISSA_ID,
    tenant_id: TENANT_A,
    legacy_id: 'col-melissa-staging',
    email: 'melissa+staging@implanprime.test',
    apelido: 'Melissa',
    nome_completo: 'Melissa',
    status: 'inativo',
    foto_url: null,
    deleted_at: null,
  },
];

function buildAvatarMockSupabase({
  collaborators = COLLABORATORS,
  profileUpdateShouldFail = false,
  storageUploadShouldFail = false,
  rollbackDeleteShouldFail = false,
  signedUrlShouldFail = false,
} = {}) {
  const writes = { storage: [], collaborators: [] };

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
          createSignedUrl(objectPath, expiresIn) {
            writes.storage.push({ op: 'createSignedUrl', bucket, objectPath, expiresIn });
            if (signedUrlShouldFail) {
              return Promise.resolve({ data: null, error: { message: 'signed url failed' } });
            }
            return Promise.resolve({
              data: {
                signedUrl: `https://staging.example/storage/v1/object/sign/${bucket}/${objectPath}?token=abc`,
              },
              error: null,
            });
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
      if (table === 'tenant_users') {
        const buildEqChain = (filters = {}) => ({
          eq() { return buildEqChain(filters); },
          maybeSingle: async () => ({ data: null, error: null }),
          then(resolve, reject) {
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          },
        });
        return {
          select() { return buildEqChain(); },
        };
      }
      if (table !== 'collaborators') throw new Error(`unexpected table ${table}`);

      function collaboratorsChain(filters = {}) {
        const chain = {
          select() { return chain; },
          eq(field, value) {
            filters[field] = value;
            return chain;
          },
          is(field, value) {
            filters[`${field}__is`] = value;
            return chain;
          },
          update(payload) {
            writes.collaborators.push({ op: 'update', payload: { ...payload } });
            if (profileUpdateShouldFail) {
              return {
                eq: () => ({
                  eq: () => ({
                    is: () => ({
                      select: () => ({
                        maybeSingle: async () => ({ data: null, error: { message: 'update failed' } }),
                      }),
                    }),
                  }),
                }),
              };
            }
            return {
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    select: () => ({
                      maybeSingle: async () => {
                        const row = collaborators.find((c) => {
                          if (filters.id && c.id !== filters.id) return false;
                          if (filters.tenant_id && c.tenant_id !== filters.tenant_id) return false;
                          if (filters['deleted_at__is'] === null && c.deleted_at) return false;
                          return true;
                        });
                        return {
                          data: row
                            ? {
                              ...row,
                              foto_url: payload.foto_url ?? row.foto_url,
                            }
                            : null,
                          error: null,
                        };
                      },
                    }),
                  }),
                }),
              }),
            };
          },
          maybeSingle() {
            const row = collaborators.find((c) => {
              if (filters.tenant_id && c.tenant_id !== filters.tenant_id) return false;
              if (filters.id && c.id !== filters.id) return false;
              if (filters['deleted_at__is'] === null && c.deleted_at) return false;
              return true;
            });
            return Promise.resolve({ data: row || null, error: null });
          },
        };
        return chain;
      }

      return collaboratorsChain();
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

describe('assetsAvatarApi — helpers', () => {
  it('resolveAvatarObjectPathFromFotoUrl', () => {
    const path = `${TENANT_A}/collaborators/${JULIANA_ID}/avatar.webp`;
    expect(resolveAvatarObjectPathFromFotoUrl(path)).toBe(path);
    expect(resolveAvatarObjectPathFromFotoUrl(`collaborator-photos:${path}`)).toBe(path);
    expect(resolveAvatarObjectPathFromFotoUrl('https://cdn.example/x.jpg')).toBeNull();
    expect(resolveAvatarObjectPathFromFotoUrl('data:image/png;base64,x')).toBeNull();
  });
});

describe('assetsAvatarApi — uploadAvatarAsset', () => {
  it('path correto e bucket collaborator-photos', async () => {
    const supabase = buildAvatarMockSupabase();
    const collaborator = COLLABORATORS[0];
    const result = await uploadAvatarAsset({
      supabase,
      tenantId: TENANT_A,
      collaborator,
      buffer: WEBP_MIN,
      mimeType: 'image/webp',
      filename: 'a.webp',
    });
    expect(result.path).toBe(buildAvatarObjectPath(TENANT_A, JULIANA_ID));
    expect(supabase.writes.storage[0].bucket).toBe(COLLABORATOR_PHOTOS_BUCKET);
    expect(result.signed_url).toContain('/object/sign/');
    expect(result.signed_url_expires_in).toBe(AVATAR_SIGNED_URL_TTL_SECONDS);
    expect(result.url_type).toBe('signed');
  });

  it('atualiza collaborators.foto_url com storage path', async () => {
    const supabase = buildAvatarMockSupabase();
    await uploadAvatarAsset({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      buffer: PNG_1X1,
      mimeType: 'image/png',
      filename: 'photo.png',
    });
    const update = supabase.writes.collaborators[0];
    expect(update.op).toBe('update');
    expect(update.payload.foto_url).toBe(buildAvatarObjectPath(TENANT_A, JULIANA_ID));
    expect(update.payload.foto_url).not.toContain('token=');
    expect(update.payload).not.toHaveProperty('legacy_id');
    expect(update.payload).not.toHaveProperty('status');
    expect(update.payload).not.toHaveProperty('cargo');
  });

  it('aceita jpeg e webp', async () => {
    const supabase = buildAvatarMockSupabase();
    await expect(uploadAvatarAsset({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      buffer: JPEG_MIN,
      mimeType: 'image/jpeg',
      filename: 'photo.jpg',
    })).resolves.toMatchObject({ mime_type: 'image/jpeg' });

    await expect(uploadAvatarAsset({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      buffer: WEBP_MIN,
      mimeType: 'image/webp',
      filename: 'photo.webp',
    })).resolves.toMatchObject({ mime_type: 'image/webp' });
  });

  it('rollback se update falhar', async () => {
    const supabase = buildAvatarMockSupabase({ profileUpdateShouldFail: true });
    await expect(uploadAvatarAsset({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      buffer: PNG_1X1,
      mimeType: 'image/png',
      filename: 'photo.png',
    })).rejects.toBeInstanceOf(AssetsAvatarProfileError);
    expect(supabase.writes.storage.some((w) => w.op === 'remove')).toBe(true);
  });

  it('503 ROLLBACK_FAILED', async () => {
    const supabase = buildAvatarMockSupabase({
      profileUpdateShouldFail: true,
      rollbackDeleteShouldFail: true,
    });
    await expect(uploadAvatarAsset({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      buffer: PNG_1X1,
      mimeType: 'image/png',
      filename: 'photo.png',
    })).rejects.toBeInstanceOf(AssetsAvatarRollbackError);
  });

  it('rejeita MIME inválido', async () => {
    const supabase = buildAvatarMockSupabase();
    const bad = Buffer.from('%PDF-1.4 fake');
    await expect(uploadAvatarAsset({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      buffer: bad,
      mimeType: 'application/pdf',
      filename: 'doc.png',
    })).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
  });

  it('rejeita extensão inválida', async () => {
    const supabase = buildAvatarMockSupabase();
    await expect(uploadAvatarAsset({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      buffer: PNG_1X1,
      mimeType: 'image/png',
      filename: 'photo.gif',
    })).rejects.toMatchObject({ code: 'INVALID_FILE_EXTENSION' });
  });

  it('rejeita base64', async () => {
    const supabase = buildAvatarMockSupabase();
    const base64Buf = Buffer.from('data:image/png;base64,abc');
    await expect(uploadAvatarAsset({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      buffer: base64Buf,
      mimeType: 'image/png',
      filename: 'photo.png',
    })).rejects.toMatchObject({ code: 'PAYLOAD_INVALID' });
  });

  it('rejeita >2MB', async () => {
    const supabase = buildAvatarMockSupabase();
    const big = Buffer.alloc(AVATAR_MAX_BYTES + 1, 0);
    big[0] = 0x89;
    big[1] = 0x50;
    big[2] = 0x4e;
    big[3] = 0x47;
    await expect(uploadAvatarAsset({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      buffer: big,
      mimeType: 'image/png',
      filename: 'big.png',
    })).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });
});

describe('assetsAvatarApi — POST handler', () => {
  const getTenantAdminActorOrThrow = vi.fn();
  const parseMultipart = vi.fn();
  let supabase;
  let handler;

  beforeEach(() => {
    getTenantAdminActorOrThrow.mockReset();
    parseMultipart.mockReset();
    supabase = buildAvatarMockSupabase();
    getTenantAdminActorOrThrow.mockResolvedValue({ tenant_id: TENANT_A, role: 'master' });
    parseMultipart.mockResolvedValue({
      buffer: WEBP_MIN,
      mimeType: 'image/webp',
      filename: 'photo.webp',
      fields: { collaborator_id: JULIANA_ID },
      collaborator_id: JULIANA_ID,
    });
    handler = createAssetsAvatarPostHandler({
      supabase,
      getTenantAdminActorOrThrow,
      parseMultipart,
    });
  });

  it('401 sem auth', async () => {
    const res = mockRes();
    await handler({ appAuthUser: null, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('403 sem admin', async () => {
    getTenantAdminActorOrThrow.mockRejectedValue(new Error('Apenas administradores da clínica podem executar esta ação.'));
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-1' }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('ADMIN_REQUIRED');
  });

  it('400 tenant_id query', async () => {
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-admin' }, query: { tenant_id: TENANT_A }, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('TENANT_QUERY_FORBIDDEN');
  });

  it('400 file ausente via parseMultipart', async () => {
    parseMultipart.mockRejectedValue(
      new AssetsAvatarValidationError('Campo file é obrigatório.', 'PAYLOAD_INVALID'),
    );
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-admin' }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 MIME inválido via handler', async () => {
    parseMultipart.mockResolvedValue({
      buffer: Buffer.from('%PDF'),
      mimeType: 'application/pdf',
      filename: 'x.png',
      fields: { collaborator_id: JULIANA_ID },
      collaborator_id: JULIANA_ID,
    });
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-admin' }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_FILE_TYPE');
  });

  it('400 collaborator_id ausente', async () => {
    parseMultipart.mockRejectedValue(
      new AssetsAvatarValidationError('Campo collaborator_id é obrigatório.', 'PAYLOAD_INVALID'),
    );
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-admin' }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('PAYLOAD_INVALID');
  });

  it('404 collaborator fora tenant', async () => {
    supabase = buildAvatarMockSupabase({
      collaborators: [{ ...COLLABORATORS[0], id: PAULO_ID, tenant_id: TENANT_B, legacy_id: 'col-paulo-other-tenant' }],
    });
    handler = createAssetsAvatarPostHandler({
      supabase,
      getTenantAdminActorOrThrow,
      parseMultipart,
    });
    parseMultipart.mockResolvedValue({
      buffer: WEBP_MIN,
      mimeType: 'image/webp',
      filename: 'photo.webp',
      fields: { collaborator_id: PAULO_ID },
      collaborator_id: PAULO_ID,
    });
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-admin' }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('COLLABORATOR_NOT_FOUND');
  });

  it('413 >2MB', async () => {
    const big = Buffer.alloc(AVATAR_MAX_BYTES + 1, 0);
    big[0] = 0x89;
    big[1] = 0x50;
    big[2] = 0x4e;
    big[3] = 0x47;
    parseMultipart.mockResolvedValue({
      buffer: big,
      mimeType: 'image/png',
      filename: 'big.png',
      fields: { collaborator_id: JULIANA_ID },
      collaborator_id: JULIANA_ID,
    });
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-admin' }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(413);
  });

  it('200 envelope POST', async () => {
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-admin' }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.asset_type).toBe('avatar');
    expect(res.body.data.signed_url).toContain('/object/sign/');
    expect(res.body.data.signed_url_expires_in).toBe(3600);
    expect(res.body.meta.audit_event).toBe('ASSET_AVATAR_UPLOADED');
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

  it('Melissa inativa permitido', async () => {
    parseMultipart.mockResolvedValue({
      buffer: WEBP_MIN,
      mimeType: 'image/webp',
      filename: 'photo.webp',
      fields: { collaborator_id: MELISSA_ID },
      collaborator_id: MELISSA_ID,
    });
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-admin' }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(200);
  });
});

describe('assetsAvatarApi — GET handler', () => {
  const resolveActiveTenantUser = vi.fn();
  const isActiveTenantUserRow = vi.fn((row) => row?.status !== 'inactive' && row?.is_active !== false);
  let supabase;
  let handler;

  beforeEach(() => {
    resolveActiveTenantUser.mockReset();
    supabase = buildAvatarMockSupabase();
    resolveActiveTenantUser.mockResolvedValue({
      tenant_id: TENANT_A,
      role: 'atendimento',
      status: 'active',
      is_active: true,
    });
    handler = createAssetsAvatarGetHandler({
      supabase,
      resolveActiveTenantUser,
      isActiveTenantUserRow,
    });
  });

  it('401 sem auth', async () => {
    const res = mockRes();
    await handler({ appAuthUser: null, params: { collaboratorId: JULIANA_ID }, query: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('403 sem membership', async () => {
    resolveActiveTenantUser.mockResolvedValue(null);
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-user' }, params: { collaboratorId: JULIANA_ID }, query: {} }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('TENANT_MEMBERSHIP_REQUIRED');
  });

  it('404 sem foto_url', async () => {
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-user' }, params: { collaboratorId: JULIANA_ID }, query: {} }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('AVATAR_NOT_FOUND');
  });

  it('404 collaborator fora tenant', async () => {
    supabase = buildAvatarMockSupabase({
      collaborators: [{ ...COLLABORATORS[0], id: PAULO_ID, tenant_id: TENANT_B, legacy_id: 'col-paulo-other-tenant' }],
    });
    handler = createAssetsAvatarGetHandler({
      supabase,
      resolveActiveTenantUser,
      isActiveTenantUserRow,
    });
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-user' }, params: { collaboratorId: PAULO_ID }, query: {} }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('COLLABORATOR_NOT_FOUND');
  });

  it('200 gera signed_url', async () => {
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-user' }, params: { collaboratorId: RENATA_ID }, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.signed_url).toContain('/object/sign/');
    expect(res.body.data.signed_url_expires_in).toBe(3600);
    expect(res.body.data.signed_url).not.toContain('/object/public/');
    expect(res.body.meta.collaborator_id).toBe(RENATA_ID);
    expect(res.body.data.path).toBe(buildAvatarObjectPath(TENANT_A, RENATA_ID));
  });

  it('GET não escreve collaborators', async () => {
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-user' }, params: { collaboratorId: RENATA_ID }, query: {} }, res);
    expect(supabase.writes.collaborators).toHaveLength(0);
    expect(supabase.writes.storage.every((w) => w.op !== 'upload')).toBe(true);
  });

  it('membro não-admin pode ler', async () => {
    resolveActiveTenantUser.mockResolvedValue({
      tenant_id: TENANT_A,
      role: 'atendimento',
      status: 'active',
      is_active: true,
    });
    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-atendimento' }, params: { collaboratorId: RENATA_ID }, query: {} }, res);
    expect(res.statusCode).toBe(200);
  });

  it('usa req.tenantContext quando middleware já resolveu membership', async () => {
    const res = mockRes();
    await handler({
      appAuthUser: { id: 'auth-atendimento' },
      params: { collaboratorId: RENATA_ID },
      query: {},
      tenantContext: { tenantId: TENANT_A, mode: 'membership' },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.meta.tenant_id).toBe(TENANT_A);
    expect(resolveActiveTenantUser).not.toHaveBeenCalled();
  });
});

describe('assetsAvatarApi — segurança operacional', () => {
  it('zero IndexedDB', () => {
    const content = fs.readFileSync(path.join(REPO_ROOT, 'server/lib/assetsAvatarApi.js'), 'utf8');
    expect(content).not.toMatch(/\b(withDb|loadDb|indexedDB)\s*\(/i);
  });

  it('produção intocada', () => {
    const content = fs.readFileSync(path.join(REPO_ROOT, 'server/lib/assetsAvatarApi.js'), 'utf8');
    expect(content).toContain(PRODUCTION_PROJECT_REF);
    expect(content).not.toMatch(new RegExp(`supabase\\.co.*${PRODUCTION_PROJECT_REF}`));
  });

  it('rotas registradas com core auth/tenant', () => {
    const content = fs.readFileSync(path.join(REPO_ROOT, 'server/index.js'), 'utf8');
    expect(content).toMatch(/app\.post\(\s*['"]\/internal\/app\/assets\/avatar['"]/);
    expect(content).toMatch(/app\.get\(\s*['"]\/internal\/app\/assets\/avatar\/:collaboratorId['"]/);
    expect(content).toContain('requireAppUserAssetsWrite');
    expect(content).toContain('requireTenantAdminAssetsWrite');
    expect(content).toContain('requireTenantMembershipAssetsRead');
  });
});
