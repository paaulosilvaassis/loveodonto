import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiErrorPayload, apiSuccess } from '../../server/core/api/response.js';
import {
  ApiError,
  ApiRollbackError,
  mapApiError,
} from '../../server/core/api/errors.js';
import { createApiLogger, createRequestId } from '../../server/core/api/logger.js';
import {
  rejectForbiddenFields,
  rejectTenantIdBody,
  rejectTenantIdQuery,
  requireFields,
  validateBoolean,
  validateString,
} from '../../server/core/api/validation.js';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  paginationRange,
  parsePaginationQuery,
} from '../../server/core/api/pagination.js';
import { parseSortQuery } from '../../server/core/api/sorting.js';
import { parseAllowedFilters, sanitizeSearchTerm } from '../../server/core/api/filters.js';
import { runWithRollback } from '../../server/core/api/rollback.js';
import {
  isActiveMembership,
  isAdmin,
  isMaster,
  isOwner,
  isTenantAdminRole,
  normalizeRoleValue,
} from '../../server/core/rbac/roles.js';
import {
  assertTenantAdmin,
  assertTenantMember,
} from '../../server/core/rbac/guards.js';

describe('apiCoreFoundation — response', () => {
  it('apiSuccess envelope', () => {
    const payload = apiSuccess({ items: [1] }, { tenant_id: 't-1' });
    expect(payload).toEqual({
      ok: true,
      data: { items: [1] },
      meta: { tenant_id: 't-1' },
    });
  });

  it('apiErrorPayload envelope', () => {
    expect(apiErrorPayload({
      code: 'PAYLOAD_INVALID',
      message: 'Campo inválido.',
      details: { field: 'x' },
    })).toEqual({
      ok: false,
      code: 'PAYLOAD_INVALID',
      message: 'Campo inválido.',
      details: { field: 'x' },
    });
  });
});

describe('apiCoreFoundation — errors', () => {
  it('ApiError class', () => {
    const err = new ApiError('Falha.', {
      status: 403,
      code: 'ADMIN_REQUIRED',
      details: { role: 'atendimento' },
    });
    expect(err.status).toBe(403);
    expect(err.code).toBe('ADMIN_REQUIRED');
    expect(err.message).toBe('Falha.');
    expect(err.details).toEqual({ role: 'atendimento' });
  });

  it('mapApiError — ApiError conhecido', () => {
    const err = new ApiError('Proibido.', { status: 403, code: 'ADMIN_REQUIRED' });
    const mapped = mapApiError(err);
    expect(mapped.status).toBe(403);
    expect(mapped.body).toEqual({
      ok: false,
      code: 'ADMIN_REQUIRED',
      message: 'Proibido.',
    });
  });

  it('mapApiError — erro inesperado', () => {
    const mapped = mapApiError(new Error('boom'));
    expect(mapped.status).toBe(500);
    expect(mapped.body.code).toBe('INTERNAL_ERROR');
    expect(mapped.body.message).toBe('boom');
  });

  it('mapApiError — rollback failed', () => {
    const err = new ApiRollbackError('Rollback falhou.', { step: 'storage' });
    const mapped = mapApiError(err);
    expect(mapped.status).toBe(503);
    expect(mapped.body.code).toBe('ROLLBACK_FAILED');
    expect(mapped.body.details).toEqual({ step: 'storage' });
  });
});

