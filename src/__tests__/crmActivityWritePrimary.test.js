/**
 * Phase 6.8 — CRM Activity Primary Write + hydrate + soak validation.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import {
  createLeadEvent,
  createCrmFollowUp,
  createLead,
} from '../services/crmService.js';
import {
  createTask,
  completeTask,
  deleteTask,
} from '../services/crmTaskService.js';
import {
  createStrategicFollowUp,
} from '../services/followUpService.js';
import {
  getCrmActivityFlags,
  isCrmActivityDualWriteOnlyEnabled,
  isCrmActivityWritePrimaryEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/crm/crmActivityFlags.ts';
import {
  projectCrmActivityStreamAfterHydrate,
  hydrateCrmActivityIdbFromRemote,
} from '../repositories/crm/crmActivityHydrate.ts';
import { mapCrmTaskToActivity } from '../repositories/crm/crmActivityMapper.ts';
import {
  __setCrmActivityWriteFlagsForTest,
  __setCrmActivityWriteRemoteForTest,
  shouldUseCrmActivityDualWrite,
  shouldUseCrmActivityWritePrimary,
  __runCrmActivityPrimaryWriteCreateLeadEventForTest,
  __runCrmActivityPrimaryWriteCreateTaskForTest,
  __runCrmActivityPrimaryWriteCompleteTaskForTest,
  __runCrmActivityPrimaryWriteDeleteTaskForTest,
  __runCrmActivityPrimaryWriteCreateCrmFollowUpForTest,
  __runCrmActivityPrimaryWriteCreateStrategicFollowUpForTest,
  __runCrmActivitySoakReportForTest,
  buildCrmActivityWriteSoakReport,
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
  __clearCrmActivityWriteSoakForTest,
  getCrmActivityWriteSoakMetrics,
} from '../repositories/crm/crmActivityWriteSoak.ts';
import {
  CRM_ACTIVITY_DUAL_WRITE_FLAGS_RESOLVED,
  CRM_ACTIVITY_WRITE_PRIMARY_FLAGS_RESOLVED,
  CRM_TEST_FLAG_CONTRACT,
} from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const PRIMARY = CRM_ACTIVITY_WRITE_PRIMARY_FLAGS_RESOLVED;

const crmUser = {
  id: 'user-activity-primary',
  role: 'admin',
  tenantId: TENANT,
};

function seedPrimaryContext() {
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

describe('crmActivityWritePrimary — flags e guards', () => {
  afterEach(() => {
    __setCrmActivityWriteFlagsForTest(null);
    vi.unstubAllEnvs();
  });

  it('contrato vitest mantém primary OFF', () => {
    expect(CRM_TEST_FLAG_CONTRACT.VITE_CRM_ACTIVITY_WRITE_PRIMARY).toBe('false');
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

  it('flags OFF — primary e dual desabilitados', () => {
    __setCrmActivityWriteFlagsForTest(null);
    expect(shouldUseCrmActivityWritePrimary()).toBe(false);
    expect(shouldUseCrmActivityDualWrite()).toBe(false);
    expect(isCrmActivityWritePrimaryEnabled()).toBe(false);
  });

  it('primary ON desabilita dual-only path', () => {
    __setCrmActivityWriteFlagsForTest({ overrides: PRIMARY });
    expect(shouldUseCrmActivityWritePrimary()).toBe(true);
    expect(shouldUseCrmActivityDualWrite()).toBe(false);
  });

  it('dual e primary não rodam juntos quando ambos true', () => {
    __setCrmActivityWriteFlagsForTest({
      overrides: {
        ...CRM_ACTIVITY_DUAL_WRITE_FLAGS_RESOLVED,
        CRM_ACTIVITY_WRITE_PRIMARY: true,
      },
    });
    expect(shouldUseCrmActivityWritePrimary()).toBe(true);
    expect(shouldUseCrmActivityDualWrite()).toBe(false);
    expect(isCrmActivityDualWriteOnlyEnabled({
      overrides: {
        ...CRM_ACTIVITY_DUAL_WRITE_FLAGS_RESOLVED,
        CRM_ACTIVITY_WRITE_PRIMARY: true,
      },
    })).toBe(false);
  });

  it('build PROD trava WRITE_PRIMARY', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getCrmActivityFlags({ overrides: PRIMARY });
      expect(flags.CRM_ACTIVITY_WRITE_PRIMARY).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd === true ? true : false;
    }
  });

  it('host Supabase produção bloqueia WRITE_PRIMARY', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getCrmActivityFlags({ overrides: PRIMARY });
    expect(flags.CRM_ACTIVITY_WRITE_PRIMARY).toBe(false);
  });
});

describe('crmActivityWritePrimary — hydrate, fallback e rollback', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedPrimaryContext();
    __clearRepositoryWriteAuditForTest();
    __clearRepositoryWriteIdempotencyForTest();
    __clearCrmActivityWriteSoakForTest();
    __setCrmActivityWriteRemoteForTest(null);
    __setCrmActivityWriteFlagsForTest({ overrides: PRIMARY });
  });

  afterEach(() => {
    __setCrmActivityWriteFlagsForTest(null);
    __setCrmActivityWriteRemoteForTest(null);
    __clearRepositoryWriteAuditForTest();
    __clearRepositoryWriteIdempotencyForTest();
    __clearCrmActivityWriteSoakForTest();
    vi.restoreAllMocks();
  });

  it('primary createLeadEvent hidrata crmLeadEvents', async () => {
    const lead = createLead(crmUser, { name: 'Lead Event Primary', phone: '11911112222' });
    const event = createLeadEvent(crmUser, lead.id, 'contact', { note: 'ligou' });
    const result = await __runCrmActivityPrimaryWriteCreateLeadEventForTest(crmUser, event);
    expect(result.ok).toBe(true);
    const audit = getRepositoryWriteAuditLog().find((e) => e.legacyId === event.id);
    expect(audit?.syncResult).toBe('ok');
    expect(audit?.writeSource).toBe('primary-write-hydrate');
    expect(getCrmActivityWriteSoakMetrics().primaryOk).toBeGreaterThan(0);
    expect(getCrmActivityWriteSoakMetrics().hydrateOk).toBeGreaterThan(0);
    expect(loadDb().crmLeadEvents.some((row) => row.id === event.id)).toBe(true);
  });

  it('primary createTask hidrata crmTasks + projection Activity Stream', async () => {
    const lead = createLead(crmUser, { name: 'Lead Task Primary', phone: '11922223333' });
    const task = createTask(crmUser, {
      leadId: lead.id,
      title: 'Task Primary',
      type: 'call',
      dueAt: '2026-07-10T15:00:00.000Z',
    });
    const result = await __runCrmActivityPrimaryWriteCreateTaskForTest(crmUser, task);
    expect(result.ok).toBe(true);
    expect(getCrmActivityWriteSoakMetrics().hydrateOk).toBeGreaterThan(0);
    const idb = loadDb().crmTasks.find((row) => row.id === task.id);
    expect(idb?.title).toBe('Task Primary');
    const activity = mapCrmTaskToActivity(idb, TENANT);
    const projection = projectCrmActivityStreamAfterHydrate(activity, 'crmTasks');
    expect(projection.projectedId).toBe(task.id);
    expect(projection.source).toBe('crmTasks');
  });

  it('primary completeTask e deleteTask preservam authority IDB via hydrate', async () => {
    const lead = createLead(crmUser, { name: 'Lead Complete', phone: '11944445555' });
    const task = createTask(crmUser, {
      leadId: lead.id,
      title: 'Complete Primary',
      type: 'call',
      dueAt: '2026-07-11T10:00:00.000Z',
    });
    __clearRepositoryWriteIdempotencyForTest();
    const completed = completeTask(crmUser, task.id);
    await __runCrmActivityPrimaryWriteCompleteTaskForTest(crmUser, completed);
    expect(loadDb().crmTasks.find((row) => row.id === task.id)?.status).toBe('done');

    __clearRepositoryWriteIdempotencyForTest();
    deleteTask(crmUser, task.id);
    const del = await __runCrmActivityPrimaryWriteDeleteTaskForTest(crmUser, task.id, TENANT);
    expect(del.ok).toBe(true);
    expect(loadDb().crmTasks.some((row) => row.id === task.id)).toBe(false);
    expect(getCrmActivityWriteSoakMetrics().hydrateOk).toBeGreaterThan(0);
  });

  it('primary createCrmFollowUp e strategic followUp hidratam stores', async () => {
    const lead = createLead(crmUser, { name: 'FU Primary', phone: '11933334444' });
    const crmFu = createCrmFollowUp(crmUser, lead.id, {
      dueAt: '2026-07-12T12:00:00.000Z',
      type: 'retorno',
      notes: 'ligar',
    });
    const r1 = await __runCrmActivityPrimaryWriteCreateCrmFollowUpForTest(crmUser, crmFu);
    expect(r1.ok).toBe(true);
    expect(loadDb().crmFollowUps.some((row) => row.id === crmFu.id)).toBe(true);

    __clearRepositoryWriteIdempotencyForTest();
    const strategic = createStrategicFollowUp(crmUser, {
      dueDate: '2026-07-13',
      type: 'retorno',
      description: 'estratégico',
      leadId: lead.id,
    });
    const r2 = await __runCrmActivityPrimaryWriteCreateStrategicFollowUpForTest(crmUser, strategic);
    expect(r2.ok).toBe(true);
    expect(loadDb().followUps.some((row) => row.id === strategic.id)).toBe(true);
  });

  it('hydrate helper upsert sem duplicar', () => {
    withDb((db) => {
      db.crmTasks = [{
        id: 'task-hydrate-1',
        clinicId: 'clinic-1',
        tenant_id: TENANT,
        title: 'Antes',
        status: 'pending',
        dueAt: '2026-07-10T00:00:00.000Z',
        type: 'call',
        channel: '',
        priority: 'medium',
        assignedTo: null,
        createdBy: null,
        createdAt: '2026-07-09T00:00:00.000Z',
        updatedAt: '2026-07-09T00:00:00.000Z',
        doneAt: null,
        leadId: null,
        patientId: null,
        budgetId: null,
        appointmentId: null,
        description: '',
      }];
      return db;
    });
    const activity = {
      id: 'task-hydrate-1',
      type: 'TASK',
      leadId: null,
      patientId: null,
      ownerId: null,
      timestamp: '2026-07-10T00:00:00.000Z',
      status: 'pending',
      payload: { title: 'Depois Remoto', clinicId: 'clinic-1' },
      source: 'crmTasks',
      tenantId: TENANT,
    };
    const count = hydrateCrmActivityIdbFromRemote(activity, 'create', 'crmTasks');
    expect(count).toBe(1);
    const rows = loadDb().crmTasks.filter((row) => row.id === 'task-hydrate-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Depois Remoto');
  });

  it('fallback preserva legado quando remoto falha', async () => {
    __setCrmActivityWriteRemoteForTest(async () => {
      throw new Error('remote unavailable');
    });
    const lead = createLead(crmUser, { name: 'Fallback Act', phone: '11955556666' });
    const event = createLeadEvent(crmUser, lead.id, 'contact', { note: 'fallback' });
    const result = await __runCrmActivityPrimaryWriteCreateLeadEventForTest(crmUser, event);
    expect(result.ok).toBe(false);
    expect(loadDb().crmLeadEvents.some((row) => row.id === event.id)).toBe(true);
    expect(getCrmActivityWriteSoakMetrics().fallbackLegacy).toBeGreaterThan(0);
  });

  it('rollback por flag — primary OFF não chama remote', async () => {
    __setCrmActivityWriteFlagsForTest(null);
    const remote = vi.fn().mockResolvedValue(null);
    __setCrmActivityWriteRemoteForTest(remote);
    const lead = createLead(crmUser, { name: 'Rollback Act', phone: '11966667777' });
    const event = createLeadEvent(crmUser, lead.id, 'contact', {});
    const result = await __runCrmActivityPrimaryWriteCreateLeadEventForTest(crmUser, event);
    expect(result.skipped).toBe(true);
    expect(remote).not.toHaveBeenCalled();
  });

  it('flags OFF — createLeadEvent 100% legado', () => {
    __setCrmActivityWriteFlagsForTest(null);
    const lead = createLead(crmUser, { name: 'Legado Puro', phone: '11977778888' });
    const event = createLeadEvent(crmUser, lead.id, 'contact', {});
    expect(event.id).toBeTruthy();
    expect(loadDb().crmLeadEvents.some((row) => row.id === event.id)).toBe(true);
  });

  it('idempotência evita duplicate write', () => {
    const key = buildRepositoryIdempotencyKey('lead-event', TENANT, 'evt-idem', 'create');
    markRepositoryWriteIdempotent(key);
    expect(shouldSkipDuplicateRepositoryWrite(key)).toBe(true);
  });

  it('audit in-memory registra correlation_id e tenant_id', async () => {
    const lead = createLead(crmUser, { name: 'Audit Act', phone: '11988889999' });
    const event = createLeadEvent(crmUser, lead.id, 'contact', {});
    await __runCrmActivityPrimaryWriteCreateLeadEventForTest(crmUser, event);
    const audit = getRepositoryWriteAuditLog().find((e) => e.legacyId === event.id);
    expect(audit?.tenantId).toBe(TENANT);
    expect(audit?.correlationId).toBeTruthy();
    expect(audit?.writeSource).toBe('primary-write-hydrate');
  });
});

describe('crmActivityWritePrimary — soak validation', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedPrimaryContext();
    __clearCrmActivityWriteSoakForTest();
    __clearRepositoryWriteAuditForTest();
    __clearRepositoryWriteIdempotencyForTest();
    __setCrmActivityWriteRemoteForTest(null);
    __setCrmActivityWriteFlagsForTest({ overrides: PRIMARY });
  });

  afterEach(() => {
    __setCrmActivityWriteFlagsForTest(null);
    __setCrmActivityWriteRemoteForTest(null);
    __clearCrmActivityWriteSoakForTest();
    vi.restoreAllMocks();
  });

  it('buildCrmActivityWriteSoakReport expõe métricas exigidas', async () => {
    const lead = createLead(crmUser, { name: 'Soak Act', phone: '11800001111' });
    const event = createLeadEvent(crmUser, lead.id, 'contact', {});
    await __runCrmActivityPrimaryWriteCreateLeadEventForTest(crmUser, event);
    const report = buildCrmActivityWriteSoakReport(TENANT);
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
    expect(report.metrics).toHaveProperty('lastError');
    expect(report.rollback).toContain('CRM_ACTIVITY_WRITE_PRIMARY');
    expect(report.activityStreamProjection).toBeTruthy();
  });

  it('__runCrmActivitySoakReportForTest inclui auditSummary', async () => {
    const report = __runCrmActivitySoakReportForTest(TENANT);
    expect(report?.tenantId).toBe(TENANT);
    expect(report?.auditSummary).toBeTruthy();
  });
});
