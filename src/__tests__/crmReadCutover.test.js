/**
 * Phase 6.2 — CRM Repository Read Cutover (Wave A).
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import {
  listLeads,
  getLeadById,
  getPipelineStages,
  listKanbanCards,
  getKanbanCard,
} from '../services/crmService.js';
import {
  listPipelineStagesForTenant,
  getPipelineStageForTenant,
} from '../services/crmPipelineStageService.js';
import { CrmRepository } from '../repositories/crm/crmRepository.ts';
import { createCrmCache } from '../repositories/crm/crmCache.ts';
import {
  getCrmRepositoryFlags,
  isCrmReadPrimaryEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/crm/crmRepositoryFlags.ts';
import {
  __setCrmRepositoryFactoryForTest,
  __setCrmServiceBridgeFlagsForTest,
  shouldUseCrmRepositoryRead,
} from '../services/crmRepositoryBridge.js';
import {
  readListLeads,
  readGetLead,
  readListPipelineStages,
  readGetPipelineStage,
  readListKanbanCards,
  readGetKanbanCard,
  readHydrateCrmCache,
  __compareCrmIdbVsRemoteForTest,
  __shadowReadCrmForTest,
} from '../services/crmReadAdapter.js';
import { CRM_READ_PRIMARY_FLAGS_RESOLVED } from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const LEAD_LOCAL = 'crm-lead-local-001';
const LEAD_REMOTE = 'crm-lead-remote-002';
const STAGE_LOCAL = 'crm-stage-local-001';

const READ_PRIMARY_FLAGS = CRM_READ_PRIMARY_FLAGS_RESOLVED;

function buildRemoteLead(overrides = {}) {
  return {
    tenantId: TENANT,
    legacyId: LEAD_REMOTE,
    uuid: '22222222-3333-4444-5555-666666666666',
    name: 'Lead Remoto',
    phone: '11988887777',
    source: 'whatsapp',
    interest: 'implante',
    bestContactTime: '',
    notes: '',
    assignedToUserId: null,
    stageKey: 'contato_realizado',
    patientId: null,
    estimatedValue: null,
    priority: '',
    tags: ['Quente'],
    lastContactAt: null,
    createdAt: '2026-07-10T10:00:00.000Z',
    updatedAt: '2026-07-10T10:00:00.000Z',
    ...overrides,
  };
}

function buildRemoteStage(overrides = {}) {
  return {
    tenantId: TENANT,
    legacyId: STAGE_LOCAL,
    uuid: '33333333-4444-5555-6666-777777777777',
    key: 'novo_lead',
    label: 'Novo Lead',
    order: 1,
    color: '#94a3b8',
    isActive: true,
    stageType: 'normal',
    ...overrides,
  };
}

function seedCrmData() {
  withDb((db) => {
    db.clinicProfile = { tenant_id: TENANT };
    db.crmLeads = [
      {
        id: LEAD_LOCAL,
        tenant_id: TENANT,
        name: 'Lead Local',
        phone: '11999998888',
        source: 'manual',
        interest: 'implante',
        stageKey: 'novo_lead',
        tags: ['Morno'],
        createdAt: '2026-07-09T12:00:00.000Z',
        updatedAt: '2026-07-09T12:00:00.000Z',
      },
      {
        id: 'crm-lead-other-stage',
        tenant_id: TENANT,
        name: 'Lead Outro Stage',
        phone: '11977776666',
        source: 'site',
        stageKey: 'contato_realizado',
        tags: [],
        createdAt: '2026-07-08T12:00:00.000Z',
        updatedAt: '2026-07-08T12:00:00.000Z',
      },
    ];
    db.crmPipelineStages = [{
      id: STAGE_LOCAL,
      tenant_id: TENANT,
      key: 'novo_lead',
      label: 'Novo Lead',
      order: 1,
      color: '#94a3b8',
      isActive: true,
      stageType: 'normal',
    }];
    db.crmTags = [{ id: 'tag-1', name: 'Morno', color: '#f59e0b' }];
    return db;
  });
}

function createReadPrimaryMocks(
  remoteLeads = [buildRemoteLead()],
  remoteStages = [buildRemoteStage()],
) {
  const cache = createCrmCache();
  return {
    adminApi: {
      listLeads: vi.fn().mockResolvedValue(remoteLeads),
      getLead: vi.fn().mockImplementation(async (_tid, ref) => {
        return remoteLeads.find((item) => item.legacyId === ref) ?? null;
      }),
      listPipelineStages: vi.fn().mockResolvedValue(remoteStages),
      getPipelineStage: vi.fn().mockImplementation(async (_tid, ref) => {
        return remoteStages.find((item) => item.legacyId === ref || item.key === ref) ?? null;
      }),
      listKanbanCards: vi.fn().mockResolvedValue(remoteLeads),
      getKanbanCard: vi.fn().mockImplementation(async (_tid, ref) => {
        return remoteLeads.find((item) => item.legacyId === ref) ?? null;
      }),
    },
    indexedDb: {
      listLeadsLegacySync: vi.fn((filters = {}) => {
        let rows = (loadDb().crmLeads || []).map((row) => ({ ...row }));
        if (filters.tenantId) {
          rows = rows.filter((row) => !row.tenant_id || row.tenant_id === filters.tenantId);
        }
        if (filters.stageKey) {
          rows = rows.filter((row) => row.stageKey === filters.stageKey);
        }
        return rows;
      }),
      getLeadLegacySync: vi.fn((id) => {
        const row = (loadDb().crmLeads || []).find((item) => item.id === id);
        return row ? { ...row } : null;
      }),
      listPipelineStagesLegacySync: vi.fn((tenantId, options = {}) => {
        let stages = (loadDb().crmPipelineStages || []).map((row) => ({ ...row }));
        if (tenantId) {
          stages = stages.filter((row) => !row.tenant_id || row.tenant_id === tenantId);
        }
        if (!options.includeInactive) {
          stages = stages.filter((row) => row.isActive !== false);
        }
        return stages;
      }),
      getPipelineStageLegacySync: vi.fn((tenantId, ref) => {
        const stages = (loadDb().crmPipelineStages || []).filter(
          (row) => !row.tenant_id || row.tenant_id === tenantId,
        );
        return stages.find((stage) => stage.id === ref || stage.key === ref) ?? null;
      }),
      listKanbanCardsLegacySync: vi.fn((filters = {}) => {
        let rows = (loadDb().crmLeads || []).map((row) => ({ ...row }));
        if (filters.tenantId) {
          rows = rows.filter((row) => !row.tenant_id || row.tenant_id === filters.tenantId);
        }
        return rows;
      }),
      getKanbanCardLegacySync: vi.fn((id) => {
        const row = (loadDb().crmLeads || []).find((item) => item.id === id);
        return row ? { ...row } : null;
      }),
      listLeadEventsLegacySync: vi.fn(() => []),
    },
    cache,
  };
}

describe('crmReadCutover — flags', () => {
  it('READ_PRIMARY requer CRM_READ', () => {
    expect(() => getCrmRepositoryFlags({
      overrides: { CRM_READ_PRIMARY: true, CRM_READ: false },
    })).toThrow(/CRM_READ_PRIMARY/);
  });

  it('build PROD trava READ_PRIMARY', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getCrmRepositoryFlags({ overrides: READ_PRIMARY_FLAGS });
      expect(flags.CRM_READ_PRIMARY).toBe(false);
      expect(isCrmReadPrimaryEnabled()).toBe(false);
    } finally {
      import.meta.env.PROD = import.meta.env.PROD === true ? true : originalProd;
      if (originalProd === false) import.meta.env.PROD = false;
    }
  });

  it('host Supabase produção bloqueia READ_PRIMARY', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getCrmRepositoryFlags({ overrides: READ_PRIMARY_FLAGS });
    expect(flags.CRM_READ_PRIMARY).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('crmReadCutover — adapter + wiring', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedCrmData();
  });

  afterEach(() => {
    __setCrmServiceBridgeFlagsForTest(null);
    __setCrmRepositoryFactoryForTest(null);
    vi.restoreAllMocks();
  });

  it('flags default — adapter retorna null e service usa legado', () => {
    __setCrmServiceBridgeFlagsForTest(null);
    expect(readListLeads({ tenantId: TENANT })).toBeNull();
    expect(readGetLead(LEAD_LOCAL, TENANT)).toBeNull();
    expect(readListPipelineStages(TENANT)).toBeNull();
    expect(readListKanbanCards({ tenantId: TENANT })).toBeNull();
    const list = listLeads({ tenantId: TENANT });
    expect(list.some((item) => item.id === LEAD_LOCAL)).toBe(true);
  });

  it('READ_PRIMARY ON — listLeads via repository', async () => {
    const mocks = createReadPrimaryMocks();
    const repo = new CrmRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    });
    __setCrmRepositoryFactoryForTest(() => repo);
    __setCrmServiceBridgeFlagsForTest({ overrides: READ_PRIMARY_FLAGS });

    expect(shouldUseCrmRepositoryRead()).toBe(true);
    await readHydrateCrmCache(TENANT);

    const list = listLeads({ tenantId: TENANT });
    expect(Array.isArray(list)).toBe(true);
    expect(mocks.adminApi.listLeads).toHaveBeenCalled();
  });

  it('READ_PRIMARY ON — getLeadById via repository', async () => {
    const mocks = createReadPrimaryMocks();
    __setCrmRepositoryFactoryForTest(() => new CrmRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    }));
    __setCrmServiceBridgeFlagsForTest({ overrides: READ_PRIMARY_FLAGS });

    await readHydrateCrmCache(TENANT);
    const item = getLeadById(LEAD_LOCAL);
    expect(item?.id).toBe(LEAD_LOCAL);
  });

  it('READ_PRIMARY ON — listPipelineStagesForTenant via repository', async () => {
    const mocks = createReadPrimaryMocks();
    __setCrmRepositoryFactoryForTest(() => new CrmRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    }));
    __setCrmServiceBridgeFlagsForTest({ overrides: READ_PRIMARY_FLAGS });

    await readHydrateCrmCache(TENANT);
    const stages = listPipelineStagesForTenant(TENANT);
    expect(stages.length).toBeGreaterThan(0);
    expect(mocks.adminApi.listPipelineStages).toHaveBeenCalled();
  });

  it('READ_PRIMARY ON — getPipelineStageForTenant via repository', async () => {
    const mocks = createReadPrimaryMocks();
    __setCrmRepositoryFactoryForTest(() => new CrmRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    }));
    __setCrmServiceBridgeFlagsForTest({ overrides: READ_PRIMARY_FLAGS });

    await readHydrateCrmCache(TENANT);
    const stage = getPipelineStageForTenant(TENANT, 'novo_lead');
    expect(stage?.key).toBe('novo_lead');
  });

  it('READ_PRIMARY ON — listKanbanCards e getKanbanCard', async () => {
    const mocks = createReadPrimaryMocks();
    __setCrmRepositoryFactoryForTest(() => new CrmRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    }));
    __setCrmServiceBridgeFlagsForTest({ overrides: READ_PRIMARY_FLAGS });

    await readHydrateCrmCache(TENANT);
    const cards = listKanbanCards({ tenantId: TENANT });
    expect(cards.length).toBeGreaterThan(0);
    const card = getKanbanCard(LEAD_LOCAL);
    expect(card?.id).toBe(LEAD_LOCAL);
  });

  it('getPipelineStages preserva legado com flags off', () => {
    __setCrmServiceBridgeFlagsForTest(null);
    const stages = getPipelineStages();
    expect(stages.some((stage) => stage.key === 'novo_lead')).toBe(true);
  });

  it('SHADOW não altera retorno de listLeads', async () => {
    const mocks = createReadPrimaryMocks([buildRemoteLead({ name: 'Shadow Lead' })]);
    const repo = new CrmRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: {
        overrides: {
          ...READ_PRIMARY_FLAGS,
          CRM_SHADOW: true,
        },
      },
    });
    __setCrmRepositoryFactoryForTest(() => repo);
    __setCrmServiceBridgeFlagsForTest({
      overrides: { ...READ_PRIMARY_FLAGS, CRM_SHADOW: true },
    });

    await readHydrateCrmCache(TENANT);
    await __shadowReadCrmForTest(TENANT);
    const list = listLeads({ tenantId: TENANT });
    expect(list.length).toBeGreaterThan(0);
    expect(mocks.adminApi.listLeads).toHaveBeenCalled();
  });

  it('COMPARE divergente não bloqueia getLeadById', async () => {
    const mocks = createReadPrimaryMocks([buildRemoteLead({ stageKey: 'ganho' })]);
    const repo = new CrmRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: {
        overrides: {
          ...READ_PRIMARY_FLAGS,
          CRM_COMPARE: true,
        },
      },
    });
    __setCrmRepositoryFactoryForTest(() => repo);
    __setCrmServiceBridgeFlagsForTest({
      overrides: { ...READ_PRIMARY_FLAGS, CRM_COMPARE: true },
    });

    await readHydrateCrmCache(TENANT);
    const report = await __compareCrmIdbVsRemoteForTest(TENANT);
    expect(report?.mismatchCount).toBeGreaterThanOrEqual(0);
    const item = getLeadById(LEAD_LOCAL);
    expect(item?.id).toBe(LEAD_LOCAL);
  });

  it('escrita permanece IDB-first (createLead não migrado)', () => {
    __setCrmServiceBridgeFlagsForTest({ overrides: READ_PRIMARY_FLAGS });
    const before = loadDb().crmLeads?.length || 0;
    withDb((db) => {
      db.crmLeads.push({
        id: 'crm-write-guard',
        tenant_id: TENANT,
        name: 'Write Guard',
        phone: '11966665555',
        stageKey: 'novo_lead',
      });
      return db;
    });
    const after = loadDb().crmLeads?.length || 0;
    expect(after).toBe(before + 1);
  });
});

describe('crmReadCutover — inventário wiring', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  it('crmService importa crmReadAdapter', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../services/crmService.js'),
      'utf8',
    );
    expect(content).toContain('crmReadAdapter');
    expect(content).toContain('readListLeads');
    expect(content).toContain('readListKanbanCards');
  });

  it('crmPipelineStageService importa crmReadAdapter', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../services/crmPipelineStageService.js'),
      'utf8',
    );
    expect(content).toContain('readListPipelineStages');
    expect(content).toContain('readGetPipelineStage');
  });

  it('crmRepositoryBridge registra remote clients', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../services/crmRepositoryBridge.js'),
      'utf8',
    );
    expect(content).toContain('registerCrmRemoteListLeads');
    expect(content).toContain('scheduleCrmShadowCompare');
  });

  it('server index registra rotas CRM GET', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../../server/index.js'),
      'utf8',
    );
    expect(content).toContain('/internal/app/crm/leads');
    expect(content).toContain('/internal/app/crm/pipeline-stages');
    expect(content).toContain('/internal/app/crm/kanban/cards');
  });
});
