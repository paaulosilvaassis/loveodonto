import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMembershipDependencies } from '../../server/lib/membership/membershipBundle.js';
import { MEMBERSHIP_EXTERNAL_DEP_KEYS } from '../../server/lib/membership/membershipDeps.js';
import { createLinkAuthUserToTenantMembership } from '../../server/lib/membership/linkAuthUserToTenantMembership.js';
import { createResolveActiveTenantUser } from '../../server/lib/membership/resolveActiveTenantUser.js';
import { createAuthUserMetadata } from '../../server/lib/membership/authUserMetadata.js';
import {
  isMissingCollaboratorIdColumnError,
  isMissingHasSystemAccessColumnError,
  isMissingInvitationStatusColumnError,
  isTenantUserDuplicateError,
} from '../../server/lib/membership/tenantUserSchemaFallbacks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const INDEX_PATH = path.join(REPO_ROOT, 'server/index.js');

const WAVE3H_REMOVED_FROM_INDEX = [
  'function isMissingHasSystemAccessColumnError',
  'function isMissingInvitationStatusColumnError',
  'function isMissingCollaboratorIdColumnError',
  'function isActiveTenantUserRow',
  'async function linkAuthUserToTenantMembership',
  'async function resolveActiveTenantUser',
  'async function getTenantUserByAuthUserId',
  'async function getAuthUserMeta',
  'function extractPermissionFieldsFromAppMetadata',
  'async function enrichTeamRosterWithPermissionFields',
  'async function appendAccessAuditToAuthUser',
  'async function ensureConsoleAdminCredentials',
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

function baseMembershipDeps() {
  return {
    supabase: {
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({ data: { user: { id: 'auth-1', email: 'a@test.com' } }, error: null })),
          updateUserById: vi.fn(async () => ({ data: { user: { id: 'auth-1' } }, error: null })),
        },
      },
      from: vi.fn(),
    },
    normalizeText: (v) => String(v ?? '').trim(),
    normalizeEmail: (v) => String(v ?? '').trim().toLowerCase(),
  };
}

function chainEqMaybeSingle(result) {
  return {
    eq: () => ({
      maybeSingle: async () => result,
      order: () => ({
        eq: () => Promise.resolve(result),
      }),
    }),
    order: () => ({
      eq: () => Promise.resolve(result),
    }),
  };
}

