/**
 * Phase 6.4 — CRM Write Primary + hydrate + soak validation.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
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
  isCrmWritePrimaryEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/crm/crmRepositoryFlags.ts';
import {
  __setCrmRepositoryFactoryForTest,
  __setCrmServiceBridgeFlagsForTest,
  shouldUseCrmRepositoryWrite,
  shouldUseCrmRepositoryWritePrimary,
} from '../services/crmRepositoryBridge.js';
import {
  __runCrmPrimaryWriteCreateLeadForTest,
  __runCrmPrimaryWriteCreatePipelineStageForTest,
  __runCrmPrimaryWriteDeletePipelineStageForTest,
  __runCrmPrimaryWriteMoveLeadToStageForTest,
  __runCrmPrimaryWriteUpdateLeadForTest,
  __runCrmSoakConsistencyReportForTest,
  buildCrmWriteSoakReport,
} from '../services/crmWriteAdapter.js';
import {
  __clearRepositoryWriteAuditForTest,
  getRepositoryWriteAuditLog,
} from '../repositories/shared/repositoryV3WriteAudit.ts';
import {
  __clearRepositoryWriteIdempotencyForTest,
  buildRepositoryIdempotencyKey,
  markRepositoryWriteIdempotent,
  shouldSkipDuplicateRepositoryWrite,
} from '../repositories/shared/repositoryV3Idempotency.ts';
import {
  __clearCrmWriteSoakForTest,
  getCrmWriteSoakMetrics,
} from '../repositories/crm/crmWriteSoak.ts';
import {
  CRM_DUAL_WRITE_FLAGS_RESOLVED,
  CRM_WRITE_PRIMARY_FLAGS_RESOLVED,
} from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const PRIMARY_FLAGS = CRM_WRITE_PRIMARY_FLAGS_RESOLVED;

const crmUser = {
  id: 'user-crm',
  role: 'admin',
  tenantId: TENANT,
};

function seedCrmPrimaryContext() {
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
    name: 'Lead Remoto Primary',
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
      updateLead: vi.fn().mockImplementation(async (_tid, ref) => buildRemoteLead(ref, { name: 'Atualizado Remoto' })),
      moveLeadStage: vi.fn().mockImplementation(async (_tid, ref, dto) => buildRemoteLead(ref, { stageKey: dto.stageKey })),
      createPipelineStage: vi.fn().mockImplementation(async (_tid, dto) => ({
        tenantId: TENANT,
        legacyId: dto.legacyId,
        uuid: 'stage-uuid-primary',
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
        uuid: 'stage-uuid-primary',
        key: dto.key || 'custom_stage',
        label: dto.label || 'Stage Remoto',
        order: dto.order ?? 4,
        color: dto.color || '#a78bfa',
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

describe('crmWritePrimary — flags', () => {
  it('WRITE_PRIMARY exige CRM_WRITE', () => {
    expect(() => getCrmRepositoryFlags({
      overrides: { CRM_WRITE_PRIMARY: true, CRM_WRITE: false, CRM_READ: true },
    })).toThrow(/CRM_WRITE_PRIMARY/);
  });

  it('flags OFF — primary e dual desabilitados', () => {
    __setCrmServiceBridgeFlagsForTest(null);
    expect(shouldUseCrmRepositoryWritePrimary()).toBe(false);
    expect(shouldUseCrmRepositoryWrite()).toBe(false);
    expect(isCrmWritePrimaryEnabled()).toBe(false);
  });

  it('primary ON desabilita dual-write only path', () => {
    __setCrmServiceBridgeFlagsForTest({ overrides: PRIMARY_FLAGS });
    expect(shouldUseCrmRepositoryWritePrimary()).toBe(true);
    expect(shouldUseCrmRepositoryWrite()).toBe(false);
  });

  it('dual e primary não rodam juntos quando ambos true nas flags', () => {
    __setCrmServiceBridgeFlagsForTest({
      overrides: {
        ...CRM_DUAL_WRITE_FLAGS_RESOLVED,
        CRM_WRITE_PRIMARY: true,
      },
    });
    expect(shouldUseCrmRepositoryWritePrimary()).toBe(true);
    expect(shouldUseCrmRepositoryWrite()).toBe(false);
  });

  it('build PROD trava WRITE_PRIMARY', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getCrmRepositoryFlags({ overrides: PRIMARY_FLAGS });
      expect(flags.CRM_WRITE_PRIMARY).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd === true ? true : false;
    }
  });

  it('host Supabase produção bloqueia WRITE_PRIMARY', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getCrmRepositoryFlags({ overrides: PRIMARY_FLAGS });
    expect(flags.CRM_WRITE_PRIMARY).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('crmWritePrimary — hydrate, fallback e rollback', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedCrmPrimaryContext();
    __clearRepositoryWriteAuditForTest();
    __clearRepositoryWriteIdempotencyForTest();
    __clearCrmWriteSoakForTest();
    __setCrmServiceBridgeFlagsForTest({ overrides: PRIMARY_FLAGS });
    const mocks = createWriteMocks();
    __setCrmRepositoryFactoryForTest(() => new CrmRepository({
      ...mocks,
      flagsInput: { overrides: PRIMARY_FLAGS },
    }));
  });

  afterEach(() => {
    __setCrmServiceBridgeFlagsForTest(null);
    __setCrmRepositoryFactoryForTest(null);
    __clearRepositoryWriteAuditForTest();
    __clearRepositoryWriteIdempotencyForTest();
    __clearCrmWriteSoakForTest();
    vi.restoreAllMocks();
  });

  it('primary createLead hidrata IndexedDB após sucesso remoto', async () => {
    const lead = createLead(crmUser, { name: 'Primary Lead', phone: '11966665555' });
    const result = await __runCrmPrimaryWriteCreateLeadForTest(crmUser, lead);
    expect(result.ok).toBe(true);
    const audit = getRepositoryWriteAuditLog().find((e) => e.legacyId === lead.id);
    expect(audit?.syncResult).toBe('ok');
    expect(getCrmWriteSoakMetrics().primaryOk).toBeGreaterThan(0);
    expect(getCrmWriteSoakMetrics().hydrateOk).toBeGreaterThan(0);
    const idbLead = loadDb().crmLeads.find((item) => item.id === lead.id);
    expect(idbLead?.name).toBe('Lead Remoto Primary');
  });

  it('primary moveLeadToStage hidrata stageKey (projeção kanban)', async () => {
    const lead = createLead(crmUser, { name: 'Mover Primary', phone: '11955554444' });
    const moved = moveLeadToStage(crmUser, lead.id, 'aprovado');
    expect(moved.stageKey).toBe('aprovado');
    __clearRepositoryWriteIdempotencyForTest();
    const result = await __runCrmPrimaryWriteMoveLeadToStageForTest(crmUser, moved, 'aprovado');
    expect(result.ok).toBe(true);
    const idbLead = loadDb().crmLeads.find((item) => item.id === lead.id);
    expect(idbLead?.stageKey).toBe('aprovado');
  });

  it('primary createPipelineStage hidrata crmPipelineStages', async () => {
    const stage = createPipelineStage(crmUser, { label: 'Fase Primary', color: '#a78bfa' });
    const result = await __runCrmPrimaryWriteCreatePipelineStageForTest(crmUser, stage);
    expect(result.ok).toBe(true);
    const idbStage = loadDb().crmPipelineStages.find((item) => item.id === stage.id);
    expect(idbStage?.label).toBe('Fase Primary');
    expect(getCrmWriteSoakMetrics().hydrateOk).toBeGreaterThan(0);
  });

  it('primary deletePipelineStage remove do IndexedDB', async () => {
    const stageId = 'crmstage-delete-primary-test';
    withDb((db) => {
      db.crmPipelineStages.push({
        id: stageId,
        tenant_id: TENANT,
        key: 'delete_primary_test',
        label: 'Deletar Primary',
        order: 99,
        color: '#f472b6',
        isActive: true,
        stageType: 'normal',
      });
      return db;
    });
    expect(loadDb().crmPipelineStages.some((item) => item.id === stageId)).toBe(true);
    const result = await __runCrmPrimaryWriteDeletePipelineStageForTest(crmUser, stageId, TENANT);
    expect(result.ok).toBe(true);
    expect(loadDb().crmPipelineStages.some((item) => item.id === stageId)).toBe(false);
    expect(getCrmWriteSoakMetrics().hydrateOk).toBeGreaterThan(0);
  });

  it('fallback preserva legado quando remoto falha', async () => {
    const mocks = createWriteMocks();
    mocks.adminApi.createLead.mockRejectedValue(new Error('remote unavailable'));
    __setCrmRepositoryFactoryForTest(() => new CrmRepository({
      ...mocks,
      flagsInput: { overrides: PRIMARY_FLAGS },
    }));
    const lead = createLead(crmUser, { name: 'Fallback Lead', phone: '11944443333' });
    const result = await __runCrmPrimaryWriteCreateLeadForTest(crmUser, lead);
    expect(result.ok).toBe(false);
    expect(loadDb().crmLeads.some((item) => item.id === lead.id)).toBe(true);
    expect(getCrmWriteSoakMetrics().fallbackLegacy).toBeGreaterThan(0);
  });

  it('rollback por flag — primary OFF não chama remote', async () => {
    __setCrmServiceBridgeFlagsForTest(null);
    const mocks = createWriteMocks();
    __setCrmRepositoryFactoryForTest(() => new CrmRepository({ ...mocks }));
    const lead = createLead(crmUser, { name: 'Rollback Flag', phone: '11933332222' });
    const result = await __runCrmPrimaryWriteCreateLeadForTest(crmUser, lead);
    expect(result.skipped).toBe(true);
    expect(mocks.adminApi.createLead).not.toHaveBeenCalled();
  });

  it('flags OFF — createLead 100% legado', () => {
    __setCrmServiceBridgeFlagsForTest(null);
    const lead = createLead(crmUser, { name: 'Legado Puro', phone: '11922221111' });
    expect(lead.id).toBeTruthy();
    expect(loadDb().crmLeads.some((item) => item.id === lead.id)).toBe(true);
  });

  it('update com primary registra audit ok', async () => {
    __setCrmServiceBridgeFlagsForTest(null);
    const lead = createLead(crmUser, { name: 'Before Update', phone: '11911110000' });
    const updated = updateLead(crmUser, lead.id, { name: 'After Update' });
    __setCrmServiceBridgeFlagsForTest({ overrides: PRIMARY_FLAGS });
    const mocks = createWriteMocks();
    __setCrmRepositoryFactoryForTest(() => new CrmRepository({
      ...mocks,
      flagsInput: { overrides: PRIMARY_FLAGS },
    }));
    __clearRepositoryWriteIdempotencyForTest();
    __clearRepositoryWriteAuditForTest();
    const result = await __runCrmPrimaryWriteUpdateLeadForTest(crmUser, updated, { name: 'After Update' });
    expect(result.ok).toBe(true);
    const audit = getRepositoryWriteAuditLog().find((e) => e.legacyId === lead.id && e.syncResult === 'ok');
    expect(audit).toBeTruthy();
  });

  it('idempotência evita duplicate write', () => {
    const key = buildRepositoryIdempotencyKey('lead', TENANT, 'lead-primary-idem', 'create');
    markRepositoryWriteIdempotent(key);
    expect(shouldSkipDuplicateRepositoryWrite(key)).toBe(true);
  });

  it('audit in-memory registra correlation_id e tenant_id', async () => {
    const lead = createLead(crmUser, { name: 'Audit Lead', phone: '11900009999' });
    await __runCrmPrimaryWriteCreateLeadForTest(crmUser, lead);
    const audit = getRepositoryWriteAuditLog().find((e) => e.legacyId === lead.id);
    expect(audit?.tenantId).toBe(TENANT);
    expect(audit?.correlationId).toBeTruthy();
    expect(audit?.writeSource).toBe('primary-write-hydrate');
  });
});

describe('crmWritePrimary — soak validation', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedCrmPrimaryContext();
    __clearCrmWriteSoakForTest();
    __clearRepositoryWriteAuditForTest();
    __clearRepositoryWriteIdempotencyForTest();
    __setCrmServiceBridgeFlagsForTest({ overrides: PRIMARY_FLAGS });
    const mocks = createWriteMocks();
    __setCrmRepositoryFactoryForTest(() => new CrmRepository({
      ...mocks,
      flagsInput: { overrides: PRIMARY_FLAGS },
    }));
  });

  afterEach(() => {
    __setCrmServiceBridgeFlagsForTest(null);
    __setCrmRepositoryFactoryForTest(null);
    __clearCrmWriteSoakForTest();
    vi.restoreAllMocks();
  });

  it('buildCrmWriteSoakReport expõe métricas exigidas', async () => {
    const lead = createLead(crmUser, { name: 'Soak Lead', phone: '11899998888' });
    await __runCrmPrimaryWriteCreateLeadForTest(crmUser, lead);
    const report = buildCrmWriteSoakReport(TENANT);
    expect(report.tenantId).toBe(TENANT);
    expect(report.metrics).toMatchObject({
      totalWrites: expect.any(Number),
      primaryOk: expect.any(Number),
      primaryFailed: expect.any(Number),
      fallbackLegacy: expect.any(Number),
      hydrateOk: expect.any(Number),
      hydrateFailed: expect.any(Number),
      compareDiffs: expect.any(Number),
    });
    expect(report.rollback).toContain('CRM_WRITE_PRIMARY');
  });

  it('__runCrmSoakConsistencyReportForTest inclui compare opcional', async () => {
    const report = await __runCrmSoakConsistencyReportForTest(TENANT);
    expect(report?.tenantId).toBe(TENANT);
    expect(report?.metrics).toBeTruthy();
  });
});
