/**
 * Sprint 1A Ticket 1.2 — Testes da foundation Collaborator Repository.
 * Garante contratos, mapper, erros stub, segurança tenant e isolamento do módulo.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as collaboratorBarrel from '../repositories/collaborator/index.ts';
import {
  assertValidTenantId,
  CollaboratorMapperValidationError,
  mapCoreToIndexedDbMirror,
  mapCoreToSupabaseUpsert,
  mapCreateDtoToSupabaseUpsert,
  mapIndexedDbRowToCore,
  mapSupabaseRowToCore,
  toLegacyCollaboratorShape,
  isCollaboratorLegacyId,
  isCollaboratorUuid,
  generateLegacyId,
} from '../repositories/collaborator/collaboratorMapper.ts';
import {
  CollaboratorRepository,
  collaboratorRepository,
} from '../repositories/collaborator/collaboratorRepository.ts';
import {
  CollaboratorSupabaseRepository,
  collaboratorSupabaseRepository,
} from '../repositories/collaborator/collaboratorSupabaseRepository.ts';
import {
  CollaboratorIndexedDbRepository,
  collaboratorIndexedDbRepository,
} from '../repositories/collaborator/collaboratorIndexedDbRepository.ts';
import { collaboratorCache, createCollaboratorCache } from '../repositories/collaborator/collaboratorCache.ts';
import {
  CollaboratorNotFoundError,
  CollaboratorRepositoryNotImplementedError,
} from '../repositories/collaborator/collaboratorTypes.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SRC_ROOT, 'repositories/collaborator');

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const UUID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
const LEGACY_ID = 'col-f93e5dbf-bcc0-4c6d-8f94-f90f7f46bb70';

/** Exports públicos permitidos no barrel index.ts (Ticket 1.5). */
const ALLOWED_PUBLIC_EXPORTS = new Set([
  'collaboratorRepository',
  'createCollaboratorRepository',
  'CollaboratorNotFoundError',
  'CollaboratorRepositoryLocalWriteDisabledError',
  'CollaboratorRepositoryNotImplementedError',
  'CollaboratorRepositoryRemoteReadDisabledError',
  'CollaboratorRepositoryRemoteWriteDisabledError',
  'CollaboratorRepositorySupabaseUnavailableError',
]);

/** Implementações internas que NÃO devem vazar pelo barrel. */
const FORBIDDEN_BARREL_EXPORTS = [
  'CollaboratorRepository',
  'CollaboratorMapperValidationError',
  'assertValidTenantId',
  'requireRepositoryTenantId',
  'requireUserTenantId',
  'collaboratorRepositoryGuards',
  'collaboratorSupabaseRepository',
  'collaboratorIndexedDbRepository',
  'collaboratorCache',
  'mapSupabaseRowToCore',
  'getCollaboratorRepositoryFlags',
  'isRhSupabaseReadEnabled',
];