describe('apiCoreFoundation — pagination', () => {
  it('defaults page e pageSize', () => {
    expect(parsePaginationQuery({})).toEqual({
      page: DEFAULT_PAGE,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it('respeita max pageSize', () => {
    expect(parsePaginationQuery({ pageSize: 9999 }).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it('valores inválidos caem no default', () => {
    expect(parsePaginationQuery({ page: -1, pageSize: 0 })).toEqual({
      page: DEFAULT_PAGE,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it('paginationRange', () => {
    expect(paginationRange({ page: 2, pageSize: 10 })).toEqual({
      from: 10,
      to: 19,
      page: 2,
      pageSize: 10,
    });
  });
});

describe('apiCoreFoundation — sorting', () => {
  const allowlist = ['nome_completo', 'updated_at'];

  it('allowlist válida asc', () => {
    expect(parseSortQuery({ orderBy: 'nome_completo', orderDir: 'asc' }, { allowlist }))
      .toEqual({ field: 'nome_completo', ascending: true, direction: 'asc' });
  });

  it('orderDir desc', () => {
    expect(parseSortQuery({ orderBy: 'updated_at', orderDir: 'desc' }, { allowlist }).direction)
      .toBe('desc');
  });

  it('orderBy inválido', () => {
    expect(() => parseSortQuery({ orderBy: 'hack' }, { allowlist }))
      .toThrow(ApiError);
  });
});

describe('apiCoreFoundation — filters', () => {
  it('rejeita tenant_id na query', () => {
    expect(() => parseAllowedFilters({ tenant_id: 'x' }, { allowedKeys: ['search'] }))
      .toThrow(expect.objectContaining({ code: 'TENANT_QUERY_FORBIDDEN' }));
  });

  it('rejeita keys não permitidas', () => {
    expect(() => parseAllowedFilters({ foo: 'bar' }, { allowedKeys: ['search'] }))
      .toThrow(expect.objectContaining({ code: 'INVALID_QUERY' }));
  });

  it('normaliza search/status/cargo', () => {
    const parsed = parseAllowedFilters({
      search: '  %abc()  ',
      status: 'ativo',
      cargo: ' Dentista ',
    }, {
      allowedKeys: ['search', 'status', 'cargo'],
      statusAllowlist: ['ativo', 'inativo'],
    });
    expect(parsed.search).toBe('abc');
    expect(parsed.status).toBe('ativo');
    expect(parsed.cargo).toBe('Dentista');
  });

  it('sanitizeSearchTerm remove caracteres perigosos', () => {
    expect(sanitizeSearchTerm('%test(),')).toBe('test');
  });
});

describe('apiCoreFoundation — validation', () => {
  it('requireFields', () => {
    expect(() => requireFields({ a: '1' }, ['a', 'b']))
      .toThrow(expect.objectContaining({ code: 'PAYLOAD_INVALID' }));
    expect(() => requireFields({ a: '1', b: '2' }, ['a', 'b'])).not.toThrow();
  });

  it('rejectForbiddenFields', () => {
    expect(() => rejectForbiddenFields({ tenant_id: 'x' }, ['tenant_id']))
      .toThrow(expect.objectContaining({ code: 'TENANT_BODY_FORBIDDEN' }));
  });

  it('rejectTenantIdQuery/Body', () => {
    expect(() => rejectTenantIdQuery({ tenant_id: 'x' }))
      .toThrow(expect.objectContaining({ code: 'TENANT_QUERY_FORBIDDEN' }));
    expect(() => rejectTenantIdBody({ tenant_id: 'x' }))
      .toThrow(expect.objectContaining({ code: 'TENANT_BODY_FORBIDDEN' }));
  });

  it('validateBoolean', () => {
    expect(validateBoolean('true')).toBe(true);
    expect(validateBoolean('0')).toBe(false);
    expect(() => validateBoolean('maybe')).toThrow(ApiError);
  });

  it('validateString', () => {
    expect(validateString('  abc  ')).toBe('abc');
    expect(() => validateString('', { required: true, field: 'name' })).toThrow(ApiError);
  });
});

describe('apiCoreFoundation — logger', () => {
  it('cria objeto com request_id, durationMs, tenant_id, user_id', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T12:00:00.000Z'));
    const logger = createApiLogger('[TEST]', { requestId: 'req-123' });
    vi.advanceTimersByTime(25);
    const entry = logger.success({ tenant_id: 't-1', user_id: 'u-1' });
    expect(entry.request_id).toBe('req-123');
    expect(entry.tenant_id).toBe('t-1');
    expect(entry.user_id).toBe('u-1');
    expect(entry.durationMs).toBe(25);
    vi.useRealTimers();
  });

  it('gera request_id quando ausente', () => {
    const id = createRequestId('');
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('redige dados sensíveis', () => {
    const logger = createApiLogger('[TEST]');
    const entry = logger.success({
      tenant_id: 't-1',
      email: 'user@example.com',
      token: 'secret',
    });
    expect(entry.email).toBe('[REDACTED]');
    expect(entry.token).toBe('[REDACTED]');
    expect(entry.tenant_id).toBe('t-1');
  });
});

describe('apiCoreFoundation — rollback', () => {
  it('executa compensações em ordem inversa', async () => {
    const order = [];
    await runWithRollback([
      {
        name: 'step1',
        run: async () => {
          order.push('run1');
          return 1;
        },
        compensate: async () => { order.push('comp1'); },
      },
      {
        name: 'step2',
        run: async () => {
          order.push('run2');
          throw new Error('fail step2');
        },
        compensate: async () => { order.push('comp2'); },
      },
    ]).catch(() => {});

    expect(order).toEqual(['run1', 'run2', 'comp1']);
  });

  it('retorna rollback failed estruturado', async () => {
    await expect(runWithRollback([
      {
        name: 'step1',
        run: async () => 'ok',
        compensate: async () => { throw new Error('delete failed'); },
      },
      {
        name: 'step2',
        run: async () => { throw new Error('primary failed'); },
      },
    ])).rejects.toMatchObject({
      code: 'ROLLBACK_FAILED',
      status: 503,
      details: {
        primary_error: 'primary failed',
        rollback_errors: [{ step: 'step1', message: 'delete failed' }],
      },
    });
  });
});

describe('apiCoreFoundation — RBAC roles', () => {
  it('isOwner/isAdmin/isMaster', () => {
    expect(isOwner('owner')).toBe(true);
    expect(isAdmin('Admin')).toBe(true);
    expect(isMaster('MASTER')).toBe(true);
    expect(isOwner('admin')).toBe(false);
  });

  it('isTenantAdminRole', () => {
    expect(isTenantAdminRole('master')).toBe(true);
    expect(isTenantAdminRole('atendimento')).toBe(false);
  });

  it('isActiveMembership', () => {
    expect(isActiveMembership({ tenant_id: 't', status: 'active', is_active: true })).toBe(true);
    expect(isActiveMembership({ tenant_id: 't', status: 'inactive' })).toBe(false);
    expect(isActiveMembership({ tenant_id: 't', is_active: false })).toBe(false);
    expect(isActiveMembership(null)).toBe(false);
  });

  it('normalizeRoleValue', () => {
    expect(normalizeRoleValue('  Admin ')).toBe('admin');
    expect(normalizeRoleValue('')).toBe('atendimento');
  });
});

describe('apiCoreFoundation — RBAC guards', () => {
  const memberContext = {
    tenantUser: { tenant_id: 't-1', role: 'atendimento', status: 'active', is_active: true },
  };
  const adminContext = {
    tenantUser: { tenant_id: 't-1', role: 'master', status: 'active', is_active: true },
  };

  it('assertTenantMember ok', () => {
    expect(assertTenantMember(memberContext)).toBe(memberContext);
  });

  it('assertTenantMember 403', () => {
    expect(() => assertTenantMember({ tenantUser: { tenant_id: 't', status: 'inactive' } }))
      .toThrow(expect.objectContaining({ status: 403, code: 'TENANT_MEMBERSHIP_REQUIRED' }));
  });

  it('assertTenantAdmin ok', () => {
    expect(assertTenantAdmin(adminContext)).toBe(adminContext);
  });

  it('assertTenantAdmin 403 padronizado', () => {
    expect(() => assertTenantAdmin(memberContext))
      .toThrow(expect.objectContaining({ status: 403, code: 'ADMIN_REQUIRED' }));
  });
});

describe('apiCoreFoundation — isolamento Wave 3A', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = path.resolve(__dirname, '../..');

  it('index.js usa createAppRouteContexts como orquestrador', () => {
    const content = fs.readFileSync(path.join(REPO_ROOT, 'server/index.js'), 'utf8');
    expect(content).toMatch(/from '\.\/core\/middleware\/appRouteContexts\.js'/);
    expect(content).toMatch(/createAppRouteContexts\s*\(/);
    expect(content).toMatch(/appRouteContexts\.auth/);
    expect(content).toMatch(/appRouteContexts\.collaborators/);
    expect(content).toMatch(/appRouteContexts\.assets/);
    expect(content).toMatch(/appRouteContexts\.debug/);
    expect(content).not.toMatch(/async function requireAppUser\s*\(/);
  });

  it('lib Api modules (exceto piloto) não importam server/core', () => {
    const libDir = path.join(REPO_ROOT, 'server/lib');
    const files = fs.readdirSync(libDir).filter((f) => f.endsWith('Api.js'));
    const pilotModules = new Set([
      'collaboratorsApiList.js',
      'collaboratorsPermissionsApi.js',
      'debugUserContextApi.js',
    ]);
    for (const file of files) {
      if (pilotModules.has(file)) continue;
      const content = fs.readFileSync(path.join(libDir, file), 'utf8');
      expect(content, file).not.toMatch(/server\/core|\.\.\/core/);
    }
  });
});
