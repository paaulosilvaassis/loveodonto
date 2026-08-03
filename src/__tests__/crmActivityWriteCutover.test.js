/**
 * Phase 6.7 — CRM Wave B Write Cutover (Activity Stream dual-write).
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import {
  createLeadEvent,
  updateLeadEvent,
  createCrmFollowUp,
  updateCrmFollowUp,
  createLead,
} from '../services/crmService.js';
import {
  createTask,
  updateTask,
  completeTask,
  deleteTask,
} from '../services/crmTaskService.js';
import {
  createStrategicFollowUp,
  updateStrategicFollowUp,
} from '../services/followUpService.js';
import {
  getCrmActivityFlags,
  isCrmActivityDualWriteOnlyEnabled,
  isCrmActivityWritePrimaryEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/crm/crmActivityFlags.ts';
import {
  resolveActivitySourceStore,
  runCrmActivityWritePipeline,
} from '../repositories/crm/crmActivityWritePipeline.ts';
import {
  __setCrmActivityWriteFlagsForTest,
  __setCrmActivityWriteRemoteForTest,
  shouldUseCrmActivityDualWrite,
  shouldUseCrmActivityWritePrimary,
  __runActivityDualWriteCreateLeadEventForTest,
  __runActivityDualWriteCreateTaskForTest,
  __runActivityDualWriteCompleteTaskForTest,
  __runActivityDualWriteDeleteTaskForTest,
  __runActivityDualWriteCreateCrmFollowUpForTest,
  __runActivityDualWriteCreateStrategicFollowUpForTest,
} from '../services/crmActivityWriteAdapter.js';
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
  CRM_ACTIVITY_DUAL_WRITE_FLAGS_RESOLVED,
  CRM_TEST_FLAG_CONTRACT,
} from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const DUAL = CRM_ACTIVITY_DUAL_WRITE_FLAGS_RESOLVED;

const crmUser = {
  id: 'user-activity-write',
  role: 'admin',
  tenantId: TENANT,
};

function seedWriteContext() {
  withDb((db) => {
    db.clinicProfile = { id: 'clinic-1', tenant_id: TENANT };
    db.crmLeads = [];
    db.crmLeadEvents = [];
    db.crmFollowUps = [];
    db.crmTasks = [];
    db.followUps = [];
    db.crmPipelineStages = [{
      id: 'crm-stage-1',
      tenant_id: TENANT,
      key: 'novo_lead',
      label: 'Novo Lead',
      order: 1,
      color: '#60a5fa',
      isActive: true,
      stageType: 'normal',
    }];
    return db;
  });
}

describe('crmActivityWriteCutover — flags', () => {
  it('contrato vitest mantém write flags OFF', () => {
    expect(CRM_TEST_FLAG_CONTRACT.VITE_CRM_ACTIVITY_WRITE).toBe('false');
    expect(CRM_TEST_FLAG_CONTRACT.VITE_CRM_ACTIVITY_DUAL_WRITE).toBe('false');
    expect(CRM_TEST_FLAG_CONTRACT.VITE_CRM_ACTIVITY_WRITE_PRIMARY).toBe('false');
  });

  it('DUAL_WRITE exige WRITE e READ', () => {
    expect(isCrmActivityDualWriteOnlyEnabled({ overrides: DUAL })).toBe(true);
    expect(() => getCrmActivityFlags({
      overrides: { CRM_ACTIVITY_READ: true, CRM_ACTIVITY_DUAL_WRITE: true, CRM_ACTIVITY_WRITE: false },
    })).toThrow(/CRM_ACTIVITY_DUAL_WRITE/);
  });

  it('WRITE_PRIMARY exige WRITE', () => {
    expect(() => getCrmActivityFlags({
      overrides: {
        CRM_ACTIVITY_READ: true,
        CRM_ACTIVITY_WRITE: false,
        CRM_ACTIVITY_WRITE_PRIMARY: true,
      },
    })).toThrow(/CRM_ACTIVITY_WRITE_PRIMARY/);
  });

  it('flags OFF — dual e primary desabilitados', () => {
    __setCrmActivityWriteFlagsForTest(null);
    expect(shouldUseCrmActivityDualWrite()).toBe(false);
    expect(shouldUseCrmActivityWritePrimary()).toBe(false);
    expect(isCrmActivityWritePrimaryEnabled()).toBe(false);
  });

  it('primary ON desabilita dual-only path', () => {
    __setCrmActivityWriteFlagsForTest({
      overrides: { ...DUAL, CRM_ACTIVITY_WRITE_PRIMARY: true, CRM_ACTIVITY_DUAL_WRITE: true },
    });
    expect(shouldUseCrmActivityWritePrimary()).toBe(true);
    expect(shouldUseCrmActivityDualWrite()).toBe(false);
  });

  it('build PROD trava write flags', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getCrmActivityFlags({ overrides: DUAL });
      expect(flags.CRM_ACTIVITY_WRITE).toBe(false);
      expect(flags.CRM_ACTIVITY_DUAL_WRITE).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd === true ? true : false;
    }
  });

  it('host Supabase produção bloqueia write', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getCrmActivityFlags({ overrides: DUAL });
    expect(flags.CRM_ACTIVITY_DUAL_WRITE).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('crmActivityWriteCutover — pipeline routing', () => {
  it('resolveActivitySourceStore roteia por type/source', () => {
    expect(resolveActivitySourceStore({
      id: '1', type: 'TASK', source: 'crmTasks', leadId: null, patientId: null,
      ownerId: null, timestamp: '', status: 'pending', payload: {}, tenantId: TENANT,
    })).toBe('crmTasks');
    expect(resolveActivitySourceStore({
      id: '2', type: 'MOVE_STAGE', source: 'crmLeadEvents', leadId: 'l', patientId: null,
      ownerId: null, timestamp: '', status: 'recorded', payload: {}, tenantId: TENANT,
    })).toBe('crmLeadEvents');
    expect(resolveActivitySourceStore({
      id: '3', type: 'FOLLOW_UP', source: 'followUps', leadId: 'l', patientId: null,
      ownerId: null, timestamp: '', status: 'pending', payload: { dueDate: '2026-07-12' }, tenantId: TENANT,
    })).toBe('followUps');
  });

  it('pipeline dual-write registra audit shadow', async () => {
    __clearRepositoryWriteAuditForTest();
    __clearRepositoryWriteIdempotencyForTest();
    const activity = {
      id: 'crmev-pipe-001',
      type: 'NOTE',
      leadId: 'lead-1',
      patientId: null,
      ownerId: 'u1',
      timestamp: '2026-07-09T12:00:00.000Z',
      status: 'recorded',
      payload: { eventType: 'contact' },
      source: 'crmLeadEvents',
      tenantId: TENANT,
    };
    const result = await runCrmActivityWritePipeline(
      { activity, operation: 'create' },
      { overrides: DUAL },
    );
    expect(result.syncResult).toBe('shadow');
    expect(result.sourceStore).toBe('crmLeadEvents');
    expect(getRepositoryWriteAuditLog().some((e) => e.syncResult === 'shadow')).toBe(true);
  });
});

describe('crmActivityWriteCutover — dual write + legacy', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedWriteContext();
    __clearRepositoryWriteAuditForTest();
    __clearRepositoryWriteIdempotencyForTest();
    __setCrmActivityWriteRemoteForTest(null);
  });

  afterEach(() => {
    __setCrmActivityWriteFlagsForTest(null);
    __setCrmActivityWriteRemoteForTest(null);
    vi.restoreAllMocks();
  });

  it('flags OFF — createLeadEvent 100% legado sem remote', async () => {
    __setCrmActivityWriteFlagsForTest(null);
    const lead = createLead(crmUser, { name: 'Lead W', phone: '11911112222' });
    const event = createLeadEvent(crmUser, lead.id, 'contact', { note: 'ok' });
    expect(event.id).toBeTruthy();
    expect(loadDb().crmLeadEvents.some((e) => e.id === event.id)).toBe(true);
    const result = await __runActivityDualWriteCreateLeadEventForTest(crmUser, event);
    expect(result.skipped).toBe(true);
  });

  it('DUAL ON — createLeadEvent agenda shadow', async () => {
    __setCrmActivityWriteFlagsForTest({ overrides: DUAL });
    const lead = createLead(crmUser, { name: 'Lead Dual', phone: '11922223333' });
    const event = createLeadEvent(crmUser, lead.id, 'contact', { note: 'dual' });
    const result = await __runActivityDualWriteCreateLeadEventForTest(crmUser, event);
    expect(result.ok).toBe(true);
    expect(getRepositoryWriteAuditLog().some((e) => e.legacyId === event.id && e.syncResult === 'shadow')).toBe(true);
  });

  it('DUAL ON — updateLeadEvent', async () => {
    __setCrmActivityWriteFlagsForTest({ overrides: DUAL });
    const lead = createLead(crmUser, { name: 'Lead Upd', phone: '11933334444' });
    const event = createLeadEvent(crmUser, lead.id, 'note', { text: 'a' });
    const updated = updateLeadEvent(crmUser, event.id, { data: { text: 'b' } });
    expect(updated.data.text).toBe('b');
  });

  it('DUAL ON — createTask / completeTask / deleteTask', async () => {
    __setCrmActivityWriteFlagsForTest({ overrides: DUAL });
    const lead = createLead(crmUser, { name: 'Lead Task', phone: '11944445555' });
    const task = createTask(crmUser, {
      leadId: lead.id,
      title: 'Task Dual',
      dueAt: '2026-07-20T10:00:00.000Z',
    });
    const createResult = await __runActivityDualWriteCreateTaskForTest(crmUser, task);
    expect(createResult.ok).toBe(true);

    const completed = completeTask(crmUser, task.id);
    expect(completed.status).toBe('done');
    __clearRepositoryWriteIdempotencyForTest();
    const completeResult = await __runActivityDualWriteCompleteTaskForTest(crmUser, completed);
    expect(completeResult.ok).toBe(true);

    const task2 = createTask(crmUser, {
      leadId: lead.id,
      title: 'Task Delete',
      dueAt: '2026-07-21T10:00:00.000Z',
    });
    deleteTask(crmUser, task2.id);
    expect(loadDb().crmTasks.some((t) => t.id === task2.id)).toBe(false);
    __clearRepositoryWriteIdempotencyForTest();
    const delResult = await __runActivityDualWriteDeleteTaskForTest(crmUser, task2.id, TENANT);
    expect(delResult.ok).toBe(true);
  });

  it('DUAL ON — createCrmFollowUp / updateCrmFollowUp', async () => {
    __setCrmActivityWriteFlagsForTest({ overrides: DUAL });
    const lead = createLead(crmUser, { name: 'Lead FU', phone: '11955556666' });
    const fu = createCrmFollowUp(crmUser, lead.id, {
      dueAt: '2026-07-22T15:00:00.000Z',
      notes: 'Ligar',
    });
    const result = await __runActivityDualWriteCreateCrmFollowUpForTest(crmUser, fu);
    expect(result.ok).toBe(true);
    const updated = updateCrmFollowUp(crmUser, fu.id, { notes: 'Atualizado' });
    expect(updated.notes).toBe('Atualizado');
  });

  it('DUAL ON — createStrategicFollowUp / updateStrategicFollowUp', async () => {
    __setCrmActivityWriteFlagsForTest({ overrides: DUAL });
    const lead = createLead(crmUser, { name: 'Lead Strat', phone: '11966667777' });
    const fu = createStrategicFollowUp(crmUser, {
      leadId: lead.id,
      description: 'Estratégico',
      dueDate: '2026-07-23',
    });
    const result = await __runActivityDualWriteCreateStrategicFollowUpForTest(crmUser, fu);
    expect(result.ok).toBe(true);
    const updated = updateStrategicFollowUp(crmUser, fu.id, { description: 'Novo' });
    expect(updated.description).toBe('Novo');
  });

  it('fallback preserva IDB quando remote falha', async () => {
    __setCrmActivityWriteFlagsForTest({ overrides: DUAL });
    __setCrmActivityWriteRemoteForTest(async () => {
      throw new Error('remote unavailable');
    });
    const lead = createLead(crmUser, { name: 'Lead FB', phone: '11977778888' });
    const event = createLeadEvent(crmUser, lead.id, 'contact', { note: 'fb' });
    const result = await __runActivityDualWriteCreateLeadEventForTest(crmUser, event);
    expect(result.ok).toBe(false);
    expect(loadDb().crmLeadEvents.some((e) => e.id === event.id)).toBe(true);
  });

  it('idempotência evita duplicate write', () => {
    const key = buildRepositoryIdempotencyKey('lead-event', TENANT, 'ev-idem', 'create');
    markRepositoryWriteIdempotent(key);
    expect(shouldSkipDuplicateRepositoryWrite(key)).toBe(true);
  });

  it('updateTask com dual preserva legado', () => {
    __setCrmActivityWriteFlagsForTest({ overrides: DUAL });
    const lead = createLead(crmUser, { name: 'Lead UT', phone: '11988889999' });
    const task = createTask(crmUser, {
      leadId: lead.id,
      title: 'Antes',
      dueAt: '2026-07-24T10:00:00.000Z',
    });
    const updated = updateTask(crmUser, task.id, { title: 'Depois' });
    expect(updated.title).toBe('Depois');
    expect(loadDb().crmTasks.find((t) => t.id === task.id)?.title).toBe('Depois');
  });
});
