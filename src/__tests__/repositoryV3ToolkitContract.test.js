/**
 * Phase 6.1 — Repository V3 Toolkit (structural contract tests).
 * Valida helpers compartilhados sem alterar domínios legados.
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseBooleanLike,
  isProductionRuntime,
  REPOSITORY_V3_PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/shared/repositoryV3FlagHelpers.ts';
import {
  applyProductionSafeLocksGeneric,
  lockDangerousFlags,
} from '../repositories/shared/repositoryV3ProductionGuards.ts';
import {
  compareCoreFieldSets,
  isBrowserOffline,
  scheduleRepositoryMicrotask,
} from '../repositories/shared/repositoryV3SyncHelpers.ts';
import { createMemoryCache } from '../repositories/shared/repositoryV3CacheBase.ts';
import {
  isUuid,
  normalizeTenantId,
  resolveLegacyId,
} from '../repositories/shared/repositoryV3MapperHelpers.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHARED_ROOT = path.resolve(__dirname, '../repositories/shared');

const TOOLKIT_FILES = [
  'repositoryV3FlagHelpers.ts',
  'repositoryV3ProductionGuards.ts',
  'repositoryV3SyncHelpers.ts',
  'repositoryV3CacheBase.ts',
  'repositoryV3MapperHelpers.ts',
];

describe('repositoryV3ToolkitContract — estrutura', () => {
  it.each(TOOLKIT_FILES)('arquivo %s existe', (file) => {
    expect(fs.existsSync(path.join(SHARED_ROOT, file))).toBe(true);
  });
});

describe('repositoryV3ToolkitContract — flag helpers', () => {
  it('parseBooleanLike interpreta env-like values', () => {
    expect(parseBooleanLike('true', false)).toBe(true);
    expect(parseBooleanLike('0', true)).toBe(false);
    expect(parseBooleanLike('', true)).toBe(true);
  });

  it('production supabase ref unificado', () => {
    expect(REPOSITORY_V3_PRODUCTION_SUPABASE_PROJECT_REF).toBe('uoepkwhqztmsjnzirpev');
  });
});

describe('repositoryV3ToolkitContract — production guards', () => {
  it('lockDangerousFlags força false nas chaves perigosas', () => {
    const locked = lockDangerousFlags(
      { CRM_READ: true, CRM_SHADOW: true },
      ['CRM_READ', 'CRM_SHADOW'],
    );
    expect(locked.CRM_READ).toBe(false);
    expect(locked.CRM_SHADOW).toBe(false);
  });

  it('applyProductionSafeLocksGeneric respeita PROD runtime', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const locked = applyProductionSafeLocksGeneric(
        { CRM_READ: true, CRM_COMPARE: true },
        ['CRM_READ', 'CRM_COMPARE'],
      );
      expect(locked.CRM_READ).toBe(false);
      expect(locked.CRM_COMPARE).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd;
    }
  });
});

describe('repositoryV3ToolkitContract — sync helpers', () => {
  it('compareCoreFieldSets detecta diffs', () => {
    const result = compareCoreFieldSets(
      { name: 'A', phone: '1' },
      { name: 'B', phone: '1' },
      ['name', 'phone'],
    );
    expect(result.match).toBe(false);
    expect(result.diffs).toHaveLength(1);
  });

  it('scheduleRepositoryMicrotask executa callback', async () => {
    let ran = false;
    await new Promise((resolve) => {
      scheduleRepositoryMicrotask(() => {
        ran = true;
        resolve(undefined);
      });
    });
    expect(ran).toBe(true);
  });

  it('isBrowserOffline retorna boolean', () => {
    expect(typeof isBrowserOffline()).toBe('boolean');
  });
});

describe('repositoryV3ToolkitContract — cache base', () => {
  it('createMemoryCache respeita TTL', async () => {
    vi.useFakeTimers();
    const cache = createMemoryCache(
      { ttlMs: 1000, namespace: 'test:toolkit' },
      (v) => [v.legacyId],
    );
    cache.set('tenant-1', 'lead-1', { legacyId: 'lead-1' });
    expect(cache.get('tenant-1', 'lead-1')?.legacyId).toBe('lead-1');
    vi.advanceTimersByTime(1500);
    expect(cache.get('tenant-1', 'lead-1')).toBeNull();
    vi.useRealTimers();
  });

  it('invalidateTenant limpa entradas do tenant', () => {
    const cache = createMemoryCache(
      { ttlMs: 60000, namespace: 'test:invalidate' },
      (v) => [v.legacyId],
    );
    cache.set('tenant-1', 'lead-1', { legacyId: 'lead-1' });
    cache.invalidateTenant('tenant-1');
    expect(cache.get('tenant-1', 'lead-1')).toBeNull();
  });
});

describe('repositoryV3ToolkitContract — mapper helpers', () => {
  it('normalizeTenantId trim', () => {
    expect(normalizeTenantId('  abc  ')).toBe('abc');
  });

  it('resolveLegacyId prioriza legacy_id', () => {
    expect(resolveLegacyId({ legacy_id: 'crm-1', id: 'uuid' })).toBe('crm-1');
  });

  it('isUuid valida formato', () => {
    expect(isUuid('7aba7127-409c-4ea4-8dbc-807efc5e189c')).toBe(true);
    expect(isUuid('crmlead-001')).toBe(false);
  });
});
