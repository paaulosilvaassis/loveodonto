/**
 * Phase 6.5 — CRM Wave B Foundation (structural tests only).
 * Sem Read/Write Cutover. Adapters sempre null. Services legados intactos.
 */
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { CrmRepository } from '../repositories/crm/crmRepository.ts';
import { createCrmCache } from '../repositories/crm/crmCache.ts';
import { crmIndexedDbRepository } from '../repositories/crm/crmIndexedDbRepository.ts';
import {
  mapLegacyRowToLeadEventCore,
  mapCoreToLeadEventLegacyRow,
  mapServerRowToLeadEventCore,
  mapLegacyRowToCrmLegacyFollowUpCore,
  mapCoreToCrmLegacyFollowUpLegacyRow,
  mapLegacyRowToCrmTaskCore,
  mapCoreToCrmTaskLegacyRow,
  mapLegacyRowToStrategicFollowUpCore,
  mapCoreToStrategicFollowUpLegacyRow,
  mapServerRowToCrmTaskCore,
  mapServerRowToStrategicFollowUpCore,
  mapServerRowToCrmLegacyFollowUpCore,
} from '../repositories/crm/crmMapper.ts';
import {
  __setCrmRepositoryFactoryForTest,
  __setCrmServiceBridgeFlagsForTest,
} from '../services/crmRepositoryBridge.js';
import {
  readListCrmLegacyFollowUps,
  readListCrmTasks,
  readListStrategicFollowUps,
  readListLeadEvents,
} from '../services/crmReadAdapter.js';
import {
  CRM_WAVE_B_DOMAIN_INVENTORY,
  readListLeadEventsWaveB,
  readListCrmLegacyFollowUpsWaveB,
  readListCrmTasksWaveB,
  readListStrategicFollowUpsWaveB,
  __listLeadEventsCoreForTest,
  __listCrmLegacyFollowUpsCoreForTest,
  __listCrmTasksCoreForTest,
  __listStrategicFollowUpsCoreForTest,
} from '../services/crmWaveBAdapter.js';
import { listLeadEvents, createFollowUp as createCrmFollowUp, listFollowUps as listCrmFollowUps } from '../services/crmService.js';
import { createTask, listTasks } from '../services/crmTaskService.js';
import { createFollowUp as createStrategicFollowUp, listFollowUps as listStrategicFollowUps } from '../services/followUpService.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const LEAD_ID = 'crmlead-waveb-001';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../repositories/crm');

const crmUser = {
  id: 'user-crm-waveb',
  role: 'admin',
  tenantId: TENANT,
};

function seedWaveBContext() {
  withDb((db) => {
    db.clinicProfile = { id: 'clinic-1', tenant_id: TENANT };
    db.crmLeads = [{
      id: LEAD_ID,
      tenant_id: TENANT,
      name: 'Lead Wave B',
      phone: '11999990000',
      source: 'manual',
      stageKey: 'novo_lead',
      createdAt: '2026-07-09T12:00:00.000Z',
      updatedAt: '2026-07-09T12:00:00.000Z',
    }];
    db.crmLeadEvents = [{
      id: 'crmev-waveb-001',
      leadId: LEAD_ID,
      tenant_id: TENANT,
      type: 'status_change',
      userId: crmUser.id,
      data: { toStage: 'novo_lead' },
      createdAt: '2026-07-09T12:01:00.000Z',
    }];
    db.crmFollowUps = [{
      id: 'crmfu-waveb-001',
      leadId: LEAD_ID,
      tenant_id: TENANT,
      dueAt: '2026-07-10T15:00:00.000Z',
      type: 'retorno',
      notes: 'Ligar',
      doneAt: null,
      createdAt: '2026-07-09T12:02:00.000Z',
      createdByUserId: crmUser.id,
    }];
    db.crmTasks = [{
      id: 'crmtask-waveb-001',
      clinicId: 'clinic-1',
      tenant_id: TENANT,
      leadId: LEAD_ID,
      patientId: null,
      title: 'Follow-up orçamento',
      description: '',
      type: 'followup_budget',
      channel: 'whatsapp',
      dueAt: '2026-07-11T10:00:00.000Z',
      priority: 'high',
      status: 'pending',
      assignedTo: crmUser.id,
      createdBy: crmUser.id,
      createdAt: '2026-07-09T12:03:00.000Z',
      updatedAt: '2026-07-09T12:03:00.000Z',
      doneAt: null,
    }];
    db.followUps = [{
      id: 'fup-waveb-001',
      clinicId: 'clinic-1',
      tenant_id: TENANT,
      leadId: LEAD_ID,
      patientId: null,
      originType: 'crm',
      type: 'comercial',
      description: 'Retorno estratégico',
      dueDate: '2026-07-12',
      priority: 'medium',
      status: 'pending',
      assignedTo: crmUser.id,
      createdAt: '2026-07-09T12:04:00.000Z',
      completedAt: null,
    }];
    return db;
  });
}

