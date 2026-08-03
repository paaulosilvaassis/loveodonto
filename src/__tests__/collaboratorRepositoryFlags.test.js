/**
 * Sprint 1A Ticket 1.3 — Testes feature flags Collaborator Repository.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  lockDangerousCollaboratorRepositoryFlags,
  COLLABORATOR_REPOSITORY_FLAG_DEFAULTS,
  COLLABORATOR_REPOSITORY_PRODUCTION_LOCKED_FLAGS,
  CollaboratorRepositoryFlagsValidationError,
  getCollaboratorRepositoryFlags,
  isRhIdbWriteDisabled,
  isRhShadowReadEnabled,
  isRhShadowReadWithoutPrimary,
  isRhSupabaseReadEnabled,
  isRhSupabaseReadPrimaryEnabled,
  isRhSupabaseWriteEnabled,
  RH_ALLOW_SYNTHETIC_STUBS_TRANSITION_NOTICE,
  RH_FLAG_KEYS,
  shouldAllowSyntheticStubs,
  shouldCompareIdbVsSupabase,
  validateCollaboratorRepositoryFlags,
} from '../repositories/collaborator/collaboratorRepositoryFlags.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SRC_ROOT, 'repositories/collaborator');
const FLAGS_FILE = path.join(REPO_ROOT, 'collaboratorRepositoryFlags.ts');

const ALL_FALSE_EXCEPT_STUBS = {
  RH_SUPABASE_READ: false,
  RH_SUPABASE_READ_PRIMARY: false,
  RH_SUPABASE_WRITE: false,
  RH_IDB_WRITE_DISABLED: false,
  RH_ALLOW_SYNTHETIC_STUBS: true,
  RH_SHADOW_READ: false,
  RH_COMPARE_IDB_SUPABASE: false,
};

const RH_ENV_KEYS = [
  'VITE_RH_SUPABASE_READ',
  'VITE_RH_SUPABASE_READ_PRIMARY',
  'VITE_RH_SUPABASE_WRITE',
  'VITE_RH_IDB_WRITE_DISABLED',
  'VITE_RH_SHADOW_READ',
  'VITE_RH_COMPARE_IDB_SUPABASE',
];

function stubNeutralRhEnv() {
  for (const key of RH_ENV_KEYS) {
    vi.stubEnv(key, 'false');
  }
}

function collectSourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (full.includes(`${path.sep}repositories${path.sep}collaborator`)) {
      continue;
    }
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      collectSourceFiles(full, acc);
      continue;
    }
    if (/\.(js|jsx|ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('collaboratorRepositoryFlags — defaults seguros', () => {
  beforeEach(() => {
    stubNeutralRhEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('COLLABORATOR_REPOSITORY_FLAG_DEFAULTS preserva comportamento atual (IDB authority)', () => {
    expect(COLLABORATOR_REPOSITORY_FLAG_DEFAULTS).toEqual(ALL_FALSE_EXCEPT_STUBS);
  });

  it('getCollaboratorRepositoryFlags() sem input retorna defaults', () => {
    expect(getCollaboratorRepositoryFlags()).toEqual(ALL_FALSE_EXCEPT_STUBS);
  });

  it('RH_ALLOW_SYNTHETIC_STUBS default true com aviso de transição documentado', () => {
    expect(COLLABORATOR_REPOSITORY_FLAG_DEFAULTS.RH_ALLOW_SYNTHETIC_STUBS).toBe(true);
    expect(RH_ALLOW_SYNTHETIC_STUBS_TRANSITION_NOTICE).toMatch(/Sprint 1D/);
    expect(RH_ALLOW_SYNTHETIC_STUBS_TRANSITION_NOTICE).toMatch(/col-saas/);
  });

  it('expõe todas as chaves oficiais RH_FLAG_KEYS', () => {
    expect(Object.keys(RH_FLAG_KEYS).sort()).toEqual([
      'RH_ALLOW_SYNTHETIC_STUBS',
      'RH_COMPARE_IDB_SUPABASE',
      'RH_IDB_WRITE_DISABLED',
      'RH_SHADOW_READ',
      'RH_SUPABASE_READ',
      'RH_SUPABASE_READ_PRIMARY',
      'RH_SUPABASE_WRITE',
    ]);
  });
});

describe('collaboratorRepositoryFlags — produção', () => {
  it('lockDangerousCollaboratorRepositoryFlags força flags perigosas false', () => {
    const locked = lockDangerousCollaboratorRepositoryFlags({
      RH_SUPABASE_READ: true,
      RH_SUPABASE_READ_PRIMARY: true,
      RH_SUPABASE_WRITE: true,
      RH_IDB_WRITE_DISABLED: true,
      RH_ALLOW_SYNTHETIC_STUBS: true,
      RH_SHADOW_READ: true,
      RH_COMPARE_IDB_SUPABASE: true,
    });

    for (const key of COLLABORATOR_REPOSITORY_PRODUCTION_LOCKED_FLAGS) {
      expect(locked[key]).toBe(false);
    }
    expect(locked.RH_ALLOW_SYNTHETIC_STUBS).toBe(true);
  });

  it('em runtime vitest (não prod), overrides válidos são respeitados', () => {
    const flags = getCollaboratorRepositoryFlags({
      overrides: {
        RH_SUPABASE_READ: true,
        RH_SHADOW_READ: true,
        RH_COMPARE_IDB_SUPABASE: true,
      },
    });
    expect(flags.RH_SUPABASE_READ).toBe(true);
    expect(flags.RH_SHADOW_READ).toBe(true);
    expect(flags.RH_COMPARE_IDB_SUPABASE).toBe(true);
  });

  it('READ_PRIMARY forçado false quando host Supabase é produção (RC-02)', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', 'https://uoepkwhqztmsjnzirpev.supabase.co');
    const flags = getCollaboratorRepositoryFlags({
      overrides: {
        RH_SUPABASE_READ: true,
        RH_SUPABASE_READ_PRIMARY: true,
      },
    });
    expect(flags.RH_SUPABASE_READ_PRIMARY).toBe(false);
    expect(isRhSupabaseReadPrimaryEnabled({
      overrides: {
        RH_SUPABASE_READ: true,
        RH_SUPABASE_READ_PRIMARY: true,
      },
    })).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('collaboratorRepositoryFlags — combinações inválidas', () => {
  beforeEach(() => {
    stubNeutralRhEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejeita WRITE=true com READ=false', () => {
    expect(() =>
      validateCollaboratorRepositoryFlags({
        ...ALL_FALSE_EXCEPT_STUBS,
        RH_SUPABASE_WRITE: true,
      }),
    ).toThrow(CollaboratorRepositoryFlagsValidationError);
    expect(() =>
      getCollaboratorRepositoryFlags({
        overrides: { RH_SUPABASE_WRITE: true },
      }),
    ).toThrow(/RH_SUPABASE_WRITE=true exige RH_SUPABASE_READ=true/);
  });

  it('rejeita IDB_WRITE_DISABLED=true com WRITE=false', () => {
    expect(() =>
      validateCollaboratorRepositoryFlags({
        ...ALL_FALSE_EXCEPT_STUBS,
        RH_IDB_WRITE_DISABLED: true,
      }),
    ).toThrow(/RH_IDB_WRITE_DISABLED=true exige RH_SUPABASE_WRITE=true/);
  });

  it('rejeita READ_PRIMARY=true com READ=false', () => {
    expect(() =>
      validateCollaboratorRepositoryFlags({
        ...ALL_FALSE_EXCEPT_STUBS,
        RH_SUPABASE_READ_PRIMARY: true,
      }),
    ).toThrow(/RH_SUPABASE_READ_PRIMARY=true exige RH_SUPABASE_READ=true/);
  });

  it('rejeita COMPARE=true sem shadow/read', () => {
    expect(() =>
      validateCollaboratorRepositoryFlags({
        ...ALL_FALSE_EXCEPT_STUBS,
        RH_COMPARE_IDB_SUPABASE: true,
      }),
    ).toThrow(/RH_COMPARE_IDB_SUPABASE=true exige/);
  });

  it('aceita combinação válida WRITE + READ', () => {
    const flags = getCollaboratorRepositoryFlags({
      overrides: {
        RH_SUPABASE_READ: true,
        RH_SUPABASE_WRITE: true,
      },
    });
    expect(flags.RH_SUPABASE_WRITE).toBe(true);
  });
});

describe('collaboratorRepositoryFlags — helpers', () => {
  beforeEach(() => {
    stubNeutralRhEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('isRhSupabaseReadEnabled false nos defaults', () => {
    expect(isRhSupabaseReadEnabled()).toBe(false);
  });

  it('isRhSupabaseReadEnabled true quando READ ou READ_PRIMARY', () => {
    expect(
      isRhSupabaseReadEnabled({ overrides: { RH_SUPABASE_READ: true } }),
    ).toBe(true);
    expect(
      isRhSupabaseReadEnabled({
        overrides: { RH_SUPABASE_READ: true, RH_SUPABASE_READ_PRIMARY: true },
      }),
    ).toBe(true);
  });

  it('isRhSupabaseWriteEnabled reflete RH_SUPABASE_WRITE', () => {
    expect(isRhSupabaseWriteEnabled()).toBe(false);
    expect(
      isRhSupabaseWriteEnabled({
        overrides: { RH_SUPABASE_READ: true, RH_SUPABASE_WRITE: true },
      }),
    ).toBe(true);
  });

  it('RH_SHADOW_READ true não implica leitura primária Supabase', () => {
    const flags = getCollaboratorRepositoryFlags({
      overrides: { RH_SHADOW_READ: true },
    });
    expect(flags.RH_SHADOW_READ).toBe(true);
    expect(flags.RH_SUPABASE_READ_PRIMARY).toBe(false);
    expect(isRhSupabaseReadPrimaryEnabled()).toBe(false);
    expect(
      isRhShadowReadWithoutPrimary({ overrides: { RH_SHADOW_READ: true } }),
    ).toBe(true);
    expect(isRhSupabaseReadEnabled()).toBe(false);
  });

  it('isRhShadowReadEnabled reflete RH_SHADOW_READ', () => {
    expect(isRhShadowReadEnabled()).toBe(false);
    expect(isRhShadowReadEnabled({ overrides: { RH_SHADOW_READ: true } })).toBe(true);
  });

  it('shouldCompareIdbVsSupabase depende de COMPARE + shadow/read', () => {
    expect(shouldCompareIdbVsSupabase()).toBe(false);
    expect(
      shouldCompareIdbVsSupabase({
        overrides: { RH_COMPARE_IDB_SUPABASE: true, RH_SHADOW_READ: true },
      }),
    ).toBe(true);
    expect(
      shouldCompareIdbVsSupabase({
        overrides: {
          RH_COMPARE_IDB_SUPABASE: true,
          RH_SUPABASE_READ: true,
        },
      }),
    ).toBe(true);
  });

  it('shouldAllowSyntheticStubs default true', () => {
    expect(shouldAllowSyntheticStubs()).toBe(true);
  });

  it('isRhIdbWriteDisabled default false', () => {
    expect(isRhIdbWriteDisabled()).toBe(false);
  });
});

describe('collaboratorRepositoryFlags — isolamento', () => {
  it('módulo de flags não invoca localStorage API', () => {
    const content = readFileSync(FLAGS_FILE, 'utf8');
    expect(content).not.toMatch(/localStorage\.(getItem|setItem|removeItem|clear)/);
  });

  it('nenhum arquivo fora de src/repositories/collaborator importa collaboratorRepositoryFlags', () => {
    const offenders = [];
    const allowed = new Set([
      'services/collaboratorServiceRepositoryBridge.js',
      'services/collaboratorServiceReadAdapter.js',
      'config/qaToolsGuard.js',
    ]);
    const files = collectSourceFiles(SRC_ROOT);

    for (const file of files) {
      const relative = path.relative(SRC_ROOT, file).replace(/\\/g, '/');
      if (allowed.has(relative)) continue;

      const content = readFileSync(file, 'utf8');
      if (
        /collaboratorRepositoryFlags/.test(content)
        || /isRhSupabaseReadEnabled/.test(content)
        || /getCollaboratorRepositoryFlags/.test(content)
      ) {
        offenders.push(relative);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('flags, mapper (runtime) e cache não são re-exportados pelo barrel index.ts', () => {
    const indexContent = readFileSync(path.join(REPO_ROOT, 'index.ts'), 'utf8');
    expect(indexContent).not.toMatch(/export\s+\{[^}]*\}\s+from\s+['"]\.\/collaboratorRepositoryFlags/);
    expect(indexContent).not.toMatch(/export\s+\{[^}]*isRhSupabaseReadEnabled/);
    expect(indexContent).not.toMatch(/export\s+\{[^}]*\}\s+from\s+['"]\.\/collaboratorCache/);
    expect(indexContent).not.toMatch(/export\s+\{[^}]*mapSupabaseRowToCore/);
  });
});