function buildSupabaseRow(overrides = {}) {
  return {
    id: UUID,
    tenant_id: TENANT,
    legacy_id: LEGACY_ID,
    status: 'ativo',
    apelido: 'Juliana',
    nome_completo: 'Dra. Juliana Silva',
    nome_social: null,
    sexo: 'F',
    data_nascimento: '1990-05-15',
    email: 'drajuliana@implanprime.com.br',
    foto_url: 'https://cdn.example.com/photos/juliana.jpg',
    rh_categoria: 'corpo_clinico',
    cargo: 'dentista',
    rh_funcao_descricao: null,
    tipo_vinculo: 'clt',
    setor: 'clinico',
    especialidades: ['ortodontia'],
    registro_profissional: 'CRO12345',
    conselho_nome: 'CRO',
    conselho_uf: 'SP',
    agenda_enabled: true,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-06-01T12:00:00.000Z',
    created_by: null,
    updated_by: null,
    deleted_at: null,
    ...overrides,
  };
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

/** Pontos autorizados fora do módulo repository (Ticket 1.6 + RC-01 QA). */
const ALLOWED_REPOSITORY_IMPORTERS = new Set([
  'services/collaboratorServiceRepositoryBridge.js',
  'services/collaboratorServiceReadAdapter.js',
  'config/qaToolsGuard.js',
  'services/rhQaToolsService.js',
]);

describe('collaboratorRepositoryFoundation — exports públicos (index.ts)', () => {
  it('exporta apenas contratos e APIs documentados no barrel', () => {
    const exportKeys = Object.keys(collaboratorBarrel);
    for (const key of exportKeys) {
      expect(ALLOWED_PUBLIC_EXPORTS.has(key)).toBe(true);
    }
    expect(exportKeys.length).toBe(ALLOWED_PUBLIC_EXPORTS.size);
  });

  it('não exporta guards nem erros internos de mapper', () => {
    for (const forbidden of FORBIDDEN_BARREL_EXPORTS) {
      expect(collaboratorBarrel).not.toHaveProperty(forbidden);
    }
  });

  it('expõe facade singleton e factory — sem sub-repositories no barrel', () => {
    expect(collaboratorBarrel.collaboratorRepository).toBeDefined();
    expect(typeof collaboratorBarrel.createCollaboratorRepository).toBe('function');
    expect(collaboratorBarrel).not.toHaveProperty('collaboratorSupabaseRepository');
    expect(collaboratorBarrel).not.toHaveProperty('collaboratorIndexedDbRepository');
    expect(collaboratorBarrel).not.toHaveProperty('collaboratorCache');
    expect(collaboratorBarrel).not.toHaveProperty('mapSupabaseRowToCore');
  });
});

describe('collaboratorRepositoryFoundation — CollaboratorCore (contrato de campos)', () => {
  it('possui uuid, legacyId (id legado), tenantId, nomeCompleto (fullName), email, status, cargo, rhCategoria, timestamps', () => {
    const core = mapSupabaseRowToCore(buildSupabaseRow());

    expect(core.uuid).toBe(UUID);
    expect(core.legacyId).toBe(LEGACY_ID);
    expect(core.tenantId).toBe(TENANT);
    expect(core.nomeCompleto).toBe('Dra. Juliana Silva');
    expect(core.email).toBe('drajuliana@implanprime.com.br');
    expect(core.status).toBe('ativo');
    expect(core.cargo).toBe('dentista');
    expect(core.rhCategoria).toBe('corpo_clinico');
    expect(core.createdAt).toBe('2026-01-01T10:00:00.000Z');
    expect(core.updatedAt).toBe('2026-06-01T12:00:00.000Z');
  });

  it('toLegacyCollaboratorShape expõe id = legacyId para UI/satélites IDB', () => {
    const core = mapSupabaseRowToCore(buildSupabaseRow());
    const legacy = toLegacyCollaboratorShape(core);
    expect(legacy.id).toBe(LEGACY_ID);
    expect(legacy.nomeCompleto).toBe(core.nomeCompleto);
    expect(legacy.tenant_id).toBe(TENANT);
  });
});

describe('collaboratorRepositoryFoundation — mapper', () => {
  it('converte snake_case Supabase → camelCase canônico', () => {
    const core = mapSupabaseRowToCore(buildSupabaseRow());
    expect(core.nomeCompleto).toBe('Dra. Juliana Silva');
    expect(core.rhCategoria).toBe('corpo_clinico');
    expect(core.rhFuncaoDescricao).toBeNull();
    expect(core.agendaEnabled).toBe(true);
    expect(core.especialidades).toEqual(['ortodontia']);
  });

  it('converte camelCase canônico → payload Supabase snake_case', () => {
    const core = mapSupabaseRowToCore(buildSupabaseRow());
    const upsert = mapCoreToSupabaseUpsert(core);

    expect(upsert.tenant_id).toBe(TENANT);
    expect(upsert.nome_completo).toBe('Dra. Juliana Silva');
    expect(upsert.rh_categoria).toBe('corpo_clinico');
    expect(upsert.agenda_enabled).toBe(true);
    expect(upsert.legacy_id).toBe(LEGACY_ID);
  });

  it('preserva legacy_id no round-trip Supabase → core → upsert', () => {
    const core = mapSupabaseRowToCore(buildSupabaseRow({ legacy_id: 'col-custom-abc' }));
    const upsert = mapCoreToSupabaseUpsert(core);
    expect(core.legacyId).toBe('col-custom-abc');
    expect(upsert.legacy_id).toBe('col-custom-abc');
  });

  it('mapCreateDtoToSupabaseUpsert exige tenant_id válido', () => {
    expect(() =>
      mapCreateDtoToSupabaseUpsert('', {
        apelido: 'A',
        nomeCompleto: 'B',
        rhCategoria: 'corpo_clinico',
        cargo: 'dentista',
        tipoVinculo: 'clt',
        setor: 'clinico',
      }),
    ).toThrow(CollaboratorMapperValidationError);
  });

  it('rejeita registro Supabase sem tenant_id', () => {
    expect(() => mapSupabaseRowToCore(buildSupabaseRow({ tenant_id: '' }))).toThrow(
      CollaboratorMapperValidationError,
    );
  });

  it('rejeita base64 em foto_url (Supabase row)', () => {
    expect(() =>
      mapSupabaseRowToCore(buildSupabaseRow({ foto_url: 'data:image/png;base64,abc' })),
    ).toThrow(/base64/);
  });

  it('rejeita base64 em fotoUrl (core → upsert)', () => {
    const core = mapSupabaseRowToCore(buildSupabaseRow());
    expect(() =>
      mapCoreToSupabaseUpsert({ ...core, fotoUrl: 'data:image/jpeg;base64,xyz' }),
    ).toThrow(/base64/);
  });

  it('mapIndexedDbRowToCore exige tenant_id no row IDB', () => {
    expect(() =>
      mapIndexedDbRowToCore({
        id: LEGACY_ID,
        tenant_id: null,
        nomeCompleto: 'Test',
      }),
    ).toThrow(CollaboratorMapperValidationError);
  });

  it('mapIndexedDbRowToCore converte camelCase IDB → canônico', () => {
    const core = mapIndexedDbRowToCore({
      id: LEGACY_ID,
      uuid: UUID,
      tenant_id: TENANT,
      nomeCompleto: 'Nome IDB',
      rhCategoria: 'administrativo',
      cargo: 'recepcionista',
      email: 'a@b.com',
      status: 'ativo',
    });
    expect(core.legacyId).toBe(LEGACY_ID);
    expect(core.uuid).toBe(UUID);
    expect(core.nomeCompleto).toBe('Nome IDB');
  });

  it('isCollaboratorUuid e isCollaboratorLegacyId detectam formatos', () => {
    expect(isCollaboratorUuid(UUID)).toBe(true);
    expect(isCollaboratorUuid(LEGACY_ID)).toBe(false);
    expect(isCollaboratorLegacyId(LEGACY_ID)).toBe(true);
    expect(isCollaboratorLegacyId('col-saas-abc')).toBe(true);
  });
});

describe('collaboratorRepositoryFoundation — erros stub', () => {
  const notImplemented = CollaboratorRepositoryNotImplementedError;

  it('CollaboratorRepositoryNotImplementedError tem code e mensagem clara', () => {
    const err = new CollaboratorRepositoryNotImplementedError('TestMethod');
    expect(err.code).toBe('COLLABORATOR_REPOSITORY_NOT_IMPLEMENTED');
    expect(err.message).toContain('TestMethod');
    expect(err.message).toContain('não implementado');
    expect(err.name).toBe('CollaboratorRepositoryNotImplementedError');
  });

  it('facade listCore/getCore com defaults retorna IDB (não NotImplemented)', async () => {
    const list = await collaboratorRepository.listCore(TENANT);
    expect(list.source).toBe('indexeddb');
    const detail = await collaboratorRepository.getCore(TENANT, LEGACY_ID);
    expect(detail === null || typeof detail === 'object').toBe(true);
  });

  it('facade syncCacheFromRemote bloqueia leitura remota com READ=false', async () => {
    const { CollaboratorRepositoryRemoteReadDisabledError } = await import(
      '../repositories/collaborator/collaboratorTypes.ts'
    );
    await expect(collaboratorRepository.syncCacheFromRemote(TENANT)).rejects.toThrow(
      CollaboratorRepositoryRemoteReadDisabledError,
    );
  });

  it('facade createCore bloqueia write remoto com WRITE=false', async () => {
    const { CollaboratorRepositoryRemoteWriteDisabledError } = await import(
      '../repositories/collaborator/collaboratorTypes.ts'
    );
    await expect(
      collaboratorRepository.createCore(
        { id: 'u1', tenantId: TENANT },
        {
          apelido: 'x',
          nomeCompleto: 'y',
          rhCategoria: 'a',
          cargo: 'b',
          tipoVinculo: 'c',
          setor: 'd',
        },
      ),
    ).rejects.toThrow(CollaboratorRepositoryRemoteWriteDisabledError);
  });

  it('sub-repositories Supabase list requer cliente ou retorna via mock em wiring tests', async () => {
    const { CollaboratorRepositorySupabaseUnavailableError } = await import(
      '../repositories/collaborator/collaboratorTypes.ts'
    );
    await expect(collaboratorSupabaseRepository.list(TENANT)).rejects.toThrow(
      CollaboratorRepositorySupabaseUnavailableError,
    );
  });

  it('collaboratorCache get/set funcionam sem NotImplemented', () => {
    const core = mapSupabaseRowToCore(buildSupabaseRow());
    const cache = createCollaboratorCache();
    expect(cache.get(TENANT, LEGACY_ID)).toBeNull();
    cache.set(TENANT, core);
    expect(cache.get(TENANT, LEGACY_ID)?.legacyId).toBe(LEGACY_ID);
  });

  it('generateLegacyId permanece stub (Sprint 1B)', () => {
    expect(() => generateLegacyId()).toThrow(notImplemented);
  });

  it('CollaboratorNotFoundError tem code COLLABORATOR_NOT_FOUND', () => {
    const err = new CollaboratorNotFoundError('col-x');
    expect(err.code).toBe('COLLABORATOR_NOT_FOUND');
  });
});

describe('collaboratorRepositoryFoundation — segurança tenant', () => {
  it('assertValidTenantId rejeita vazio e tenant-1', () => {
    expect(() => assertValidTenantId('')).toThrow(/obrigatório/);
    expect(() => assertValidTenantId('tenant-1')).toThrow(/proibido/);
    expect(() => assertValidTenantId('tenant_1')).toThrow(/proibido/);
    expect(assertValidTenantId(TENANT)).toBe(TENANT);
  });

  it('mapper não gera payload Supabase sem tenant_id', () => {
    expect(() =>
      mapCreateDtoToSupabaseUpsert('tenant-1', {
        apelido: 'A',
        nomeCompleto: 'B',
        rhCategoria: 'x',
        cargo: 'y',
        tipoVinculo: 'z',
        setor: 'w',
      }),
    ).toThrow(CollaboratorMapperValidationError);
    const dto = mapCreateDtoToSupabaseUpsert(TENANT, {
      apelido: 'A',
      nomeCompleto: 'B',
      rhCategoria: 'corpo_clinico',
      cargo: 'dentista',
      tipoVinculo: 'clt',
      setor: 'clinico',
    });
    expect(dto.tenant_id).toBe(TENANT);
    expect(dto.tenant_id).not.toBe('tenant-1');
  });

  it('facade rejeita tenant inválido antes de operar', async () => {
    await expect(collaboratorRepository.getCore('', LEGACY_ID)).rejects.toThrow(
      CollaboratorMapperValidationError,
    );
    await expect(collaboratorRepository.getCore('tenant-1', LEGACY_ID)).rejects.toThrow(
      /proibido/,
    );
  });

  it('CollaboratorSupabaseRepository.upsert valida tenant do dto', async () => {
    const repo = new CollaboratorSupabaseRepository();
    await expect(
      repo.upsert(TENANT, { tenant_id: 'tenant-1', apelido: 'a', nome_completo: 'b', rh_categoria: 'c', cargo: 'd', tipo_vinculo: 'e', setor: 'f' }),
    ).rejects.toThrow(/proibido/);
  });

  it('mapCoreToIndexedDbMirror inclui tenant_id do core', () => {
    const core = mapSupabaseRowToCore(buildSupabaseRow());
    const mirror = mapCoreToIndexedDbMirror(core);
    expect(mirror.tenant_id).toBe(TENANT);
    expect(mirror.id).toBe(LEGACY_ID);
  });
});

describe('collaboratorRepositoryFoundation — import acidental', () => {
  it('nenhum arquivo fora de src/repositories/collaborator importa o repository', () => {
    const offenders = [];
    const files = collectSourceFiles(SRC_ROOT);

    for (const file of files) {
      const relative = path.relative(SRC_ROOT, file).replace(/\\/g, '/');
      if (ALLOWED_REPOSITORY_IMPORTERS.has(relative)) continue;

      const content = readFileSync(file, 'utf8');
      if (
        /repositories\/collaborator|repositories\\collaborator/.test(content)
        || /from ['"].*collaboratorRepository/.test(content)
      ) {
        offenders.push(relative);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('módulo collaborator contém apenas arquivos esperados da foundation', () => {
    const files = readdirSync(REPO_ROOT).sort();
    expect(files).toEqual([
      'collaboratorCache.ts',
      'collaboratorIndexedDbRepository.ts',
      'collaboratorMapper.ts',
      'collaboratorQaIdbHydrate.ts',
      'collaboratorRepository.ts',
      'collaboratorRepositoryCompare.ts',
      'collaboratorRepositoryFlags.ts',
      'collaboratorRepositoryGuards.ts',
      'collaboratorRepositorySync.ts',
      'collaboratorShadowDiffClassification.ts',
      'collaboratorShadowValidation.ts',
      'collaboratorSupabaseRepository.ts',
      'collaboratorTypes.ts',
      'collaboratorUuidMirror.ts',
      'index.ts',
    ]);
  });
});