describe('crmWaveBFoundation — estrutura', () => {
  it('crmWaveBAdapter existe', () => {
    expect(path.resolve(__dirname, '../services/crmWaveBAdapter.js')).toBeTruthy();
  });

  it('inventário Wave B documenta as 4 stores', () => {
    expect(CRM_WAVE_B_DOMAIN_INVENTORY.leadEvents.store).toBe('crmLeadEvents');
    expect(CRM_WAVE_B_DOMAIN_INVENTORY.crmLegacyFollowUps.store).toBe('crmFollowUps');
    expect(CRM_WAVE_B_DOMAIN_INVENTORY.crmTasks.store).toBe('crmTasks');
    expect(CRM_WAVE_B_DOMAIN_INVENTORY.strategicFollowUps.store).toBe('followUps');
    expect(CRM_WAVE_B_DOMAIN_INVENTORY.duplicationNote).toMatch(/Activity Stream/i);
  });

  it('repository files incluem foundation Wave A + soak', () => {
    const files = readdirSync(REPO_ROOT);
    expect(files).toContain('crmTypes.ts');
    expect(files).toContain('crmMapper.ts');
    expect(files).toContain('crmIndexedDbRepository.ts');
    expect(files).toContain('crmCache.ts');
    expect(files).toContain('crmAdminApiRepository.ts');
  });
});

describe('crmWaveBFoundation — mappers', () => {
  it('lead event legacy ↔ core ↔ legacy roundtrip', () => {
    const row = {
      id: 'crmev-1',
      leadId: LEAD_ID,
      tenant_id: TENANT,
      type: 'contact',
      userId: 'u1',
      data: { note: 'ok' },
      createdAt: '2026-07-09T12:00:00.000Z',
    };
    const core = mapLegacyRowToLeadEventCore(row);
    expect(core?.legacyId).toBe('crmev-1');
    expect(mapCoreToLeadEventLegacyRow(core).leadId).toBe(LEAD_ID);
    const fromServer = mapServerRowToLeadEventCore({
      tenant_id: TENANT,
      id: 'crmev-1',
      lead_id: LEAD_ID,
      type: 'contact',
      created_at: '2026-07-09T12:00:00.000Z',
    });
    expect(fromServer?.leadId).toBe(LEAD_ID);
  });

  it('crmFollowUp / crmTask / strategicFollowUp mappers', () => {
    const fu = mapLegacyRowToCrmLegacyFollowUpCore({
      id: 'crmfu-1',
      leadId: LEAD_ID,
      tenant_id: TENANT,
      dueAt: '2026-07-10T10:00:00.000Z',
      type: 'retorno',
      notes: 'x',
      doneAt: null,
      createdAt: '2026-07-09T12:00:00.000Z',
    });
    expect(fu?.status).toBe('pending');
    expect(mapCoreToCrmLegacyFollowUpLegacyRow(fu).id).toBe('crmfu-1');

    const task = mapLegacyRowToCrmTaskCore({
      id: 'crmtask-1',
      clinicId: 'clinic-1',
      tenant_id: TENANT,
      leadId: LEAD_ID,
      title: 'T',
      dueAt: '2026-07-11T10:00:00.000Z',
      status: 'pending',
      priority: 'high',
      createdAt: '2026-07-09T12:00:00.000Z',
    });
    expect(task?.title).toBe('T');
    expect(mapCoreToCrmTaskLegacyRow(task).id).toBe('crmtask-1');

    const strat = mapLegacyRowToStrategicFollowUpCore({
      id: 'fup-1',
      clinicId: 'clinic-1',
      tenant_id: TENANT,
      dueDate: '2026-07-12',
      status: 'pending',
      type: 'retorno',
      createdAt: '2026-07-09T12:00:00.000Z',
    });
    expect(strat?.dueDate).toBe('2026-07-12');
    expect(mapCoreToStrategicFollowUpLegacyRow(strat).id).toBe('fup-1');

    expect(mapServerRowToCrmTaskCore({
      tenant_id: TENANT, id: 't1', title: 'Remote', status: 'pending',
    })?.title).toBe('Remote');
    expect(mapServerRowToStrategicFollowUpCore({
      tenant_id: TENANT, id: 's1', due_date: '2026-07-13', status: 'pending',
    })?.dueDate).toBe('2026-07-13');
    expect(mapServerRowToCrmLegacyFollowUpCore({
      tenant_id: TENANT, id: 'f1', lead_id: LEAD_ID, due_at: '2026-07-14T00:00:00.000Z',
    })?.leadId).toBe(LEAD_ID);
  });
});

