/**
 * Phase 6.6 — CRM Wave B Read Cutover (Activity Stream).
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { listLeadEvents, getLeadEvents, getLeadEvent, listFollowUps, getCrmFollowUp } from '../services/crmService.js';
import { listTasks, getTask } from '../services/crmTaskService.js';
import { listFollowUps as listStrategicFollowUps, getStrategicFollowUp } from '../services/followUpService.js';
import {
  mapLeadEventToActivity,
  mapCrmLegacyFollowUpToActivity,
  mapCrmTaskToActivity,
  mapStrategicFollowUpToActivity,
  mapActivityToLeadEventLegacy,
  compareCrmActivities,
} from '../repositories/crm/crmActivityMapper.ts';
import {
  getCrmActivityFlags,
  isCrmActivityReadPrimaryEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/crm/crmActivityFlags.ts';
import { createCrmActivityRepository } from '../repositories/crm/crmActivityRepository.ts';
import {
  __setCrmActivityFlagsForTest,
  __setCrmActivityRepositoryFactoryForTest,
  shouldUseCrmActivityReadPrimary,
  readListLeadEventsWaveB,
  readListCrmTasksWaveB,
  readListActivitiesWaveB,
  __listActivitiesForTest,
  __shadowCrmActivityForTest,
  __compareCrmActivityForTest,
  CRM_WAVE_B_DOMAIN_INVENTORY,
} from '../services/crmWaveBAdapter.js';
import {
  CRM_ACTIVITY_READ_PRIMARY_FLAGS_RESOLVED,
  CRM_TEST_FLAG_CONTRACT,
} from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const LEAD_ID = 'crmlead-activity-001';
const PRIMARY = CRM_ACTIVITY_READ_PRIMARY_FLAGS_RESOLVED;

function seedActivityContext() {
  withDb((db) => {
    db.clinicProfile = { id: 'clinic-1', tenant_id: TENANT };
    db.crmLeads = [{
      id: LEAD_ID,
      tenant_id: TENANT,
      name: 'Lead Activity',
      phone: '11999990001',
      stageKey: 'novo_lead',
      createdAt: '2026-07-09T12:00:00.000Z',
      updatedAt: '2026-07-09T12:00:00.000Z',
    }];
    db.crmLeadEvents = [{
      id: 'crmev-act-001',
      leadId: LEAD_ID,
      tenant_id: TENANT,
      type: 'status_change',
      userId: 'user-1',
      data: { toStage: 'novo_lead' },
      createdAt: '2026-07-09T12:01:00.000Z',
    }, {
      id: 'crmev-act-002',
      leadId: LEAD_ID,
      tenant_id: TENANT,
      type: 'message_sent',
      userId: 'user-1',
      data: { channel: 'whatsapp' },
      createdAt: '2026-07-09T12:05:00.000Z',
    }];
    db.crmFollowUps = [{
      id: 'crmfu-act-001',
      leadId: LEAD_ID,
      tenant_id: TENANT,
      dueAt: '2026-07-10T15:00:00.000Z',
      type: 'retorno',
      notes: 'Ligar',
      doneAt: null,
      createdAt: '2026-07-09T12:02:00.000Z',
      createdByUserId: 'user-1',
    }];
    db.crmTasks = [{
      id: 'crmtask-act-001',
      clinicId: 'clinic-1',
      tenant_id: TENANT,
      leadId: LEAD_ID,
      title: 'Task Activity',
      description: '',
      type: 'followup_lead',
      channel: 'call',
      dueAt: '2026-07-11T10:00:00.000Z',
      priority: 'high',
      status: 'pending',
      assignedTo: 'user-1',
      createdBy: 'user-1',
      createdAt: '2026-07-09T12:03:00.000Z',
      updatedAt: '2026-07-09T12:03:00.000Z',
      doneAt: null,
    }];
    db.followUps = [{
      id: 'fup-act-001',
      clinicId: 'clinic-1',
      tenant_id: TENANT,
      leadId: LEAD_ID,
      originType: 'crm',
      type: 'comercial',
      description: 'Estratégico',
      dueDate: '2026-07-12',
      priority: 'medium',
      status: 'pending',
      assignedTo: 'user-1',
      createdAt: '2026-07-09T12:04:00.000Z',
      completedAt: null,
    }];
    return db;
  });
}

describe('crmActivityReadCutover — flags', () => {
  it('contrato vitest mantém Activity flags OFF', () => {
    expect(CRM_TEST_FLAG_CONTRACT.VITE_CRM_ACTIVITY_READ).toBe('false');
    expect(CRM_TEST_FLAG_CONTRACT.VITE_CRM_ACTIVITY_READ_PRIMARY).toBe('false');
    expect(CRM_TEST_FLAG_CONTRACT.VITE_CRM_ACTIVITY_SHADOW).toBe('false');
    expect(CRM_TEST_FLAG_CONTRACT.VITE_CRM_ACTIVITY_COMPARE).toBe('false');
  });

  it('READ_PRIMARY exige CRM_ACTIVITY_READ', () => {
    expect(() => getCrmActivityFlags({
      overrides: { CRM_ACTIVITY_READ_PRIMARY: true, CRM_ACTIVITY_READ: false },
    })).toThrow(/CRM_ACTIVITY_READ_PRIMARY/);
  });

  it('flags OFF — primary desabilitado', () => {
    __setCrmActivityFlagsForTest(null);
    expect(shouldUseCrmActivityReadPrimary()).toBe(false);
    expect(isCrmActivityReadPrimaryEnabled()).toBe(false);
  });

  it('build PROD trava Activity flags', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getCrmActivityFlags({ overrides: PRIMARY });
      expect(flags.CRM_ACTIVITY_READ_PRIMARY).toBe(false);
      expect(flags.CRM_ACTIVITY_READ).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd === true ? true : false;
    }
  });

  it('host Supabase produção bloqueia READ_PRIMARY', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getCrmActivityFlags({ overrides: PRIMARY });
    expect(flags.CRM_ACTIVITY_READ_PRIMARY).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('crmActivityReadCutover — Activity DTO + Mapper', () => {
  it('mapeia event types para Activity types', () => {
    const move = mapLeadEventToActivity({
      id: 'e1', leadId: LEAD_ID, tenant_id: TENANT, type: 'status_change',
      createdAt: '2026-07-09T12:00:00.000Z', data: {},
    });
    expect(move?.type).toBe('MOVE_STAGE');
    const wa = mapLeadEventToActivity({
      id: 'e2', leadId: LEAD_ID, tenant_id: TENANT, type: 'message_sent',
      createdAt: '2026-07-09T12:00:00.000Z', data: {},
    });
    expect(wa?.type).toBe('WHATSAPP');
  });

  it('mapeia follow-up / task / strategic', () => {
    expect(mapCrmLegacyFollowUpToActivity({
      id: 'f1', leadId: LEAD_ID, tenant_id: TENANT, dueAt: '2026-07-10T00:00:00.000Z',
      createdAt: '2026-07-09T12:00:00.000Z',
    })?.type).toBe('FOLLOW_UP');
    expect(mapCrmTaskToActivity({
      id: 't1', tenant_id: TENANT, title: 'X', dueAt: '2026-07-11T00:00:00.000Z',
      status: 'pending', createdAt: '2026-07-09T12:00:00.000Z',
    })?.type).toBe('TASK');
    expect(mapStrategicFollowUpToActivity({
      id: 's1', tenant_id: TENANT, dueDate: '2026-07-12', status: 'pending',
      createdAt: '2026-07-09T12:00:00.000Z',
    })?.source).toBe('followUps');
  });

  it('roundtrip Activity → legacy event preserva id/leadId', () => {
    const activity = mapLeadEventToActivity({
      id: 'crmev-rt', leadId: LEAD_ID, tenant_id: TENANT, type: 'contact',
      userId: 'u1', data: { note: 'x' }, createdAt: '2026-07-09T12:00:00.000Z',
    });
    const legacy = mapActivityToLeadEventLegacy(activity);
    expect(legacy.id).toBe('crmev-rt');
    expect(legacy.leadId).toBe(LEAD_ID);
  });

  it('compareCrmActivities detecta mismatch', () => {
    const a = mapCrmTaskToActivity({
      id: 't1', tenant_id: TENANT, title: 'A', dueAt: '2026-07-11T00:00:00.000Z',
      status: 'pending', createdAt: '2026-07-09T12:00:00.000Z',
    });
    const b = mapCrmTaskToActivity({
      id: 't1', tenant_id: TENANT, title: 'B', dueAt: '2026-07-11T00:00:00.000Z',
      status: 'pending', createdAt: '2026-07-09T12:00:00.000Z',
    });
    expect(compareCrmActivities(a, b).match).toBe(false);
    expect(compareCrmActivities(a, a).match).toBe(true);
  });
});

describe('crmActivityReadCutover — repository + adapter', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedActivityContext();
    __setCrmActivityFlagsForTest(null);
    __setCrmActivityRepositoryFactoryForTest(null);
  });

  afterEach(() => {
    __setCrmActivityFlagsForTest(null);
    __setCrmActivityRepositoryFactoryForTest(null);
  });

  it('repository lista Activity Stream unificado', async () => {
    const items = await __listActivitiesForTest(TENANT, { leadId: LEAD_ID });
    const sources = new Set(items.map((i) => i.source));
    expect(sources.has('crmLeadEvents')).toBe(true);
    expect(sources.has('crmFollowUps')).toBe(true);
    expect(sources.has('crmTasks')).toBe(true);
    expect(sources.has('followUps')).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(5);
  });

  it('flags OFF — adapter retorna null (legado)', () => {
    expect(readListLeadEventsWaveB(LEAD_ID, TENANT)).toBeNull();
    expect(readListCrmTasksWaveB({ leadId: LEAD_ID, tenantId: TENANT })).toBeNull();
    expect(readListActivitiesWaveB({ tenantId: TENANT })).toBeNull();
  });

  it('PRIMARY ON — listLeadEvents via Activity Stream', () => {
    __setCrmActivityFlagsForTest({ overrides: PRIMARY });
    const fromAdapter = readListLeadEventsWaveB(LEAD_ID, TENANT);
    expect(fromAdapter).not.toBeNull();
    expect(fromAdapter.some((e) => e.id === 'crmev-act-001')).toBe(true);
    const fromService = listLeadEvents(LEAD_ID);
    expect(fromService.some((e) => e.type === 'status_change')).toBe(true);
    expect(getLeadEvents(LEAD_ID).length).toBe(fromService.length);
  });

  it('PRIMARY ON — listTasks / getTask', () => {
    __setCrmActivityFlagsForTest({ overrides: PRIMARY });
    const tasks = listTasks({ leadId: LEAD_ID });
    expect(tasks.some((t) => t.id === 'crmtask-act-001')).toBe(true);
    expect(getTask('crmtask-act-001')?.title).toBe('Task Activity');
  });

  it('PRIMARY ON — listFollowUps CRM + getCrmFollowUp', () => {
    __setCrmActivityFlagsForTest({ overrides: PRIMARY });
    const fus = listFollowUps({ leadId: LEAD_ID });
    expect(fus.some((f) => f.id === 'crmfu-act-001')).toBe(true);
    expect(getCrmFollowUp('crmfu-act-001')?.notes).toBe('Ligar');
  });

  it('PRIMARY ON — strategic followUps', () => {
    __setCrmActivityFlagsForTest({ overrides: PRIMARY });
    const list = listStrategicFollowUps({ leadId: LEAD_ID });
    expect(list.some((f) => f.id === 'fup-act-001')).toBe(true);
    expect(getStrategicFollowUp('fup-act-001')?.description).toBe('Estratégico');
  });

  it('flags OFF — services 100% legado (legacy preservation)', () => {
    __setCrmActivityFlagsForTest(null);
    expect(listLeadEvents(LEAD_ID).length).toBe(2);
    expect(listTasks({ leadId: LEAD_ID }).length).toBe(1);
    expect(listFollowUps({ leadId: LEAD_ID }).length).toBe(1);
    expect(listStrategicFollowUps({ leadId: LEAD_ID }).length).toBe(1);
    expect(loadDb().crmLeadEvents.length).toBe(2);
  });

  it('shadow discard não altera IDB', async () => {
    __setCrmActivityFlagsForTest({
      overrides: { ...PRIMARY, CRM_ACTIVITY_SHADOW: true },
    });
    const before = loadDb().crmLeadEvents.length;
    await __shadowCrmActivityForTest(TENANT, { leadId: LEAD_ID });
    expect(loadDb().crmLeadEvents.length).toBe(before);
  });

  it('compare mode retorna array (sem alterar resposta)', async () => {
    __setCrmActivityFlagsForTest({
      overrides: {
        CRM_ACTIVITY_READ: true,
        CRM_ACTIVITY_READ_PRIMARY: false,
        CRM_ACTIVITY_SHADOW: false,
        CRM_ACTIVITY_COMPARE: true,
      },
    });
    const result = await __compareCrmActivityForTest(TENANT, { leadId: LEAD_ID });
    expect(Array.isArray(result)).toBe(true);
  });

  it('inventário documenta Activity Stream', () => {
    expect(CRM_WAVE_B_DOMAIN_INVENTORY.activityStream.dto).toBe('CrmActivity');
    expect(CRM_WAVE_B_DOMAIN_INVENTORY.leadEvents.methods).toContain('getLeadEvents');
  });

  it('getLeadEvent primary', () => {
    __setCrmActivityFlagsForTest({ overrides: PRIMARY });
    expect(getLeadEvent('crmev-act-002')?.type).toBe('message_sent');
  });

  it('createCrmActivityRepository isReadPrimaryEnabled', () => {
    const repo = createCrmActivityRepository({ flagsInput: { overrides: PRIMARY } });
    expect(repo.isReadPrimaryEnabled()).toBe(true);
    expect(repo.getFlags().CRM_ACTIVITY_READ).toBe(true);
  });
});
