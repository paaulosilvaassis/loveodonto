/**
 * RC-02 — Testes sincronização read-primary / offline-first.
 */
import { describe, expect, it, vi } from 'vitest';

import { createCollaboratorCache } from '../repositories/collaborator/collaboratorCache.ts';
import {
  hydrateCollaboratorIdbCache,
  isRemoteReadUnavailableError,
} from '../repositories/collaborator/collaboratorRepositorySync.ts';
import { CollaboratorRepositorySupabaseUnavailableError } from '../repositories/collaborator/collaboratorTypes.ts';
import { mapSupabaseRowToCore } from '../repositories/collaborator/collaboratorMapper.ts';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const UUID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

function buildCore() {
  return mapSupabaseRowToCore({
    id: UUID,
    tenant_id: TENANT,
    legacy_id: 'col-sync-001',
    status: 'ativo',
    apelido: 'Ana',
    nome_completo: 'Ana Sync',
    nome_social: null,
    sexo: null,
    data_nascimento: null,
    email: 'ana@sync.test',
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
  });
}

describe('collaboratorRepositorySync — hydrateCollaboratorIdbCache', () => {
  it('atualiza cache em memória e espelho IDB', () => {
    const core = buildCore();
    const cache = createCollaboratorCache();
    const idb = { upsertMirror: vi.fn() };
    const flags = {
      RH_SUPABASE_READ: true,
      RH_SUPABASE_READ_PRIMARY: true,
      RH_SUPABASE_WRITE: false,
      RH_IDB_WRITE_DISABLED: false,
      RH_ALLOW_SYNTHETIC_STUBS: true,
      RH_SHADOW_READ: false,
      RH_COMPARE_IDB_SUPABASE: false,
    };

    const count = hydrateCollaboratorIdbCache(idb, cache, TENANT, [core], flags);

    expect(count).toBe(1);
    expect(idb.upsertMirror).toHaveBeenCalledTimes(1);
    expect(cache.get(TENANT, UUID)).toEqual(core);
  });

  it('respeita RH_IDB_WRITE_DISABLED', () => {
    const core = buildCore();
    const cache = createCollaboratorCache();
    const idb = { upsertMirror: vi.fn() };
    const flags = {
      RH_SUPABASE_READ: true,
      RH_SUPABASE_READ_PRIMARY: true,
      RH_SUPABASE_WRITE: true,
      RH_IDB_WRITE_DISABLED: true,
      RH_ALLOW_SYNTHETIC_STUBS: true,
      RH_SHADOW_READ: false,
      RH_COMPARE_IDB_SUPABASE: false,
    };

    hydrateCollaboratorIdbCache(idb, cache, TENANT, [core], flags);

    expect(idb.upsertMirror).not.toHaveBeenCalled();
    expect(cache.get(TENANT, UUID)).toEqual(core);
  });
});

describe('collaboratorRepositorySync — erros de rede', () => {
  it('isRemoteReadUnavailableError reconhece indisponibilidade Supabase e falhas de rede', () => {
    expect(
      isRemoteReadUnavailableError(new CollaboratorRepositorySupabaseUnavailableError('down')),
    ).toBe(true);
    expect(isRemoteReadUnavailableError(new Error('Failed to fetch'))).toBe(true);
    expect(isRemoteReadUnavailableError(new Error('network timeout'))).toBe(true);
    expect(isRemoteReadUnavailableError(new Error('validation'))).toBe(false);
  });
});
