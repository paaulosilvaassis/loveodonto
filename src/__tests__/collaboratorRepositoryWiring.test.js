/**
 * Sprint 1A Ticket 1.4 — Testes wiring interno CollaboratorRepository facade.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCollaboratorCache } from '../repositories/collaborator/collaboratorCache.ts';
import {
  CollaboratorRepository,
  collaboratorRepository,
} from '../repositories/collaborator/collaboratorRepository.ts';
import {
  CollaboratorRepositoryFlagsValidationError,
} from '../repositories/collaborator/collaboratorRepositoryFlags.ts';
import {
  CollaboratorMapperValidationError,
} from '../repositories/collaborator/collaboratorMapper.ts';
import {
  CollaboratorRepositoryLocalWriteDisabledError,
  CollaboratorRepositoryRemoteReadDisabledError,
  CollaboratorRepositoryRemoteWriteDisabledError,
} from '../repositories/collaborator/collaboratorTypes.ts';
import { mapSupabaseRowToCore } from '../repositories/collaborator/collaboratorMapper.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, '..');
const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const UUID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
const LEGACY_ID = 'col-test-wiring-001';

const IDB_ONLY_FLAGS = {
  RH_SUPABASE_READ: false,
  RH_SUPABASE_READ_PRIMARY: false,
  RH_SUPABASE_WRITE: false,
  RH_IDB_WRITE_DISABLED: false,
  RH_ALLOW_SYNTHETIC_STUBS: true,
  RH_SHADOW_READ: false,
  RH_COMPARE_IDB_SUPABASE: false,
};

function buildSupabaseRow() {
  return {
    id: UUID,
    tenant_id: TENANT,
    legacy_id: LEGACY_ID,
    status: 'ativo',
    apelido: 'Ana',
    nome_completo: 'Ana Teste',
    nome_social: null,
    sexo: null,
    data_nascimento: null,
    email: 'ana@test.com',
    foto_url: null,
    rh_categoria: 'corpo_clinico',
    cargo: 'dentista',
    rh_funcao_descricao: null,
    tipo_vinculo: 'clt',
    setor: 'clinico',
    especialidades: [],
    registro_profissional: null,
    conselho_nome: null,
    conselho_uf: null,
    agenda_enabled: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    created_by: null,
    updated_by: null,
    deleted_at: null,
  };
}

function createMocks() {
  const core = mapSupabaseRowToCore(buildSupabaseRow());
  return {
    supabase: {
      list: vi.fn().mockResolvedValue([core]),
      findByUuid: vi.fn().mockResolvedValue(core),
      findByLegacyId: vi.fn().mockResolvedValue(core),
      upsert: vi.fn().mockResolvedValue(core),
      softDelete: vi.fn().mockResolvedValue(undefined),
    },
    indexedDb: {
      list: vi.fn(() => []),
      findByLegacyId: vi.fn(() => null),
      findByUuid: vi.fn(() => null),
      upsertMirror: vi.fn((row) => mapSupabaseRowToCore(buildSupabaseRow())),
      removeMirror: vi.fn(),
    },
    cache: createCollaboratorCache(),
    core,
  };
}

const VALID_CREATE_DTO = {
  apelido: 'Ana',
  nomeCompleto: 'Ana Teste',
  rhCategoria: 'corpo_clinico',
  cargo: 'dentista',
  tipoVinculo: 'clt',
  setor: 'clinico',
};

function collectSourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (full.includes(`${path.sep}repositories${path.sep}collaborator`)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      collectSourceFiles(full, acc);
      continue;
    }
    if (/\.(js|jsx|ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe('collaboratorRepositoryWiring — routing por flags', () => {
  it('listCore com defaults seguros usa IDB e não chama Supabase', async () => {
    const mocks = createMocks();
    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: IDB_ONLY_FLAGS },
    });

    const result = await repo.listCore(TENANT);

    expect(result.source).toBe('indexeddb');
    expect(mocks.indexedDb.list).toHaveBeenCalledWith(TENANT, undefined);
    expect(mocks.supabase.list).not.toHaveBeenCalled();
  });

  it('READ=false bloqueia syncCacheFromRemote (leitura Supabase primária)', async () => {
    const mocks = createMocks();
    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      flagsInput: { overrides: IDB_ONLY_FLAGS },
    });

    await expect(repo.syncCacheFromRemote(TENANT)).rejects.toThrow(
      CollaboratorRepositoryRemoteReadDisabledError,
    );
    expect(mocks.supabase.list).not.toHaveBeenCalled();
  });

  it('SHADOW_READ + COMPARE chama Supabase para compare sem mudar retorno primário IDB', async () => {
    const mocks = createMocks();
    mocks.indexedDb.list.mockReturnValue([]);

    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: {
        overrides: {
          ...IDB_ONLY_FLAGS,
          RH_SHADOW_READ: true,
          RH_COMPARE_IDB_SUPABASE: true,
        },
      },
    });

    const result = await repo.listCore(TENANT);

    expect(result.source).toBe('indexeddb');
    expect(mocks.indexedDb.list).toHaveBeenCalled();
    expect(mocks.supabase.list).toHaveBeenCalledWith(TENANT);
    expect(repo.lastShadowCompare).not.toBeNull();
    expect(repo.lastShadowCompare.tenantId).toBe(TENANT);
  });

  it('READ_PRIMARY + READ=true usa Supabase como leitura primária e hidrata IDB', async () => {
    const mocks = createMocks();
    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: {
        overrides: {
          RH_SUPABASE_READ: true,
          RH_SUPABASE_READ_PRIMARY: true,
        },
      },
    });

    const result = await repo.listCore(TENANT);

    expect(result.source).toBe('supabase');
    expect(mocks.supabase.list).toHaveBeenCalled();
    expect(mocks.indexedDb.upsertMirror).toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].uuid).toBe(UUID);
  });

  it('READ_PRIMARY offline usa indexeddb-offline sem chamar Supabase', async () => {
    const mocks = createMocks();
    const offlineSpy = vi.spyOn(
      await import('../repositories/collaborator/collaboratorRepositorySync.ts'),
      'isBrowserOffline',
    ).mockReturnValue(true);
    mocks.indexedDb.list.mockReturnValue([mocks.core]);

    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: {
        overrides: {
          ...IDB_ONLY_FLAGS,
          RH_SUPABASE_READ: true,
          RH_SUPABASE_READ_PRIMARY: true,
        },
      },
    });

    const result = await repo.listCore(TENANT);

    expect(result.source).toBe('indexeddb-offline');
    expect(mocks.supabase.list).not.toHaveBeenCalled();
    expect(mocks.indexedDb.list).toHaveBeenCalledWith(TENANT, undefined);
    offlineSpy.mockRestore();
  });

  it('syncCacheFromRemote hidrata cache e espelho IDB', async () => {
    const mocks = createMocks();
    const offlineSpy = vi.spyOn(
      await import('../repositories/collaborator/collaboratorRepositorySync.ts'),
      'isBrowserOffline',
    ).mockReturnValue(false);
    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: {
        overrides: {
          ...IDB_ONLY_FLAGS,
          RH_SUPABASE_READ: true,
          RH_SUPABASE_READ_PRIMARY: true,
        },
      },
    });

    const count = await repo.syncCacheFromRemote(TENANT);

    expect(count).toBe(1);
    expect(mocks.supabase.list).toHaveBeenCalledWith(TENANT);
    expect(mocks.indexedDb.upsertMirror).toHaveBeenCalled();
    offlineSpy.mockRestore();
  });

  it('WRITE=false bloqueia createCore remoto', async () => {
    const mocks = createMocks();
    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      flagsInput: { overrides: { RH_SUPABASE_WRITE: false } },
    });

    await expect(
      repo.createCore({ id: 'u1', tenantId: TENANT }, VALID_CREATE_DTO),
    ).rejects.toThrow(CollaboratorRepositoryRemoteWriteDisabledError);
    expect(mocks.supabase.upsert).not.toHaveBeenCalled();
  });

  it('WRITE=true exige tenantId e payload válido', async () => {
    const mocks = createMocks();
    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: {
        overrides: {
          RH_SUPABASE_READ: true,
          RH_SUPABASE_WRITE: true,
        },
      },
    });

    await expect(
      repo.createCore({ id: 'u1', tenantId: '' }, VALID_CREATE_DTO),
    ).rejects.toThrow(CollaboratorMapperValidationError);

    await expect(
      repo.createCore(
        { id: 'u1', tenantId: TENANT },
        { ...VALID_CREATE_DTO, apelido: '' },
      ),
    ).rejects.toThrow(/apelido/);

    const created = await repo.createCore({ id: 'u1', tenantId: TENANT }, VALID_CREATE_DTO);
    expect(created.uuid).toBe(UUID);
    expect(mocks.supabase.upsert).toHaveBeenCalled();
    expect(mocks.indexedDb.upsertMirror).toHaveBeenCalled();
  });

  it('IDB_WRITE_DISABLED=true bloqueia mirror local em createCore', async () => {
    const mocks = createMocks();
    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: {
        overrides: {
          RH_SUPABASE_READ: true,
          RH_SUPABASE_WRITE: true,
          RH_IDB_WRITE_DISABLED: true,
        },
      },
    });

    await repo.createCore({ id: 'u1', tenantId: TENANT }, VALID_CREATE_DTO);
    expect(mocks.supabase.upsert).toHaveBeenCalled();
    expect(mocks.indexedDb.upsertMirror).not.toHaveBeenCalled();
  });

  it('IDB_WRITE_DISABLED sem WRITE=true é combinação inválida', async () => {
    const repo = new CollaboratorRepository({
      flagsInput: {
        overrides: {
          RH_IDB_WRITE_DISABLED: true,
          RH_SUPABASE_WRITE: false,
        },
      },
    });
    await expect(repo.listCore(TENANT)).rejects.toThrow(
      CollaboratorRepositoryFlagsValidationError,
    );
  });

  it('combinação WRITE sem READ continua rejeitada ao resolver flags', async () => {
    const repo = new CollaboratorRepository({
      flagsInput: {
        overrides: {
          RH_SUPABASE_WRITE: true,
          RH_SUPABASE_READ: false,
        },
      },
    });
    await expect(repo.listCore(TENANT)).rejects.toThrow(
      CollaboratorRepositoryFlagsValidationError,
    );
  });
});

describe('collaboratorRepositoryWiring — isolamento', () => {
  it('singleton default listCore não lança (comportamento seguro IDB)', async () => {
    const mocks = createMocks();
    mocks.indexedDb.list.mockReturnValue([]);
    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      flagsInput: { overrides: IDB_ONLY_FLAGS },
    });
    const result = await repo.listCore(TENANT);
    expect(result.source).toBe('indexeddb');
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('nenhum arquivo fora do repository importa collaboratorRepository facade', () => {
    const offenders = [];
    const allowed = new Set([
      'services/collaboratorServiceRepositoryBridge.js',
      'services/collaboratorServiceReadAdapter.js',
      'services/rhQaToolsService.js',
    ]);
    for (const file of collectSourceFiles(SRC_ROOT)) {
      const relative = path.relative(SRC_ROOT, file).replace(/\\/g, '/');
      if (allowed.has(relative)) continue;

      const content = readFileSync(file, 'utf8');
      if (
        /from ['"].*collaboratorRepository['"]/.test(content)
        || /from ['"].*collaboratorRepository\.ts/.test(content)
      ) {
        if (!content.includes('collaboratorRepositoryFlags')) {
          offenders.push(relative);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