describe('crmWaveBFoundation — indexedDb + repository', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedWaveBContext();
    __setCrmServiceBridgeFlagsForTest(null);
    __setCrmRepositoryFactoryForTest(null);
  });

  afterEach(() => {
    __setCrmServiceBridgeFlagsForTest(null);
    __setCrmRepositoryFactoryForTest(null);
  });

  it('IDB reader lista as 4 stores Wave B', () => {
    expect(crmIndexedDbRepository.listLeadEventsLegacySync(LEAD_ID)).toHaveLength(1);
    expect(crmIndexedDbRepository.listCrmLegacyFollowUpsLegacySync({ leadId: LEAD_ID })).toHaveLength(1);
    expect(crmIndexedDbRepository.listCrmTasksLegacySync({ leadId: LEAD_ID })).toHaveLength(1);
    expect(crmIndexedDbRepository.listStrategicFollowUpsLegacySync({ leadId: LEAD_ID })).toHaveLength(1);
  });

  it('repository Core Wave B lê apenas IndexedDB', async () => {
    const repo = new CrmRepository({
      indexedDb: crmIndexedDbRepository,
      cache: createCrmCache(),
      flagsInput: {},
    });
    const events = await repo.listLeadEventsCore(TENANT, { leadId: LEAD_ID });
    const fus = await repo.listCrmLegacyFollowUpsCore(TENANT, { leadId: LEAD_ID });
    const tasks = await repo.listCrmTasksCore(TENANT, { leadId: LEAD_ID });
    const strat = await repo.listStrategicFollowUpsCore(TENANT, { leadId: LEAD_ID });
    expect(events).toHaveLength(1);
    expect(fus[0].status).toBe('pending');
    expect(tasks[0].title).toBe('Follow-up orçamento');
    expect(strat[0].type).toBe('comercial');
  });

  it('cache Wave B set/get sem afetar leads', () => {
    const cache = createCrmCache();
    cache.setCrmTask(TENANT, {
      tenantId: TENANT,
      legacyId: 'crmtask-cache',
      uuid: null,
      clinicId: 'clinic-1',
      leadId: LEAD_ID,
      patientId: null,
      budgetId: null,
      appointmentId: null,
      title: 'Cached',
      description: '',
      type: 'custom',
      channel: '',
      dueAt: '2026-07-15T00:00:00.000Z',
      priority: 'low',
      status: 'pending',
      assignedTo: null,
      createdBy: null,
      createdAt: '2026-07-09T12:00:00.000Z',
      updatedAt: '2026-07-09T12:00:00.000Z',
      doneAt: null,
    });
    expect(cache.getCrmTask(TENANT, 'crmtask-cache')?.title).toBe('Cached');
    expect(cache.getLead(TENANT, LEAD_ID)).toBeNull();
  });
});

