import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProvisioningDependencies } from '../../server/lib/provisioning/provisioningBundle.js';
import { PROVISIONING_EXTERNAL_DEP_KEYS } from '../../server/lib/provisioning/provisioningDeps.js';
import { createAuthUserResolver } from '../../server/lib/provisioning/authUserResolver.js';
import { createUpsertTenantUserAccess } from '../../server/lib/provisioning/tenantUserWrite.js';
import { createLinkCollaboratorToTenantUser } from '../../server/lib/provisioning/tenantUserLink.js';
import {
  isMissingCollaboratorIdColumnError,
  isMissingHasSystemAccessColumnError,
  isMissingInvitationStatusColumnError,
} from '../../server/lib/membership/tenantUserSchemaFallbacks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const INDEX_PATH = path.join(REPO_ROOT, 'server/index.js');

const WAVE3G_REMOVED_FROM_INDEX = [
  'async function findAuthUserByEmail',
  'async function getValidAuthUserId',
  'async function getValidAuthUserIdWithRetry',
  'async function resolveAuthUserIdForTenantLink',
  'async function clearStaleTenantUserAuthReference',
  'async function upsertTenantUserAccess',
  'async function linkCollaboratorToTenantUser',
];

const IDENTITY_SERVICE_DEPS = [
  'provisionCollaboratorAccess',
  'clearStaleTenantUserAuthReference',
  'findAuthUserByEmail',
  'getValidAuthUserId',
];

function readIndex() {
  return fs.readFileSync(INDEX_PATH, 'utf8');
}

function baseExternalDeps() {
  return {
    supabase: {
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({ data: { user: { id: 'auth-1' } }, error: null })),
          listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
        },
      },
      from: vi.fn(),
    },
    getTenantAdminActorOrThrow: vi.fn(async () => ({ tenant_id: 'tenant-1' })),
    normalizeText: (v) => String(v ?? '').trim(),
    normalizeEmail: (v) => String(v ?? '').trim().toLowerCase(),
    normalizeRoleValue: (v) => v || 'atendimento',
    normalizeInvitationStatus: (v) => v || 'none',
    maskEmail: (v) => v,
    appendAccessAuditToAuthUser: vi.fn(),
    logAccessEmailAudit: vi.fn(),
    getPasswordResetRedirectTo: () => 'https://app.test/reset',
  };
}

function chainMaybeSingle(result) {
  return {
    eq: () => ({
      eq: () => ({
        maybeSingle: async () => result,
      }),
    }),
  };
}

describe('apiCoreWave3gMigration — index sem tenant write inline', () => {
  it.each(WAVE3G_REMOVED_FROM_INDEX)('index não define %s', (sig) => {
    expect(readIndex()).not.toMatch(new RegExp(`${sig}\\s*\\(`));
  });

  it('index obtém tenant write layer do provisioning bundle', () => {
    const content = readIndex();
    expect(content).toMatch(/upsertTenantUserAccess,\s*\n\s*linkCollaboratorToTenantUser,/);
    expect(content).toMatch(/clearStaleTenantUserAuthReference,\s*\n\s*findAuthUserByEmail,/);
    expect(content).toMatch(/resolveAuthUserIdForTenantLink,\s*\n\} = provisioning;/);
  });

  it('createProvisioningDependencies não recebe upsertTenantUserAccess externo', () => {
    const block = readIndex().slice(readIndex().indexOf('createProvisioningDependencies'));
    const end = block.indexOf('});');
    const call = block.slice(0, end);
    expect(call).not.toContain('upsertTenantUserAccess,');
    expect(call).not.toContain('linkCollaboratorToTenantUser,');
    expect(call).not.toContain('clearStaleTenantUserAuthReference,');
    expect(call).not.toContain('findAuthUserByEmail,');
    expect(call).not.toContain('getValidAuthUserId,');
  });

  it('identityService continua recebendo deps de contrato', () => {
    const block = readIndex().slice(readIndex().indexOf('identityService = createIdentityService'));
    for (const dep of IDENTITY_SERVICE_DEPS) {
      expect(block, `dep ${dep}`).toContain(dep);
    }
  });
});

