/**
 * Phase 6.3 — CRM Repository Write Cutover (dual-write Wave A).
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import { createLead, updateLead, moveLeadToStage } from '../services/crmService.js';
import {
  createPipelineStage,
  updatePipelineStage,
  deletePipelineStage,
} from '../services/crmPipelineStageService.js';
import { CrmRepository } from '../repositories/crm/crmRepository.ts';
import { createCrmCache } from '../repositories/crm/crmCache.ts';
import {
  getCrmRepositoryFlags,
  isCrmDualWriteEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/crm/crmRepositoryFlags.ts';
import {
  __setCrmRepositoryFactoryForTest,
  __setCrmServiceBridgeFlagsForTest,
  shouldUseCrmRepositoryWrite,
} from '../services/crmRepositoryBridge.js';
import {
  __runCrmDualWriteCreateLeadForTest,
  __runCrmDualWriteMoveLeadToStageForTest,
  __runCrmDualWriteUpdateLeadForTest,
  __runCrmDualWriteCreatePipelineStageForTest,
  __runCrmDualWriteDeletePipelineStageForTest,
} from '../services/crmWriteAdapter.js';
import {
  __clearRepositoryWriteAuditForTest,
  getRepositoryWriteAuditLog,
} from '../repositories/shared/repositoryV3WriteAudit.ts';
import {
  __clearRepositoryWriteIdempotencyForTest,
  shouldSkipDuplicateRepositoryWrite,
  markRepositoryWriteIdempotent,
  buildRepositoryIdempotencyKey,
} from '../repositories/shared/repositoryV3Idempotency.ts';
import { CRM_DUAL_WRITE_FLAGS_RESOLVED, CRM_TEST_FLAG_CONTRACT } from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const WRITE_FLAGS = CRM_DUAL_WRITE_FLAGS_RESOLVED;

const crmUser = {
  id: 'user-crm',
  role: 'admin',
  tenantId: TENANT,
};

function seedCrmWriteContext() {
  withDb((db) => {
    db.clinicProfile = { tenant_id: TENANT };
    db.crmLeads = [];
    db.crmPipelineStages = [{
      id: 'crm-stage-001',
      tenant_id: TENANT,
      key: 'novo_lead',
      label: 'Novo Lead',
      order: 1,
      color: '#60a5fa',
      isActive: true,
      stageType: 'normal',
    }, {
      id: 'crm-stage-conv',
      tenant_id: TENANT,
      key: 'aprovado',
      label: 'Convertido',
      order: 2,
      color: '#10b981',
      isActive: true,
      stageType: 'conversion',
    }, {
      id: 'crm-stage-lost',
      tenant_id: TENANT,
      key: 'perdido',
      label: 'Perdido',
      order: 3,
      color: '#ef4444',
      isActive: true,
      stageType: 'lost',
    }];
    db.crmLeadEvents = [];
    return db;
  });
}

function buildRemoteLead(legacyId, overrides = {}) {
  return {
    tenantId: TENANT,
    legacyId,
    uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    name: 'Lead Remoto',
    phone: '11988887777',
    source: 'manual',
    interest: '',
    bestContactTime: '',
    notes: '',
    assignedToUserId: null,
    stageKey: 'novo_lead',
    patientId: null,
    estimatedValue: null,
    priority: '',
    tags: [],
    lastContactAt: null,
    createdAt: '2026-07-09T12:00:00.000Z',
    updatedAt: '2026-07-09T12:00:00.000Z',
    createdByUserId: null,
    updatedByUserId: null,
    ...overrides,
  };
}

function createWriteMocks() {
  const cache = createCrmCache();
  return {
    adminApi: {
      listLeads: vi.fn().mockResolvedValue([]),
      getLead: vi.fn().mockResolvedValue(null),
      listPipelineStages: vi.fn().mockResolvedValue([]),
      getPipelineStage: vi.fn().mockResolvedValue(null),
      listKanbanCards: vi.fn().mockResolvedValue([]),
      getKanbanCard: vi.fn().mockResolvedValue(null),
      createLead: vi.fn().mockImplementation(async (_tid, dto) => buildRemoteLead(dto.legacyId)),
      updateLead: vi.fn().mockImplementation(async (_tid, ref) => buildRemoteLead(ref)),
      moveLeadStage: vi.fn().mockImplementation(async (_tid, ref, dto) => buildRemoteLead(ref, { stageKey: dto.stageKey })),
      createPipelineStage: vi.fn().mockImplementation(async (_tid, dto) => ({
        tenantId: TENANT,
        legacyId: dto.legacyId,
        uuid: 'stage-uuid-001',
        key: dto.key,
        label: dto.label,
        order: dto.order,
        color: dto.color,
        isActive: dto.isActive,
        stageType: dto.stageType,
      })),
      updatePipelineStage: vi.fn().mockImplementation(async (_tid, ref, dto) => ({
        tenantId: TENANT,
        legacyId: ref,
        uuid: 'stage-uuid-001',
        key: dto.key || 'novo_lead',
        label: dto.label || 'Novo Lead',
        order: dto.order ?? 1,
        color: dto.color || '#60a5fa',
        isActive: dto.isActive !== false,
        stageType: dto.stageType || 'normal',
      })),
      deletePipelineStage: vi.fn().mockResolvedValue(true),
    },
    indexedDb: {
      listLeadsLegacySync: vi.fn((filters = {}) => {
        let rows = (loadDb().crmLeads || []).map((row) => ({ ...row }));
        if (filters.tenantId) {
          rows = rows.filter((row) => !row.tenant_id || row.tenant_id === filters.tenantId);
        }
        return rows;
      }),
      getLeadLegacySync: vi.fn((id) => {
        const row = (loadDb().crmLeads || []).find((item) => item.id === id);
        return row ? { ...row } : null;
      }),
      listPipelineStagesLegacySync: vi.fn((tenantId) =>
        (loadDb().crmPipelineStages || []).filter((row) => row.tenant_id === tenantId).map((row) => ({ ...row })),
      ),
      getPipelineStageLegacySync: vi.fn((tenantId, ref) => {
        const stages = (loadDb().crmPipelineStages || []).filter((row) => row.tenant_id === tenantId);
        return stages.find((stage) => stage.id === ref || stage.key === ref) ?? null;
      }),
      listKanbanCardsLegacySync: vi.fn(() => []),
      getKanbanCardLegacySync: vi.fn(() => null),
      listLeadEventsLegacySync: vi.fn(() => []),
    },
    cache,
  };
}

describe('crmWriteCutover — flags', () => {
  it('contrato vitest mantém flags write OFF', () => {
    expect(CRM_TEST_FLAG_CONTRACT.VITE_CRM_WRITE).toBe('false');
    expect(CRM_TEST_FLAG_CONTRACT.VITE_CRM_DUAL_WRITE).toBe('false');
    expect(CRM_TEST_FLAG_CONTRACT.VITE_CRM_WRITE_PRIMARY).toBe('false');
  });

  it('DUAL_WRITE requer CRM_WRITE e CRM_READ', () => {
    expect(isCrmDualWriteEnabled({ overrides: WRITE_FLAGS })).toBe(true);
    expect(isCrmDualWriteEnabled({
      overrides: { CRM_READ: true, CRM_WRITE: false, CRM_DUAL_WRITE: false },
    })).toBe(false);
    expect(() => getCrmRepositoryFlags({
      overrides: { CRM_READ: true, CRM_DUAL_WRITE: true, CRM_WRITE: false },
    })).toThrow(/CRM_DUAL_WRITE/);
  });

  it('build PROD trava write flags', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getCrmRepositoryFlags({ overrides: WRITE_FLAGS });
      expect(flags.CRM_WRITE).toBe(false);
      expect(flags.CRM_DUAL_WRITE).toBe(false);
      expect(shouldUseCrmRepositoryWrite()).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd === true ? true : false;
    }
  });

  it('host Supabase produção bloqueia write', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getCrmRepositoryFlags({ overrides: WRITE_FLAGS });
    expect(flags.CRM_DUAL_WRITE).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('crmWriteCutover — adapter + wiring', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedCrmWriteContext();
    __clearRepositoryWriteAuditForTest();
    __clearRepositoryWriteIdempotencyForTest();
  });

  afterEach(() => {
    __setCrmServiceBridgeFlagsForTest(null);
    __setCrmRepositoryFactoryForTest(null);
    vi.restoreAllMocks();
  });

  it('flags default — service grava IDB sem chamar remote', () => {
    __setCrmServiceBridgeFlagsForTest(null);
    const lead = createLead(crmUser, { name: 'Lead Local', phone: '11999998888' });
    expect(lead.id).toBeTruthy();
    expect(loadDb().crmLeads.some((item) => item.id === lead.id)).toBe(true);
    expect(shouldUseCrmRepositoryWrite()).toBe(false);
  });

  it('DUAL_WRITE ON — createLead agenda remote shadow', async () => {
    const mocks = createWriteMocks();
    __setCrmRepositoryFactoryForTest(() => new CrmRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    }));
    __setCrmServiceBridgeFlagsForTest({ overrides: WRITE_FLAGS });

    const lead = createLead(crmUser, { name: 'Lead Dual', phone: '11977776666' });
    const result = await __runCrmDualWriteCreateLeadForTest(crmUser, lead);
    expect(result.ok).toBe(true);
    expect(mocks.adminApi.createLead).toHaveBeenCalled();
    expect(getRepositoryWriteAuditLog().some((entry) => entry.syncResult === 'shadow')).toBe(true);
  });

  it('DUAL_WRITE ON — updateLead', async () => {
    const mocks = createWriteMocks();
    __setCrmRepositoryFactoryForTest(() => new CrmRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    }));
    __setCrmServiceBridgeFlagsForTest({ overrides: WRITE_FLAGS });

    const lead = createLead(crmUser, { name: 'Original', phone: '11966665555' });
    const updated = updateLead(crmUser, lead.id, { name: 'Atualizado' });
    const result = await __runCrmDualWriteUpdateLeadForTest(crmUser, updated, { name: 'Atualizado' });
    expect(result.ok).toBe(true);
    expect(mocks.adminApi.updateLead).toHaveBeenCalled();
  });

  it('DUAL_WRITE ON — moveLeadToStage', async () => {
    const mocks = createWriteMocks();
    __setCrmRepositoryFactoryForTest(() => new CrmRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    }));
    __setCrmServiceBridgeFlagsForTest({ overrides: WRITE_FLAGS });

    const lead = createLead(crmUser, { name: 'Mover', phone: '11955554444' });
    const moved = moveLeadToStage(crmUser, lead.id, 'aprovado');
    expect(moved.stageKey).toBe('aprovado');
    const result = await __runCrmDualWriteMoveLeadToStageForTest(crmUser, moved, 'aprovado');
    expect(result.ok).toBe(true);
    expect(mocks.adminApi.moveLeadStage).toHaveBeenCalled();
  });

  it('DUAL_WRITE ON — createPipelineStage e deletePipelineStage', async () => {
    const mocks = createWriteMocks();
    __setCrmRepositoryFactoryForTest(() => new CrmRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    }));
    __setCrmServiceBridgeFlagsForTest({ overrides: WRITE_FLAGS });

    const stage = createPipelineStage(crmUser, { label: 'Fase Extra', color: '#a78bfa' });
    const createResult = await __runCrmDualWriteCreatePipelineStageForTest(crmUser, stage);
    expect(createResult.ok).toBe(true);
    expect(mocks.adminApi.createPipelineStage).toHaveBeenCalled();

    const updated = updatePipelineStage(crmUser, stage.id, { label: 'Fase Renomeada' });
    expect(updated.label).toBe('Fase Renomeada');
  });

  it('idempotência evita duplicate write', () => {
    const key = buildRepositoryIdempotencyKey('lead', TENANT, 'lead-idem', 'create');
    markRepositoryWriteIdempotent(key);
    expect(shouldSkipDuplicateRepositoryWrite(key)).toBe(true);
  });

  it('falha remota não altera IDB', async () => {
    const mocks = createWriteMocks();
    mocks.adminApi.createLead.mockRejectedValue(new Error('remote down'));
    __setCrmRepositoryFactoryForTest(() => new CrmRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    }));
    __setCrmServiceBridgeFlagsForTest({ overrides: WRITE_FLAGS });

    const lead = createLead(crmUser, { name: 'Fallback', phone: '11944443333' });
    const before = loadDb().crmLeads.find((item) => item.id === lead.id);
    const result = await __runCrmDualWriteCreateLeadForTest(crmUser, lead);
    expect(result.ok).toBe(false);
    const after = loadDb().crmLeads.find((item) => item.id === lead.id);
    expect(after?.name).toBe(before?.name);
  });
});

describe('crmWriteCutover — inventário wiring', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  it('crmService importa crmWriteAdapter', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '../services/crmService.js'), 'utf8');
    expect(content).toContain('crmWriteAdapter');
    expect(content).toContain('scheduleCrmDualWriteCreateLead');
    expect(content).toContain('scheduleCrmDualWriteMoveLeadToStage');
  });

  it('crmPipelineStageService importa crmWriteAdapter', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '../services/crmPipelineStageService.js'), 'utf8');
    expect(content).toContain('scheduleCrmDualWriteCreatePipelineStage');
    expect(content).toContain('createPipelineStage');
    expect(content).toContain('updatePipelineStage');
  });

  it('server index registra rotas CRM write', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '../../server/index.js'), 'utf8');
    expect(content).toContain("'/internal/app/crm/leads'");
    expect(content).toContain("'/internal/app/crm/leads/:id/stage'");
    expect(content).toContain('createCrmLeadCreateHandler');
    expect(content).toContain('createCrmPipelineStageDeleteHandler');
  });
});