describe('crmWaveBFoundation — adapters flags OFF', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedWaveBContext();
  });

  it('Wave B adapters retornam null com flags OFF', () => {
    expect(readListLeadEventsWaveB(LEAD_ID, TENANT)).toBeNull();
    expect(readListCrmLegacyFollowUpsWaveB({ leadId: LEAD_ID })).toBeNull();
    expect(readListCrmTasksWaveB({ leadId: LEAD_ID })).toBeNull();
    expect(readListStrategicFollowUpsWaveB({ leadId: LEAD_ID })).toBeNull();
    expect(readListCrmLegacyFollowUps()).toBeNull();
    expect(readListCrmTasks()).toBeNull();
    expect(readListStrategicFollowUps()).toBeNull();
    expect(readListLeadEvents(LEAD_ID)).toBeNull();
  });

  it('helpers de teste Core funcionam sem alterar services', async () => {
    const events = await __listLeadEventsCoreForTest(TENANT, { leadId: LEAD_ID });
    expect(events).toHaveLength(1);
    const tasks = await __listCrmTasksCoreForTest(TENANT, { leadId: LEAD_ID });
    expect(tasks).toHaveLength(1);
    const fus = await __listCrmLegacyFollowUpsCoreForTest(TENANT, { pending: true });
    expect(fus.length).toBeGreaterThan(0);
    const strat = await __listStrategicFollowUpsCoreForTest(TENANT, { pending: true });
    expect(strat.length).toBeGreaterThan(0);
  });

  it('services legados permanecem authority (flags OFF)', () => {
    const events = listLeadEvents(LEAD_ID);
    expect(events.length).toBeGreaterThan(0);

    createCrmFollowUp(crmUser, LEAD_ID, { dueAt: '2026-07-20T10:00:00.000Z', notes: 'novo' });
    expect(listCrmFollowUps({ leadId: LEAD_ID }).length).toBeGreaterThan(1);

    createTask(crmUser, {
      leadId: LEAD_ID,
      title: 'Task legado',
      dueAt: '2026-07-21T10:00:00.000Z',
    });
    expect(listTasks({ leadId: LEAD_ID }).some((t) => t.title === 'Task legado')).toBe(true);

    createStrategicFollowUp(crmUser, {
      leadId: LEAD_ID,
      description: 'Estratégico legado',
      dueDate: '2026-07-22',
    });
    expect(listStrategicFollowUps({ leadId: LEAD_ID }).some((f) => f.description === 'Estratégico legado')).toBe(true);

    expect(loadDb().crmLeadEvents.length).toBeGreaterThan(0);
    expect(loadDb().crmFollowUps.length).toBeGreaterThan(0);
    expect(loadDb().crmTasks.length).toBeGreaterThan(0);
    expect(loadDb().followUps.length).toBeGreaterThan(0);
  });

  it('crmService / crmTaskService / followUpService importam crmWaveBAdapter apenas para READ', () => {
    const crmServiceSrc = readFileSync(path.resolve(__dirname, '../services/crmService.js'), 'utf8');
    const taskSrc = readFileSync(path.resolve(__dirname, '../services/crmTaskService.js'), 'utf8');
    const fupSrc = readFileSync(path.resolve(__dirname, '../services/followUpService.js'), 'utf8');
    expect(crmServiceSrc).toContain('crmWaveBAdapter');
    expect(taskSrc).toContain('crmWaveBAdapter');
    expect(fupSrc).toContain('crmWaveBAdapter');
    expect(crmServiceSrc).not.toContain('scheduleCrmActivity');
  });
});

describe('crmWaveBFoundation — duplicidade documentada', () => {
  it('três stores de follow-up/task são distintas', () => {
    const stores = [
      CRM_WAVE_B_DOMAIN_INVENTORY.crmLegacyFollowUps.store,
      CRM_WAVE_B_DOMAIN_INVENTORY.crmTasks.store,
      CRM_WAVE_B_DOMAIN_INVENTORY.strategicFollowUps.store,
    ];
    expect(new Set(stores).size).toBe(3);
    expect(CRM_WAVE_B_DOMAIN_INVENTORY.crmLegacyFollowUps.service).toBe('crmService');
    expect(CRM_WAVE_B_DOMAIN_INVENTORY.crmTasks.service).toBe('crmTaskService');
    expect(CRM_WAVE_B_DOMAIN_INVENTORY.strategicFollowUps.service).toBe('followUpService');
  });
});