describe('provisioningDeps Wave 3G — deps externas reduzidas', () => {
  it('PROVISIONING_EXTERNAL_DEP_KEYS não inclui tenant write', () => {
    expect(PROVISIONING_EXTERNAL_DEP_KEYS).not.toContain('upsertTenantUserAccess');
    expect(PROVISIONING_EXTERNAL_DEP_KEYS).not.toContain('linkCollaboratorToTenantUser');
    expect(PROVISIONING_EXTERNAL_DEP_KEYS).not.toContain('clearStaleTenantUserAuthReference');
    expect(PROVISIONING_EXTERNAL_DEP_KEYS).not.toContain('findAuthUserByEmail');
    expect(PROVISIONING_EXTERNAL_DEP_KEYS).not.toContain('getValidAuthUserId');
    expect(PROVISIONING_EXTERNAL_DEP_KEYS).toContain('supabase');
  });

  it('createProvisioningDependencies falha se supabase ausente', () => {
    const partial = { ...baseExternalDeps() };
    delete partial.supabase;
    expect(() => createProvisioningDependencies(partial)).toThrow(/supabase/);
  });
});

describe('provisioningBundle Wave 3G — tenant write layer interna', () => {
  it('expõe upsert, link e auth resolver', () => {
    const bundle = createProvisioningDependencies(baseExternalDeps());
    expect(bundle.upsertTenantUserAccess).toBeTypeOf('function');
    expect(bundle.linkCollaboratorToTenantUser).toBeTypeOf('function');
    expect(bundle.clearStaleTenantUserAuthReference).toBeTypeOf('function');
    expect(bundle.findAuthUserByEmail).toBeTypeOf('function');
    expect(bundle.getValidAuthUserId).toBeTypeOf('function');
    expect(bundle.resolveAuthUserIdForTenantLink).toBeTypeOf('function');
    expect(bundle.provisionCollaboratorAccess).toBeTypeOf('function');
  });
});

describe('tenantUserSchemaFallbacks — detecção legado', () => {
  it('detecta has_system_access ausente', () => {
    expect(isMissingHasSystemAccessColumnError({ code: '42703', message: 'has_system_access' })).toBe(true);
  });

  it('detecta invitation_status ausente', () => {
    expect(isMissingInvitationStatusColumnError({ code: '42703', message: 'invitation_status' })).toBe(true);
  });

  it('detecta collaborator_id ausente', () => {
    expect(isMissingCollaboratorIdColumnError({
      message: 'collaborator_id tenant_users schema cache',
    })).toBe(true);
  });
});

describe('authUserResolver — resolveAuthUserIdForTenantLink', () => {
  it('prioriza explicitAuthUserId válido', async () => {
    const supabase = {
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({ data: { user: { id: 'auth-explicit' } }, error: null })),
          listUsers: vi.fn(),
        },
      },
    };
    const { resolveAuthUserIdForTenantLink } = createAuthUserResolver({
      supabase,
      normalizeEmail: (v) => v,
    });
    const id = await resolveAuthUserIdForTenantLink({
      normalizedEmail: 'a@test.com',
      explicitAuthUserId: 'auth-explicit',
    });
    expect(id).toBe('auth-explicit');
  });

  it('clearStaleTenantUserAuthReference detecta órfão sem gravar NULL', async () => {
    const supabase = {
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({ data: null, error: { message: 'not found' } })),
        },
      },
      from: vi.fn(() => ({
        select: () => chainMaybeSingle({
          data: { id: 'tu-1', user_id: 'orphan-id' },
          error: null,
        }),
      })),
    };
    const { clearStaleTenantUserAuthReference } = createAuthUserResolver({
      supabase,
      normalizeEmail: (v) => v,
    });
    await expect(clearStaleTenantUserAuthReference('tenant-1', 'a@test.com')).resolves.toBe(true);
    expect(supabase.from).not.toHaveBeenCalledWith('tenant_users.update');
  });
});