describe('apiCoreWave3hMigration — index sem membership inline', () => {
  it.each(WAVE3H_REMOVED_FROM_INDEX)('index não define %s', (sig) => {
    expect(readIndex()).not.toMatch(new RegExp(`${sig}\\s*\\(`));
  });

  it('index instancia membership = createMembershipDependencies(...)', () => {
    const content = readIndex();
    expect(content).toContain("from './lib/membership/membershipBundle.js'");
    expect(content).toMatch(/const membership = createMembershipDependencies\s*\(/);
    expect(content).toMatch(/resolveActiveTenantUser,\s*\n\s*getTenantUserByAuthUserId,/);
    expect(content).toMatch(/appendAccessAuditToAuthUser,\s*\n\s*ensureConsoleAdminCredentials,/);
  });

  it('index não duplica schema fallbacks inline', () => {
    expect(readIndex()).not.toMatch(/function isMissingHasSystemAccessColumnError\s*\(/);
    expect(readIndex()).toMatch(/isMissingHasSystemAccessColumnError,\s*\n\s*isMissingInvitationStatusColumnError,/);
  });

  it('provisioning recebe appendAccessAuditToAuthUser do membership', () => {
    const content = readIndex();
    const membershipBlock = content.slice(content.indexOf('} = membership;'));
    const provisioningBlock = content.slice(content.indexOf('createProvisioningDependencies'));
    expect(membershipBlock).toContain('appendAccessAuditToAuthUser');
    expect(provisioningBlock).toContain('appendAccessAuditToAuthUser');
  });

  it('identityService permanece compatível', () => {
    const block = readIndex().slice(readIndex().indexOf('identityService = createIdentityService'));
    for (const dep of IDENTITY_SERVICE_DEPS) {
      expect(block, `dep ${dep}`).toContain(dep);
    }
  });
});

describe('membershipDeps — bootstrap', () => {
  it('MEMBERSHIP_EXTERNAL_DEP_KEYS mínimas', () => {
    expect(MEMBERSHIP_EXTERNAL_DEP_KEYS).toEqual(['supabase', 'normalizeText', 'normalizeEmail']);
  });

  it('createMembershipDependencies falha sem supabase', () => {
    const partial = { ...baseMembershipDeps() };
    delete partial.supabase;
    expect(() => createMembershipDependencies(partial)).toThrow(/supabase/);
  });
});

describe('membershipBundle — exports', () => {
  it('expõe membership + metadata + schema fallbacks', () => {
    const bundle = createMembershipDependencies(baseMembershipDeps());
    expect(bundle.linkAuthUserToTenantMembership).toBeTypeOf('function');
    expect(bundle.resolveActiveTenantUser).toBeTypeOf('function');
    expect(bundle.getAuthUserMeta).toBeTypeOf('function');
    expect(bundle.appendAccessAuditToAuthUser).toBeTypeOf('function');
    expect(bundle.ensureConsoleAdminCredentials).toBeTypeOf('function');
    expect(bundle.isMissingHasSystemAccessColumnError).toBeTypeOf('function');
    expect(bundle.isTenantUserDuplicateError).toBeTypeOf('function');
  });
});

describe('tenantUserSchemaFallbacks — SSOT unificado', () => {
  it('não há duplicata em index.js', () => {
    expect(readIndex()).not.toMatch(/function isMissingInvitationStatusColumnError/);
  });

  it('provisioning importa do membership', () => {
    const bundle = fs.readFileSync(
      path.join(REPO_ROOT, 'server/lib/provisioning/provisioningBundle.js'),
      'utf8',
    );
    expect(bundle).toContain('../membership/tenantUserSchemaFallbacks.js');
    expect(fs.existsSync(path.join(REPO_ROOT, 'server/lib/provisioning/tenantUserSchemaFallbacks.js'))).toBe(false);
  });

  it('detecta fallbacks legados', () => {
    expect(isMissingHasSystemAccessColumnError({ code: '42703', message: 'has_system_access' })).toBe(true);
    expect(isMissingInvitationStatusColumnError({ code: '42703', message: 'invitation_status' })).toBe(true);
    expect(isMissingCollaboratorIdColumnError({ message: 'collaborator_id tenant_users schema cache' })).toBe(true);
    expect(isTenantUserDuplicateError({ code: '23505' })).toBe(true);
  });
});

describe('linkAuthUserToTenantMembership — reconciliation', () => {
  it('vincula user_id quando tenant_user ativo sem user_id', async () => {
    const update = vi.fn(() => ({
      eq: async () => ({ error: null }),
    }));
    const supabase = {
      auth: {
        admin: {
          getUserById: vi.fn(),
        },
      },
      from: vi.fn((table) => {
        if (table !== 'tenant_users') return {};
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({
                data: [{
                  id: 'tu-1',
                  tenant_id: 'tenant-1',
                  user_id: null,
                  email: 'a@test.com',
                  status: 'active',
                  is_active: true,
                }],
                error: null,
              }),
              data: [{
                id: 'tu-1',
                tenant_id: 'tenant-1',
                user_id: null,
                email: 'a@test.com',
                status: 'active',
                is_active: true,
              }],
              error: null,
            }),
          }),
          update,
        };
      }),
    };
    const fn = createLinkAuthUserToTenantMembership({
      supabase,
      normalizeEmail: (v) => v,
      isActiveTenantUserRow: (row) => Boolean(row?.tenant_id),
    });
    const result = await fn('auth-1', 'tenant-1', 'a@test.com');
    expect(result).toMatchObject({ id: 'tu-1', user_id: 'auth-1' });
    expect(update).toHaveBeenCalled();
  });
});

describe('resolveActiveTenantUser — membership resolution', () => {
  it('delega para link quando nenhum row ativo', async () => {
    const linkAuthUserToTenantMembership = vi.fn(async () => ({ id: 'tu-linked', user_id: 'auth-1' }));
    const supabase = {
      from: vi.fn(() => ({
        select: () => chainEqMaybeSingle({ data: [], error: null }),
      })),
    };
    const fn = createResolveActiveTenantUser({
      supabase,
      isActiveTenantUserRow: () => true,
      linkAuthUserToTenantMembership,
    });
    const result = await fn('auth-1');
    expect(result).toEqual({ id: 'tu-linked', user_id: 'auth-1' });
    expect(linkAuthUserToTenantMembership).toHaveBeenCalledWith('auth-1', '', '');
  });
});

describe('authUserMetadata — permission + audit', () => {
  it('extractPermissionFieldsFromAppMetadata preserva contrato', () => {
    const { extractPermissionFieldsFromAppMetadata } = createAuthUserMetadata({ supabase: {} });
    expect(extractPermissionFieldsFromAppMetadata({
      has_custom_permissions: true,
      custom_permissions: { p1: true },
      permission_overrides: { p2: false },
    })).toEqual({
      has_custom_permissions: true,
      custom_permissions: { p1: true },
      permission_overrides: { p2: false },
    });
  });

  it('appendAccessAuditToAuthUser persiste log em app_metadata', async () => {
    const updateUserById = vi.fn(async () => ({ error: null }));
    const supabase = {
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({
            data: { user: { app_metadata: { access_audit_log: [] } } },
            error: null,
          })),
          updateUserById,
        },
      },
    };
    const { appendAccessAuditToAuthUser } = createAuthUserMetadata({ supabase });
    const log = await appendAccessAuditToAuthUser('auth-1', { action: 'password_reset_requested' });
    expect(log).toHaveLength(1);
    expect(log[0].action).toBe('password_reset_requested');
    expect(updateUserById).toHaveBeenCalled();
  });
});
