/**
 * Phase 6.1 — CRM/Kanban Repository Foundation (structural tests only).
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb } from '../db/index.js';
import { CrmRepository } from '../repositories/crm/crmRepository.ts';
import { createCrmCache, CRM_CACHE_TTL_MS } from '../repositories/crm/crmCache.ts';
import {
  getCrmRepositoryFlags,
  isCrmReadPrimaryEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/crm/crmRepositoryFlags.ts';
import {
  mapLegacyRowToLeadCore,
  mapServerRowToLeadCore,
  mapCoreToLeadLegacyRow,
  mapLegacyRowToPipelineStageCore,
} from '../repositories/crm/crmMapper.ts';
import { crmIndexedDbRepository } from '../repositories/crm/crmIndexedDbRepository.ts';
import {
  __setCrmRepositoryFactoryForTest,
  __setCrmServiceBridgeFlagsForTest,
  shouldUseCrmRepositoryRead,
  getCrmRepositoryForRead,
} from '../services/crmRepositoryBridge.js';
import {
  readListLeads,
  readGetLead,
  readListPipelineStages,
  readListLeadEvents,
} from '../services/crmReadAdapter.js';
import { CRM_TEST_FLAG_CONTRACT } from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const LEAD_ID = 'crmlead-foundation-001';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../repositories/crm');

const EXPECTED_CRM_REPO_FILES = [
  'crmActivityFlags.ts',
  'crmActivityHydrate.ts',
  'crmActivityMapper.ts',
  'crmActivityRepository.ts',
  'crmActivityTypes.ts',
  'crmActivityWritePipeline.ts',
  'crmActivityWriteSoak.ts',
  'crmAdminApiRepository.ts',
  'crmCache.ts',
  'crmIndexedDbRepository.ts',
  'crmMapper.ts',
  'crmRepository.ts',
  'crmRepositoryFlags.ts',
  'crmRepositorySync.ts',
  'crmTypes.ts',
  'crmWriteSoak.ts',
].sort();

function seedCrmContext() {
  withDb((db) => {
    db.clinicProfile = { tenant_id: TENANT };
    db.crmLeads = [{
      id: LEAD_ID,
      tenant_id: TENANT,
      name: 'Lead Foundation',
      phone: '11999998888',
      source: 'manual',
      interest: 'implante',
      stageKey: 'novo_lead',
      tags: ['Quente'],
      createdAt: '2026-07-09T12:00:00.000Z',
      updatedAt: '2026-07-09T12:00:00.000Z',
    }];
    db.crmPipelineStages = [{
      id: 'crm-stage-foundation',
      tenant_id: TENANT,
      key: 'novo_lead',
      label: 'Novo Lead',
      order: 1,
      color: '#94a3b8',
      isActive: true,
      stageType: 'normal',
    }];
    db.crmLeadEvents = [{
      id: 'crm-event-001',
      leadId: LEAD_ID,
      tenant_id: TENANT,
      type: 'status_change',
      data: { toStage: 'novo_lead' },
      createdAt: '2026-07-09T12:00:00.000Z',
    }];
    return db;
  });
}

describe('crmRepositoryFoundation — estrutura', () => {
  it('possui todos os arquivos foundation obrigatórios', () => {
    const files = readdirSync(REPO_ROOT).sort();
    expect(files).toEqual(EXPECTED_CRM_REPO_FILES);
  });

  it('bridge e read adapter existem', () => {
    expect(path.resolve(__dirname, '../services/crmRepositoryBridge.js')).toBeTruthy();
    expect(path.resolve(__dirname, '../services/crmReadAdapter.js')).toBeTruthy();
  });
});

describe('crmRepositoryFoundation — flags', () => {
  it('contrato vitest mantém flags CRM OFF', () => {
    expect(CRM_TEST_FLAG_CONTRACT.VITE_CRM_READ).toBe('false');
    expect(CRM_TEST_FLAG_CONTRACT.VITE_CRM_READ_PRIMARY).toBe('false');
    expect(CRM_TEST_FLAG_CONTRACT.VITE_CRM_SHADOW).toBe('false');
    expect(CRM_TEST_FLAG_CONTRACT.VITE_CRM_COMPARE).toBe('false');
    expect(CRM_TEST_FLAG_CONTRACT.VITE_CRM_WRITE).toBe('false');
    expect(CRM_TEST_FLAG_CONTRACT.VITE_CRM_DUAL_WRITE).toBe('false');
  });

  it('WRITE exige CRM_READ', () => {
    expect(() => getCrmRepositoryFlags({
      overrides: { CRM_WRITE: true, CRM_READ: false },
    })).toThrow(/CRM_WRITE/);
  });

  it('DUAL_WRITE exige CRM_WRITE', () => {
    expect(() => getCrmRepositoryFlags({
      overrides: { CRM_DUAL_WRITE: true, CRM_WRITE: false, CRM_READ: true },
    })).toThrow(/CRM_DUAL_WRITE/);
  });

  it('READ_PRIMARY exige CRM_READ', () => {
    expect(() => getCrmRepositoryFlags({
      overrides: { CRM_READ_PRIMARY: true, CRM_READ: false },
    })).toThrow(/CRM_READ_PRIMARY/);
  });

  it('COMPARE exige path de leitura', () => {
    expect(() => getCrmRepositoryFlags({
      overrides: { CRM_COMPARE: true, CRM_READ: false, CRM_SHADOW: false },
    })).toThrow(/CRM_COMPARE/);
  });

  it('build PROD trava flags perigosas', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getCrmRepositoryFlags({
        overrides: { CRM_READ: true, CRM_READ_PRIMARY: true, CRM_SHADOW: true },
      });
      expect(flags.CRM_READ).toBe(false);
      expect(flags.CRM_READ_PRIMARY).toBe(false);
      expect(flags.CRM_SHADOW).toBe(false);
      expect(isCrmReadPrimaryEnabled()).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd;
    }
  });

  it('host Supabase produção bloqueia READ_PRIMARY', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getCrmRepositoryFlags({
      overrides: { CRM_READ: true, CRM_READ_PRIMARY: true },
    });
    expect(flags.CRM_READ_PRIMARY).toBe(false);
    vi.unstubAllEnvs();
  });

  it('defaults — repository read desligado', () => {
    expect(shouldUseCrmRepositoryRead()).toBe(false);
  });
});

describe('crmRepositoryFoundation — mapper', () => {
  it('mapLegacyRowToLeadCore preserva campos core', () => {
    const core = mapLegacyRowToLeadCore({
      id: LEAD_ID,
      tenant_id: TENANT,
      name: 'Lead Test',
      phone: '11988887777',
      source: 'whatsapp',
      stageKey: 'novo_lead',
    });
    expect(core?.legacyId).toBe(LEAD_ID);
    expect(core?.tenantId).toBe(TENANT);
    expect(core?.phone).toBe('11988887777');
  });

  it('mapServerRowToLeadCore aceita snake_case remoto', () => {
    const core = mapServerRowToLeadCore({
      tenant_id: TENANT,
      legacy_id: LEAD_ID,
      name: 'Remoto',
      phone: '11977776666',
      stage_key: 'contato_realizado',
      source: 'site',
    });
    expect(core?.legacyId).toBe(LEAD_ID);
    expect(core?.stageKey).toBe('contato_realizado');
  });

  it('mapCoreToLeadLegacyRow roundtrip', () => {
    const core = mapLegacyRowToLeadCore({
      id: LEAD_ID,
      tenant_id: TENANT,
      name: 'Roundtrip',
      phone: '11966665555',
      stageKey: 'novo_lead',
    });
    expect(core).toBeTruthy();
    const legacy = mapCoreToLeadLegacyRow(core);
    expect(legacy.id).toBe(LEAD_ID);
    expect(legacy.name).toBe('Roundtrip');
  });

  it('mapLegacyRowToPipelineStageCore', () => {
    const core = mapLegacyRowToPipelineStageCore({
      id: 'stage-1',
      tenant_id: TENANT,
      key: 'novo_lead',
      label: 'Novo Lead',
      order: 1,
      stageType: 'normal',
    });
    expect(core?.key).toBe('novo_lead');
    expect(core?.stageType).toBe('normal');
  });
});

describe('crmRepositoryFoundation — cache', () => {
  it('TTL configurado', () => {
    expect(CRM_CACHE_TTL_MS).toBe(5 * 60 * 1000);
  });

  it('cache set/get/invalidate', () => {
    const cache = createCrmCache();
    const core = mapLegacyRowToLeadCore({
      id: LEAD_ID,
      tenant_id: TENANT,
      name: 'Cache Lead',
      phone: '11955554444',
      stageKey: 'novo_lead',
    });
    expect(core).toBeTruthy();
    cache.setLead(TENANT, core);
    expect(cache.getLead(TENANT, LEAD_ID)?.name).toBe('Cache Lead');
    cache.invalidateTenant(TENANT);
    expect(cache.getLead(TENANT, LEAD_ID)).toBeNull();
  });
});

describe('crmRepositoryFoundation — indexedDb reader', () => {
  beforeEach(async () => {
    await resetDb();
    await initDb();
    seedCrmContext();
  });

  afterEach(async () => {
    await resetDb();
  });

  it('listLeadsLegacySync filtra por tenant', () => {
    const rows = crmIndexedDbRepository.listLeadsLegacySync({ tenantId: TENANT });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(LEAD_ID);
  });

  it('getLeadLegacySync', () => {
    const row = crmIndexedDbRepository.getLeadLegacySync(LEAD_ID);
    expect(row?.name).toBe('Lead Foundation');
  });

  it('listPipelineStagesLegacySync', () => {
    const stages = crmIndexedDbRepository.listPipelineStagesLegacySync(TENANT);
    expect(stages.length).toBeGreaterThan(0);
    expect(stages[0].key).toBe('novo_lead');
  });

  it('listLeadEventsLegacySync', () => {
    const events = crmIndexedDbRepository.listLeadEventsLegacySync(LEAD_ID);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('status_change');
  });
});

describe('crmRepositoryFoundation — repository facade', () => {
  beforeEach(async () => {
    await resetDb();
    await initDb();
    seedCrmContext();
    __setCrmServiceBridgeFlagsForTest(null);
    __setCrmRepositoryFactoryForTest(null);
  });

  afterEach(async () => {
    await resetDb();
    __setCrmServiceBridgeFlagsForTest(null);
    __setCrmRepositoryFactoryForTest(null);
  });

  it('listLeadsCore com flags OFF usa indexeddb', async () => {
    const repo = new CrmRepository();
    const result = await repo.listLeadsCore(TENANT);
    expect(result.source).toBe('indexeddb');
    expect(result.total).toBe(1);
    expect(result.items[0].legacyId).toBe(LEAD_ID);
  });

  it('getLeadCore com flags OFF usa indexeddb', async () => {
    const repo = new CrmRepository();
    const result = await repo.getLeadCore(TENANT, LEAD_ID);
    expect(result.source).toBe('indexeddb');
    expect(result.core?.name).toBe('Lead Foundation');
  });

  it('compareIdbVsRemote retorna null com flags OFF', async () => {
    const repo = new CrmRepository();
    const report = await repo.compareIdbVsRemote(TENANT);
    expect(report).toBeNull();
  });

  it('syncCacheFromRemote retorna 0 com flags OFF', async () => {
    const repo = new CrmRepository();
    const count = await repo.syncCacheFromRemote(TENANT);
    expect(count).toBe(0);
  });
});

describe('crmRepositoryFoundation — read adapter wiring', () => {
  beforeEach(async () => {
    await resetDb();
    await initDb();
    seedCrmContext();
    __setCrmServiceBridgeFlagsForTest(null);
    __setCrmRepositoryFactoryForTest(null);
  });

  afterEach(async () => {
    await resetDb();
    __setCrmServiceBridgeFlagsForTest(null);
    __setCrmRepositoryFactoryForTest(null);
  });

  it('readListLeads retorna null com flags OFF', () => {
    expect(readListLeads({ tenantId: TENANT })).toBeNull();
  });

  it('readGetLead retorna null com flags OFF', () => {
    expect(readGetLead(LEAD_ID, TENANT)).toBeNull();
  });

  it('readListPipelineStages retorna null com flags OFF', () => {
    expect(readListPipelineStages(TENANT)).toBeNull();
  });

  it('readListLeadEvents retorna null com flags OFF', () => {
    expect(readListLeadEvents(LEAD_ID)).toBeNull();
  });

  it('readListLeads via bridge quando READ_PRIMARY ON', () => {
    __setCrmServiceBridgeFlagsForTest({
      overrides: { CRM_READ: true, CRM_READ_PRIMARY: true },
    });
    const rows = readListLeads({ tenantId: TENANT });
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('getCrmRepositoryForRead expõe facade', () => {
    expect(typeof getCrmRepositoryForRead().listLeadsLegacySync).toBe('function');
  });
});

describe('crmRepositoryFoundation — interfaces', () => {
  it('ICrmRepository métodos foundation presentes', () => {
    const repo = getCrmRepositoryForRead();
    expect(typeof repo.listLeadsLegacySync).toBe('function');
    expect(typeof repo.getLeadLegacySync).toBe('function');
    expect(typeof repo.listPipelineStagesLegacySync).toBe('function');
    expect(typeof repo.listLeadEventsLegacySync).toBe('function');
    expect(typeof repo.listLeadsCore).toBe('function');
    expect(typeof repo.getLeadCore).toBe('function');
    expect(typeof repo.syncCacheFromRemote).toBe('function');
    expect(typeof repo.compareIdbVsRemote).toBe('function');
  });
});