describe('tenantUserWrite — upsertTenantUserAccess', () => {
  it('upsert com sucesso no primeiro attempt', async () => {
    const tenantRow = { id: 'tu-1', user_id: 'auth-1', email: 'a@test.com' };
    let callCount = 0;
    const supabase = {
      from: vi.fn((table) => {
        if (table !== 'tenant_users') return {};
        return {
          select: () => chainMaybeSingle({ data: null, error: null }),
          insert: () => ({
            select: () => ({
              single: async () => {
                callCount += 1;
                return { data: tenantRow, error: null };
              },
            }),
          }),
        };
      }),
    };
    const upsert = createUpsertTenantUserAccess({
      supabase,
      normalizeEmail: (v) => v,
      normalizeRoleValue: (v) => v || 'atendimento',
      normalizeInvitationStatus: (v) => v || 'none',
      resolveAuthUserIdForTenantLink: async () => 'auth-1',
    });
    const result = await upsert({
      tenantId: 'tenant-1',
      collaboratorId: 'c-1',
      fullName: 'Nome',
      email: 'a@test.com',
      role: 'atendimento',
    });
    expect(result).toEqual(tenantRow);
    expect(callCount).toBe(1);
  });

  it('fallback sem has_system_access, invitation_status e collaborator_id', async () => {
    const tenantRow = { id: 'tu-2', user_id: 'auth-2', email: 'b@test.com' };
    let attempts = 0;
    const supabase = {
      from: vi.fn(() => ({
        select: () => chainMaybeSingle({ data: null, error: null }),
        insert: () => ({
          select: () => ({
            single: async () => {
              attempts += 1;
              if (attempts === 1) {
                return { data: null, error: { code: '42703', message: 'has_system_access missing' } };
              }
              return { data: tenantRow, error: null };
            },
          }),
        }),
      })),
    };
    const upsert = createUpsertTenantUserAccess({
      supabase,
      normalizeEmail: (v) => v,
      normalizeRoleValue: (v) => v || 'atendimento',
      normalizeInvitationStatus: (v) => v || 'none',
      resolveAuthUserIdForTenantLink: async () => 'auth-2',
    });
    const result = await upsert({
      tenantId: 'tenant-1',
      collaboratorId: 'c-2',
      fullName: 'Nome',
      email: 'b@test.com',
      role: 'atendimento',
    });
    expect(result).toEqual(tenantRow);
    expect(attempts).toBe(2);
  });
});

describe('tenantUserLink — linkCollaboratorToTenantUser', () => {
  it('vincula collaborator_id com sucesso', async () => {
    const updated = { id: 'tu-1', collaborator_id: 'c-1', email: 'a@test.com' };
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tenant_users') {
          return {
            select: () => chainMaybeSingle({
              data: { id: 'tu-1', collaborator_id: null, email: 'a@test.com', tenant_id: 'tenant-1' },
              error: null,
            }),
            update: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({ data: updated, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'invitations') {
          return {
            update: () => ({
              eq: () => ({
                eq: () => ({
                  is: async () => ({ error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'identities') {
          return {
            update: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    };
    const link = createLinkCollaboratorToTenantUser({
      supabase,
      getTenantAdminActorOrThrow: async () => ({ tenant_id: 'tenant-1' }),
      normalizeEmail: (v) => v,
    });
    const result = await link({
      actorAuthUserId: 'admin',
      tenantId: 'tenant-1',
      collaboratorId: 'c-1',
      email: 'a@test.com',
      fullName: 'Nome',
    });
    expect(result.linked).toBe(true);
    expect(result.tenantUser).toEqual(updated);
  });

  it('identities ausente não quebra o fluxo', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tenant_users') {
          return {
            select: () => chainMaybeSingle({
              data: { id: 'tu-1', collaborator_id: null, email: 'a@test.com', tenant_id: 'tenant-1' },
              error: null,
            }),
            update: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: { id: 'tu-1', collaborator_id: 'c-1' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'invitations') {
          return {
            update: () => ({
              eq: () => ({
                eq: () => ({
                  is: async () => ({ error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'identities') {
          return {
            update: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ error: { message: 'relation identities does not exist' } }),
              }),
            }),
          };
        }
        return {};
      }),
    };
    const link = createLinkCollaboratorToTenantUser({
      supabase,
      getTenantAdminActorOrThrow: async () => ({ tenant_id: 'tenant-1' }),
      normalizeEmail: (v) => v,
    });
    await expect(link({
      actorAuthUserId: 'admin',
      tenantId: 'tenant-1',
      collaboratorId: 'c-1',
      email: 'a@test.com',
    })).resolves.toMatchObject({ linked: true });
  });
});
