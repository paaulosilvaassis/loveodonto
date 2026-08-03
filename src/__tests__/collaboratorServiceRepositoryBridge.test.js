/**
 * Sprint 1B Ticket 1.6 — Legacy bridge collaboratorService ↔ repository.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initDb, resetDb, loadDb } from '../db/index.js';
import {
  createCollaborator,
  getCollaborator,
  listCollaborators,
} from '../services/collaboratorService.js';
import {
  __setCollaboratorRepositoryFactoryForTest,
  __setCollaboratorServiceBridgeFlagsForTest,
  collaboratorRepositoryWriteGateActive,
  scheduleCollaboratorShadowRead,
  shouldRunCollaboratorShadowRead,
  shouldUseCollaboratorRepositoryRead,
  shouldUseCollaboratorRepositoryWrite,
} from '../services/collaboratorServiceRepositoryBridge.js';
import { collaboratorIndexedDbRepository } from '../repositories/collaborator/collaboratorIndexedDbRepository.ts';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const admin = { id: 'user-admin', role: 'admin', tenantId: TENANT };

function buildLegacyReadRepositoryMock(extra = {}) {
  return {
    listLegacySync: (filters, saas) => collaboratorIndexedDbRepository.listLegacySync(filters, saas),
    getLegacyProfileSync: (id) => collaboratorIndexedDbRepository.getLegacyProfileSync(id),
    getLegacySatellitesSync: (id) => collaboratorIndexedDbRepository.getLegacySatellitesSync(id),
    listProfessionalOptionsLegacySync: (opts, saas) =>
      collaboratorIndexedDbRepository.listProfessionalOptionsLegacySync(opts, saas),
    listCollaboratorsByTenantLegacySync: (tid) =>
      collaboratorIndexedDbRepository.listCollaboratorsByTenantLegacySync(tid),
    getPrimaryPhoneLegacySync: (id) => collaboratorIndexedDbRepository.getPrimaryPhoneLegacySync(id),
    getLegacyAccessLinkSync: (id) => collaboratorIndexedDbRepository.getLegacyAccessLinkSync(id),
    getClinicProfileTenantIdSync: () => collaboratorIndexedDbRepository.getClinicProfileTenantIdSync(),
    ...extra,
  };
}

function buildShadowCompareMock(overrides = {}) {
  const shadow = {
    tenantId: TENANT,
    comparedAt: new Date().toISOString(),
    counts: { local: 1, remote: 1 },
    match: [],
    missing_local: [],
    missing_remote: [],
    field_diff: [],
    duplicate: [],
    invalid_uuid: [],
    invalid_legacy: [],
    ...overrides,
  };
  return {
    tenantId: TENANT,
    comparedAt: shadow.comparedAt,
    matchCount: shadow.match.length,
    mismatchCount: 0,
    onlyInIndexedDb: [],
    onlyInSupabase: [],
    diffs: [],
    shadow,
  };
}

function seedCollaborator() {
  return createCollaborator(admin, {
    apelido: 'Dra. Bridge',
    nomeCompleto: 'Bridge Teste',
    rhCategoria: 'Corpo Clínico',
    cargo: 'Clínico Geral',
    tipoVinculo: 'CLT',
    setor: 'Clínico',
    conselhoNome: 'CRO',
    conselhoUf: 'SP',
    registroProfissional: '554433',
    status: 'ativo',
  });
}

describe('collaboratorServiceRepositoryBridge — gates default', () => {
  beforeEach(() => {
    __setCollaboratorServiceBridgeFlagsForTest(null);
    __setCollaboratorRepositoryFactoryForTest(null);
  });

  it('shouldUseCollaboratorRepositoryRead retorna false por padrão', () => {
    expect(shouldUseCollaboratorRepositoryRead()).toBe(false);
  });

  it('shouldUseCollaboratorRepositoryWrite retorna false por padrão', () => {
    expect(shouldUseCollaboratorRepositoryWrite()).toBe(false);
  });

  it('shouldRunCollaboratorShadowRead retorna false por padrão', () => {
    expect(shouldRunCollaboratorShadowRead()).toBe(false);
  });

  it('collaboratorRepositoryWriteGateActive false por padrão', () => {
    expect(collaboratorRepositoryWriteGateActive()).toBe(false);
  });
});

describe('collaboratorServiceRepositoryBridge — listCollaborators legado', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    __setCollaboratorServiceBridgeFlagsForTest(null);
    __setCollaboratorRepositoryFactoryForTest(null);
  });

  it('com flags default, listCollaborators retorna mesmo resultado IDB', () => {
    const created = seedCollaborator();
    const list = listCollaborators({ tenantId: TENANT });
    expect(list.some((c) => c.id === created.id)).toBe(true);
    expect(list.find((c) => c.id === created.id)?.apelido).toBe('Dra. Bridge');
  });

  it('com flags default, repository compare não é chamado', async () => {
    const compareMock = vi.fn().mockResolvedValue({
      tenantId: TENANT,
      comparedAt: new Date().toISOString(),
      matchCount: 0,
      mismatchCount: 0,
      onlyInIndexedDb: [],
      onlyInSupabase: [],
      diffs: [],
    });
    __setCollaboratorRepositoryFactoryForTest(() => buildLegacyReadRepositoryMock({
      compareIdbVsSupabase: compareMock,
    }));

    seedCollaborator();
    listCollaborators({ tenantId: TENANT });

    await new Promise((r) => setTimeout(r, 10));
    expect(compareMock).not.toHaveBeenCalled();
  });

  it('assinaturas públicas listCollaborators e getCollaborator inalteradas', () => {
    expect(typeof listCollaborators).toBe('function');
    expect(typeof getCollaborator).toBe('function');
    expect(listCollaborators.toString()).toContain('filters');
    expect(getCollaborator.length).toBe(1);
    expect(getCollaborator.toString()).toContain('collaboratorId');
  });
});

describe('collaboratorServiceRepositoryBridge — shadow read', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    __setCollaboratorRepositoryFactoryForTest(null);
  });

  afterEach(() => {
    __setCollaboratorServiceBridgeFlagsForTest(null);
    __setCollaboratorRepositoryFactoryForTest(null);
  });

  it('com shadow ativo, retorno listCollaborators continua legado IDB', async () => {
    const created = seedCollaborator();
    const compareMock = vi.fn().mockResolvedValue(buildShadowCompareMock({
      match: [{ ref: { legacyId: 'col-x', uuid: 'a1b2c3d4-e5f6-4789-a012-3456789abcde', tenantId: TENANT } }],
    }));
    __setCollaboratorRepositoryFactoryForTest(() => buildLegacyReadRepositoryMock({
      compareIdbVsSupabase: compareMock,
    }));
    __setCollaboratorServiceBridgeFlagsForTest({
      overrides: {
        RH_SHADOW_READ: true,
        RH_COMPARE_IDB_SUPABASE: true,
      },
    });

    const list = listCollaborators({ tenantId: TENANT });
    expect(list.find((c) => c.id === created.id)?.nomeCompleto).toBe('Bridge Teste');

    await vi.waitFor(() => expect(compareMock).toHaveBeenCalledWith(TENANT));
  });

  it('shadow read não altera IndexedDB', async () => {
    const created = seedCollaborator();
    const before = JSON.stringify(loadDb().collaborators);

    __setCollaboratorRepositoryFactoryForTest(() => buildLegacyReadRepositoryMock({
      compareIdbVsSupabase: vi.fn().mockResolvedValue(buildShadowCompareMock({
        mismatchCount: 1,
        missing_local: [{ ref: { legacyId: created.id, uuid: '', tenantId: TENANT } }],
      })),
    }));
    __setCollaboratorServiceBridgeFlagsForTest({
      overrides: {
        RH_SHADOW_READ: true,
        RH_COMPARE_IDB_SUPABASE: true,
      },
    });

    getCollaborator(created.id);
    await new Promise((r) => setTimeout(r, 20));

    expect(JSON.stringify(loadDb().collaborators)).toBe(before);
  });

  it('shadow read não bloqueia retorno síncrono', () => {
    let resolveCompare;
    const comparePromise = new Promise((resolve) => {
      resolveCompare = resolve;
    });
    __setCollaboratorRepositoryFactoryForTest(() => buildLegacyReadRepositoryMock({
      compareIdbVsSupabase: () => comparePromise,
    }));
    __setCollaboratorServiceBridgeFlagsForTest({
      overrides: {
        RH_SHADOW_READ: true,
        RH_COMPARE_IDB_SUPABASE: true,
      },
    });

    const t0 = performance.now();
    scheduleCollaboratorShadowRead(TENANT, 'test');
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(50);

    resolveCompare(buildShadowCompareMock());
  });

  it('erro no shadow read não quebra listCollaborators', async () => {
    __setCollaboratorRepositoryFactoryForTest(() => buildLegacyReadRepositoryMock({
      compareIdbVsSupabase: vi.fn().mockRejectedValue(new Error('supabase down')),
    }));
    __setCollaboratorServiceBridgeFlagsForTest({
      overrides: {
        RH_SHADOW_READ: true,
        RH_COMPARE_IDB_SUPABASE: true,
      },
    });

    const created = seedCollaborator();
    expect(() => listCollaborators({ tenantId: TENANT })).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(getCollaborator(created.id)?.profile?.id).toBe(created.id);
  });

  it('shadow read emite log [RH_SHADOW] estruturado em DEV', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const originalDev = import.meta.env.DEV;
    import.meta.env.DEV = true;

    __setCollaboratorRepositoryFactoryForTest(() => buildLegacyReadRepositoryMock({
      compareIdbVsSupabase: vi.fn().mockResolvedValue(buildShadowCompareMock({
        match: [{ ref: { legacyId: 'col-x', uuid: 'a1b2c3d4-e5f6-4789-a012-3456789abcde', tenantId: TENANT } }],
      })),
    }));
    __setCollaboratorServiceBridgeFlagsForTest({
      overrides: {
        RH_SHADOW_READ: true,
        RH_COMPARE_IDB_SUPABASE: true,
      },
    });

    scheduleCollaboratorShadowRead(TENANT, 'listCollaborators');
    await vi.waitFor(() => {
      expect(debugSpy).toHaveBeenCalledWith(
        '[RH_SHADOW]',
        expect.objectContaining({
          tenant: TENANT,
          matchPercent: 100,
          diffCount: 0,
          context: 'listCollaborators',
        }),
      );
    });

    import.meta.env.DEV = originalDev;
    debugSpy.mockRestore();
  });

  it('nenhum write remoto com flags default ou shadow-only', () => {
    const upsertMock = vi.fn();
    __setCollaboratorRepositoryFactoryForTest(() => buildLegacyReadRepositoryMock({
      compareIdbVsSupabase: vi.fn().mockResolvedValue({}),
      createCore: upsertMock,
      updateCore: upsertMock,
    }));

    seedCollaborator();
    listCollaborators({ tenantId: TENANT });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(shouldUseCollaboratorRepositoryWrite()).toBe(false);
  });
});
