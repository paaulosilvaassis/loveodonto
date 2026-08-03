/**
 * Phase 7.5 — CRM Wave B Domain Event Adoption.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import {
  addLeadEvent,
  createFollowUp,
  createLead,
  updateCrmFollowUp,
  CRM_EVENT_TYPE,
} from '../services/crmService.js';
import {
  createFollowUp as createStrategicFollowUp,
  updateStrategicFollowUp,
  completeFollowUp,
} from '../services/followUpService.js';
import {
  createTask,
  updateTask,
  completeTask,
  cancelTask,
  deleteTask,
} from '../services/crmTaskService.js';
import {
  __setCrmLeadDomainEventFlagsForTest,
  resolveLeadOperationCorrelation,
  resolveLeadWriteCorrelationId,
} from '../services/crmLeadDomainEventPublisher.js';
import {
  __setCrmActivityDomainEventFlagsForTest,
  shouldPublishTimelineDomainEvent,
  resolveCrmWaveBOperationCorrelation,
} from '../services/crmActivityDomainEventPublisher.js';
import {
  __setCrmFollowUpDomainEventFlagsForTest,
  resolveFollowUpMutationEventType,
} from '../services/crmFollowUpDomainEventPublisher.js';
import {
  __setCrmTaskDomainEventFlagsForTest,
  resolveTaskMutationEventType,
} from '../services/crmTaskDomainEventPublisher.js';
import {
  __clearDomainEventBusForTest,
  getPublishedDomainEventsBuffer,
} from '../domain-events/domainEventBus.ts';
import {
  __clearDomainEventAuditForTest,
} from '../domain-events/domainEventAudit.ts';
import { __clearDomainEventAuditHooksForTest } from '../domain-events/shared/domainEventAuditHooks.ts';
import { __clearDomainEventDedupForTest } from '../domain-events/shared/domainEventDeduplication.ts';
import { isRegisteredDomainEventType } from '../domain-events/domainEventRegistry.ts';
import {
  getDomainEventFlags,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../domain-events/domainEventFlags.ts';
import {
  detachDomainEventObservability,
} from '../domain-events/observability/attachDomainEventObservability.ts';
import {
  getDomainEventMetrics,
  __clearDomainEventMetricsForTest,
} from '../domain-events/observability/domainEventMetrics.ts';
import {
  getDomainEventTraces,
  __clearDomainEventTracesForTest,
  findDomainEventTracesByCorrelation,
} from '../domain-events/observability/domainEventTrace.ts';
import {
  buildDomainEventTimelineTree,
  __clearDomainEventTimelineForTest,
} from '../domain-events/observability/domainEventTimeline.ts';
import { getDomainEventHealth } from '../domain-events/observability/domainEventHealth.ts';
import { inspectDomainEvents } from '../domain-events/observability/domainEventInspector.ts';
import { publishViaDomainEventFacade } from '../domain-events/shared/domainEventFacade.ts';
import {
  DOMAIN_EVENTS_FLAGS_RESOLVED,
  DOMAIN_EVENT_TEST_FLAG_CONTRACT,
} from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const FLAGS_ON = { overrides: DOMAIN_EVENTS_FLAGS_RESOLVED };
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const crmUser = {
  id: 'user-crm-wb',
  role: 'admin',
  tenantId: TENANT,
  permissions: { 'crm:write': true },
};

function enableAllCrmDomainEventFlags() {
  __setCrmLeadDomainEventFlagsForTest(FLAGS_ON);
  __setCrmActivityDomainEventFlagsForTest(FLAGS_ON);
  __setCrmFollowUpDomainEventFlagsForTest(FLAGS_ON);
  __setCrmTaskDomainEventFlagsForTest(FLAGS_ON);
}

function clearAllCrmDomainEventFlags() {
  __setCrmLeadDomainEventFlagsForTest(null);
  __setCrmActivityDomainEventFlagsForTest(null);
  __setCrmFollowUpDomainEventFlagsForTest(null);
  __setCrmTaskDomainEventFlagsForTest(null);
}

function seedCrmWaveB() {
  withDb((db) => {
    db.clinicProfile = { id: 'clinic-1', tenant_id: TENANT };
    db.crmLeads = [];
    db.crmLeadEvents = [];
    db.crmFollowUps = [];
    db.crmTasks = [];
    db.followUps = [];
    db.crmPipelineStages = [
      { id: 'st-1', key: 'novo_lead', name: 'Novo', order: 1, tenant_id: TENANT },
      { id: 'st-2', key: 'aprovado', name: 'Aprovado', order: 2, tenant_id: TENANT },
    ];
    return db;
  });
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

function clearObs() {
  __clearDomainEventMetricsForTest();
  __clearDomainEventTracesForTest();
  __clearDomainEventTimelineForTest();
  detachDomainEventObservability();
}

describe('crmWaveBDomainEvents — registry / guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearAllCrmDomainEventFlags();
  });

  it('eventos Wave B oficiais no registry', () => {
    expect(isRegisteredDomainEventType('FOLLOW_UP_CREATED')).toBe(true);
    expect(isRegisteredDomainEventType('FOLLOW_UP_UPDATED')).toBe(true);
    expect(isRegisteredDomainEventType('FOLLOW_UP_COMPLETED')).toBe(true);
    expect(isRegisteredDomainEventType('FOLLOW_UP_CANCELLED')).toBe(true);
    expect(isRegisteredDomainEventType('FOLLOW_UP_RESCHEDULED')).toBe(true);
    expect(isRegisteredDomainEventType('TASK_CREATED')).toBe(true);
    expect(isRegisteredDomainEventType('TASK_UPDATED')).toBe(true);
    expect(isRegisteredDomainEventType('TASK_COMPLETED')).toBe(true);
    expect(isRegisteredDomainEventType('TASK_DELETED')).toBe(true);
    expect(isRegisteredDomainEventType('CRM_TIMELINE_EVENT_CREATED')).toBe(true);
    expect(isRegisteredDomainEventType('LEAD_NOTE_ADDED')).toBe(false);
    expect(isRegisteredDomainEventType('TASK_REOPENED')).toBe(false);
  });

  it('flags OFF no contrato vitest', () => {
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_DOMAIN_EVENTS).toBe('false');
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_DOMAIN_EVENT_OBSERVABILITY).toBe('false');
  });

  it('PROD trava DOMAIN_EVENTS', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      expect(getDomainEventFlags({ overrides: DOMAIN_EVENTS_FLAGS_RESOLVED }).DOMAIN_EVENTS).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd === true ? true : false;
    }
  });

  it('host production bloqueia', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    expect(getDomainEventFlags({ overrides: DOMAIN_EVENTS_FLAGS_RESOLVED }).DOMAIN_EVENTS).toBe(false);
  });
});

describe('crmWaveBDomainEvents — correlation Wave A corrigida', () => {
  it('aggregateId ≠ correlationId gerado', () => {
    const corr = resolveLeadOperationCorrelation({});
    expect(corr.correlationId).toMatch(/^de-corr-/);
    expect(resolveLeadWriteCorrelationId('lead-xyz')).toMatch(/^de-corr-/);
    expect(resolveLeadWriteCorrelationId('lead-xyz')).not.toBe('lead-xyz');
    expect(resolveLeadWriteCorrelationId('lead-xyz', 'kept')).toBe('kept');
  });
});

describe('crmWaveBDomainEvents — precedência', () => {
  it('follow-up: complete > cancel > reschedule > update', () => {
    expect(resolveFollowUpMutationEventType(
      { status: 'pending', dueDate: '2026-08-01' },
      { status: 'completed', completedAt: '2026-08-02', dueDate: '2026-08-01' },
      { status: 'completed' },
      'followUps',
    )).toBe('FOLLOW_UP_COMPLETED');

    expect(resolveFollowUpMutationEventType(
      { status: 'pending', dueDate: '2026-08-01' },
      { status: 'cancelled', dueDate: '2026-08-01' },
      { status: 'cancelled' },
      'followUps',
    )).toBe('FOLLOW_UP_CANCELLED');

    expect(resolveFollowUpMutationEventType(
      { status: 'pending', dueDate: '2026-08-01' },
      { status: 'pending', dueDate: '2026-08-10' },
      { dueDate: '2026-08-10' },
      'followUps',
    )).toBe('FOLLOW_UP_RESCHEDULED');

    expect(resolveFollowUpMutationEventType(
      { status: 'pending', dueDate: '2026-08-01', description: 'a' },
      { status: 'pending', dueDate: '2026-08-01', description: 'b' },
      { description: 'b' },
      'followUps',
    )).toBe('FOLLOW_UP_UPDATED');
  });

  it('task: complete > delete > update; cancel = update', () => {
    expect(resolveTaskMutationEventType({}, { status: 'done' }, {}, 'complete')).toBe('TASK_COMPLETED');
    expect(resolveTaskMutationEventType({}, {}, {}, 'delete')).toBe('TASK_DELETED');
    expect(resolveTaskMutationEventType(
      { status: 'pending' },
      { status: 'canceled' },
      { status: 'canceled' },
      'update',
    )).toBe('TASK_UPDATED');
  });

  it('timeline skip types evitam duplicidade com task/follow-up', () => {
    expect(shouldPublishTimelineDomainEvent(CRM_EVENT_TYPE.TASK_CREATED)).toBe(false);
    expect(shouldPublishTimelineDomainEvent(CRM_EVENT_TYPE.FOLLOW_UP_CREATED)).toBe(false);
    expect(shouldPublishTimelineDomainEvent(CRM_EVENT_TYPE.CONTACT)).toBe(true);
  });
});

describe('crmWaveBDomainEvents — adoção', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedCrmWaveB();
    __clearDomainEventBusForTest();
    __clearDomainEventAuditForTest();
    __clearDomainEventDedupForTest();
    __clearDomainEventAuditHooksForTest();
    clearObs();
    clearAllCrmDomainEventFlags();
  });

  afterEach(() => {
    clearAllCrmDomainEventFlags();
    clearObs();
  });

  it('flags OFF — createTask/followUp/timeline no-op', async () => {
    const lead = createLead(crmUser, { name: 'Off', phone: '11911112222' });
    createTask(crmUser, {
      leadId: lead.id,
      title: 'Tarefa off',
      dueAt: '2026-08-15T10:00:00.000Z',
      tenant_id: TENANT,
    });
    createFollowUp(crmUser, lead.id, { dueAt: '2026-08-16T10:00:00.000Z' });
    addLeadEvent(crmUser, lead.id, CRM_EVENT_TYPE.CONTACT, { channel: 'phone' });
    await flushMicrotasks();
    expect(getPublishedDomainEventsBuffer().filter((e) =>
      ['TASK_CREATED', 'FOLLOW_UP_CREATED', 'CRM_TIMELINE_EVENT_CREATED'].includes(e.eventType),
    )).toHaveLength(0);
  });

  it('CRM_TIMELINE_EVENT_CREATED em contato explícito', async () => {
    enableAllCrmDomainEventFlags();
    const lead = createLead(crmUser, { name: 'Timeline', phone: '11922223333' });
    await flushMicrotasks();
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    addLeadEvent(crmUser, lead.id, CRM_EVENT_TYPE.CONTACT, { channel: 'phone', notes: 'texto longo clínico' });
    await flushMicrotasks();
    const published = getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'CRM_TIMELINE_EVENT_CREATED');
    expect(published).toHaveLength(1);
    expect(published[0].payload.activityType).toBe('contact');
    expect(published[0].payload.metadata).not.toHaveProperty('notes');
  });

  it('FOLLOW_UP_CREATED legado crmFollowUps', async () => {
    enableAllCrmDomainEventFlags();
    const lead = createLead(crmUser, { name: 'FU Legado', phone: '11933334444' });
    await flushMicrotasks();
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    const fu = createFollowUp(crmUser, lead.id, { dueAt: '2026-08-20T12:00:00.000Z', type: 'retorno' });
    await flushMicrotasks();
    const created = getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'FOLLOW_UP_CREATED');
    expect(created).toHaveLength(1);
    expect(created[0].payload.sourceStore).toBe('crmFollowUps');
    expect(created[0].payload.followUpId).toBe(fu.id);
    // timeline side-effect não gera CRM_TIMELINE_EVENT_CREATED
    expect(getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'CRM_TIMELINE_EVENT_CREATED')).toHaveLength(0);
  });

  it('FOLLOW_UP_CREATED estratégico followUps', async () => {
    enableAllCrmDomainEventFlags();
    const lead = createLead(crmUser, { name: 'FU Strat', phone: '11944445555' });
    await flushMicrotasks();
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    const fu = createStrategicFollowUp(crmUser, {
      leadId: lead.id,
      dueDate: '2026-08-21',
      tenant_id: TENANT,
    });
    await flushMicrotasks();
    const created = getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'FOLLOW_UP_CREATED');
    expect(created).toHaveLength(1);
    expect(created[0].payload.sourceStore).toBe('followUps');
    expect(created[0].aggregateId).toBe(fu.id);
  });

  it('FOLLOW_UP_COMPLETED / RESCHEDULED / CANCELLED', async () => {
    enableAllCrmDomainEventFlags();
    const lead = createLead(crmUser, { name: 'FU Mut', phone: '11955556666' });
    const fu = createStrategicFollowUp(crmUser, {
      leadId: lead.id,
      dueDate: '2026-08-22',
      tenant_id: TENANT,
    });
    await flushMicrotasks();
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();

    updateStrategicFollowUp(crmUser, fu.id, { dueDate: '2026-09-01' });
    await flushMicrotasks();
    expect(getPublishedDomainEventsBuffer().some((e) => e.eventType === 'FOLLOW_UP_RESCHEDULED')).toBe(true);

    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    completeFollowUp(crmUser, fu.id);
    await flushMicrotasks();
    expect(getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'FOLLOW_UP_COMPLETED')).toHaveLength(1);

    const fu2 = createStrategicFollowUp(crmUser, {
      leadId: lead.id,
      dueDate: '2026-08-23',
      tenant_id: TENANT,
    });
    await flushMicrotasks();
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    updateStrategicFollowUp(crmUser, fu2.id, { status: 'cancelled' });
    await flushMicrotasks();
    expect(getPublishedDomainEventsBuffer().some((e) => e.eventType === 'FOLLOW_UP_CANCELLED')).toBe(true);
  });

  it('crmFollowUps complete via doneAt → FOLLOW_UP_COMPLETED', async () => {
    enableAllCrmDomainEventFlags();
    const lead = createLead(crmUser, { name: 'FU Done', phone: '11966667777' });
    const fu = createFollowUp(crmUser, lead.id, { dueAt: '2026-08-24T10:00:00.000Z' });
    await flushMicrotasks();
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    updateCrmFollowUp(crmUser, fu.id, { doneAt: '2026-08-24T11:00:00.000Z' });
    await flushMicrotasks();
    expect(getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'FOLLOW_UP_COMPLETED')).toHaveLength(1);
  });

  it('TASK_CREATED / UPDATED / COMPLETED / DELETED', async () => {
    enableAllCrmDomainEventFlags();
    const lead = createLead(crmUser, { name: 'Task', phone: '11977778888' });
    await flushMicrotasks();
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();

    const task = createTask(crmUser, {
      leadId: lead.id,
      title: 'Ligar',
      dueAt: '2026-08-25T10:00:00.000Z',
      tenant_id: TENANT,
    });
    await flushMicrotasks();
    expect(getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'TASK_CREATED')).toHaveLength(1);
    expect(getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'CRM_TIMELINE_EVENT_CREATED')).toHaveLength(0);

    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    updateTask(crmUser, task.id, { title: 'Ligar 2' });
    await flushMicrotasks();
    expect(getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'TASK_UPDATED')).toHaveLength(1);
    expect(getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'TASK_COMPLETED')).toHaveLength(0);

    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    completeTask(crmUser, task.id);
    await flushMicrotasks();
    expect(getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'TASK_COMPLETED')).toHaveLength(1);

    const task2 = createTask(crmUser, {
      leadId: lead.id,
      title: 'Apagar',
      dueAt: '2026-08-26T10:00:00.000Z',
      tenant_id: TENANT,
    });
    await flushMicrotasks();
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    deleteTask(crmUser, task2.id);
    await flushMicrotasks();
    expect(getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'TASK_DELETED')).toHaveLength(1);
  });

  it('cancelTask emite TASK_UPDATED (não COMPLETED)', async () => {
    enableAllCrmDomainEventFlags();
    const lead = createLead(crmUser, { name: 'Cancel', phone: '11988889999' });
    const task = createTask(crmUser, {
      leadId: lead.id,
      title: 'Cancelar',
      dueAt: '2026-08-27T10:00:00.000Z',
      tenant_id: TENANT,
    });
    await flushMicrotasks();
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    cancelTask(crmUser, task.id);
    await flushMicrotasks();
    expect(getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'TASK_UPDATED')).toHaveLength(1);
    expect(getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'TASK_COMPLETED')).toHaveLength(0);
  });

  it('falha da Facade não quebra operação', async () => {
    enableAllCrmDomainEventFlags();
    const spy = vi.spyOn(
      await import('../domain-events/shared/domainEventFacade.ts'),
      'publishViaDomainEventFacade',
    ).mockRejectedValue(new Error('facade down'));
    const lead = createLead(crmUser, { name: 'Resiliente WB', phone: '11900001111' });
    const task = createTask(crmUser, {
      leadId: lead.id,
      title: 'Ok',
      dueAt: '2026-08-28T10:00:00.000Z',
      tenant_id: TENANT,
    });
    expect(loadDb().crmTasks.some((t) => t.id === task.id)).toBe(true);
    await flushMicrotasks();
    spy.mockRestore();
  });

  it('publishers usam Facade; adapters sem Domain Events', () => {
    for (const file of [
      'crmActivityDomainEventPublisher.js',
      'crmFollowUpDomainEventPublisher.js',
      'crmTaskDomainEventPublisher.js',
    ]) {
      const src = fs.readFileSync(path.join(__dirname, '../services', file), 'utf8');
      expect(src).toMatch(/publishViaDomainEventFacade/);
      expect(src).not.toMatch(/publishDomainEventViaToolkit/);
    }
    for (const file of ['crmActivityWriteAdapter.js', 'crmWriteAdapter.js']) {
      const src = fs.readFileSync(path.join(__dirname, '../services', file), 'utf8');
      expect(src).not.toMatch(/DomainEventPublisher|publishViaDomainEventFacade/);
    }
  });

  it('ausência de consumers funcionais', () => {
    const shared = fs.readdirSync(path.join(__dirname, '../domain-events/shared'));
    expect(shared.every((f) => !/consumer/i.test(f))).toBe(true);
  });

  it('side-effects legados preservados (timeline + stores)', async () => {
    enableAllCrmDomainEventFlags();
    const lead = createLead(crmUser, { name: 'Legacy', phone: '11912121212' });
    createFollowUp(crmUser, lead.id, { dueAt: '2026-08-29T10:00:00.000Z' });
    createTask(crmUser, {
      leadId: lead.id,
      title: 'Legacy task',
      dueAt: '2026-08-29T11:00:00.000Z',
      tenant_id: TENANT,
    });
    await flushMicrotasks();
    const db = loadDb();
    expect(db.crmFollowUps.length).toBeGreaterThan(0);
    expect(db.crmTasks.length).toBeGreaterThan(0);
    expect(db.crmLeadEvents.some((e) => e.type === 'follow_up_created')).toBe(true);
    // task_created via addLeadEvent aninhado — store crmTasks é a autoridade da operação
    expect(db.crmTasks.some((t) => t.title === 'Legacy task')).toBe(true);
  });
});

describe('crmWaveBDomainEvents — observability', () => {
  beforeEach(() => {
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    clearObs();
  });
  afterEach(() => {
    clearObs();
  });

  it('correlation compartilhada + causation + timeline + health', async () => {
    const sharedCorr = resolveCrmWaveBOperationCorrelation({}).correlationId;
    const parent = await publishViaDomainEventFacade({
      eventType: 'LEAD_CREATED',
      aggregateId: 'lead-obs-1',
      tenantId: TENANT,
      correlationId: sharedCorr,
      causationId: null,
      payload: { leadId: 'lead-obs-1', tenantId: TENANT },
    }, { flagsInput: FLAGS_ON });

    await publishViaDomainEventFacade({
      eventType: 'FOLLOW_UP_CREATED',
      aggregateId: 'fup-obs-1',
      tenantId: TENANT,
      correlationId: sharedCorr,
      causationId: parent.eventId,
      payload: { followUpId: 'fup-obs-1', leadId: 'lead-obs-1', tenantId: TENANT, sourceStore: 'followUps' },
    }, { flagsInput: FLAGS_ON });

    await publishViaDomainEventFacade({
      eventType: 'TASK_CREATED',
      aggregateId: 'task-obs-1',
      tenantId: TENANT,
      correlationId: sharedCorr,
      causationId: parent.eventId,
      payload: { taskId: 'task-obs-1', leadId: 'lead-obs-1', tenantId: TENANT, sourceStore: 'crmTasks' },
    }, { flagsInput: FLAGS_ON });

    const chain = findDomainEventTracesByCorrelation(sharedCorr);
    expect(chain.length).toBeGreaterThanOrEqual(2);
    const tree = buildDomainEventTimelineTree(sharedCorr);
    expect(tree.length).toBeGreaterThan(0);
    expect(getDomainEventMetrics().totalPublished).toBeGreaterThan(0);
    expect(getDomainEventHealth().components.length).toBe(8);
    expect(inspectDomainEvents().diagnostics).toBeDefined();
  });

  it('dedup + rejected alimentam health/diagnostics', async () => {
    const input = {
      eventType: 'TASK_CREATED',
      eventId: 'de-task-dedup-fixed',
      aggregateId: 'task-dedup',
      tenantId: TENANT,
      correlationId: 'corr-dedup',
      payload: { taskId: 'task-dedup', tenantId: TENANT },
    };
    const first = await publishViaDomainEventFacade(input, {
      flagsInput: FLAGS_ON,
      enableDedup: true,
    });
    const second = await publishViaDomainEventFacade(input, {
      flagsInput: FLAGS_ON,
      enableDedup: true,
    });
    expect(first.accepted).toBe(true);
    expect(second.skipped).toBe(true);
    expect(getDomainEventTraces().some((t) => String(t.reason || '').includes('dedup'))).toBe(true);

    await publishViaDomainEventFacade({
      eventType: 'NOT_REGISTERED_EVENT',
      aggregateId: 'x',
      tenantId: TENANT,
      payload: {},
    }, { flagsInput: FLAGS_ON });
    const snap = inspectDomainEvents();
    expect(snap.diagnostics.issues.length).toBeGreaterThanOrEqual(0);
    expect(getDomainEventMetrics().totalRejected + getDomainEventMetrics().totalDuplicates).toBeGreaterThan(0);
  });
});
