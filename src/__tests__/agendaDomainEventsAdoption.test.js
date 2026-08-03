/**
 * Phase 7.4 — Domain Event Facade + Agenda Domain Event Adoption (Wave A).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import {
  cancelAppointment,
  checkInAppointment,
  createAppointment,
  createAppointmentFromCrm,
  updateAppointment,
} from '../services/appointmentService.js';
import {
  __setAgendaDomainEventFlagsForTest,
  __publishAppointmentCreatedDomainEventForTest,
  resolveAgendaOperationCorrelation,
  resolveAppointmentUpdateEventType,
  scheduleAppointmentCreatedDomainEvent,
} from '../services/agendaAppointmentDomainEventPublisher.js';
import {
  __clearDomainEventBusForTest,
  getPublishedDomainEventsBuffer,
} from '../domain-events/domainEventBus.ts';
import {
  __clearDomainEventAuditForTest,
  getDomainEventAuditLog,
} from '../domain-events/domainEventAudit.ts';
import {
  __clearDomainEventAuditHooksForTest,
  registerDomainEventAuditHook,
} from '../domain-events/shared/domainEventAuditHooks.ts';
import { __clearDomainEventDedupForTest } from '../domain-events/shared/domainEventDeduplication.ts';
import {
  getDomainEventFlags,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../domain-events/domainEventFlags.ts';
import { isRegisteredDomainEventType } from '../domain-events/domainEventRegistry.ts';
import {
  publishViaDomainEventFacade,
  prepareDomainEventViaFacade,
} from '../domain-events/shared/domainEventFacade.ts';
import {
  detachDomainEventObservability,
  isDomainEventObservabilityAttached,
} from '../domain-events/observability/attachDomainEventObservability.ts';
import {
  getDomainEventMetrics,
  __clearDomainEventMetricsForTest,
} from '../domain-events/observability/domainEventMetrics.ts';
import {
  getDomainEventTraces,
  __clearDomainEventTracesForTest,
} from '../domain-events/observability/domainEventTrace.ts';
import { __clearDomainEventTimelineForTest } from '../domain-events/observability/domainEventTimeline.ts';
import {
  DOMAIN_EVENTS_FLAGS_RESOLVED,
  DOMAIN_EVENT_TEST_FLAG_CONTRACT,
} from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const FLAGS_ON = DOMAIN_EVENTS_FLAGS_RESOLVED;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const agendaUser = {
  id: 'user-agenda-de',
  role: 'admin',
  tenantId: TENANT,
  permissions: { 'agenda:write': true },
};

function tomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

function seedAgendaContext() {
  withDb((db) => {
    db.clinicProfile = { id: 'clinic-1', tenant_id: TENANT };
    db.patients = [{ id: 'pat-agenda-001', tenant_id: TENANT, full_name: 'Paciente Agenda' }];
    db.collaborators = [{ id: 'col-agenda-001', tenant_id: TENANT, apelido: 'Dr. Agenda' }];
    db.rooms = [{ id: 'room-agenda-001', tenant_id: TENANT, name: 'Sala Agenda' }];
    db.crmLeads = [{
      id: 'lead-agenda-001',
      tenant_id: TENANT,
      name: 'Lead Agenda',
      patientId: null,
      stageKey: 'novo_lead',
    }];
    db.appointments = [];
    db.appointmentBlocks = [];
    db.journeyEntries = [];
    return db;
  });
}

function appointmentPayload(overrides = {}) {
  return {
    patientId: 'pat-agenda-001',
    professionalId: 'col-agenda-001',
    roomId: 'room-agenda-001',
    date: tomorrowIso(),
    startTime: '10:00',
    endTime: '10:30',
    ...overrides,
  };
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

describe('domainEventFacade — API única', () => {
  beforeEach(() => {
    __clearDomainEventBusForTest();
    __clearDomainEventAuditForTest();
    __clearDomainEventDedupForTest();
    __clearDomainEventAuditHooksForTest();
    clearObs();
  });
  afterEach(() => {
    clearObs();
    vi.unstubAllEnvs();
  });

  it('flags OFF → skipped no-op', async () => {
    const result = await publishViaDomainEventFacade({
      eventType: 'APPOINTMENT_CREATED',
      aggregateId: 'a1',
      tenantId: TENANT,
      payload: { appointmentId: 'a1' },
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/DOMAIN_EVENTS=false/);
  });

  it('flags ON → publica via toolkit interno', async () => {
    const result = await publishViaDomainEventFacade(
      {
        eventType: 'APPOINTMENT_CREATED',
        aggregateId: 'a-facade-1',
        tenantId: TENANT,
        correlationId: 'de-corr-facade-1',
        payload: { appointmentId: 'a-facade-1' },
      },
      { flagsInput: { overrides: FLAGS_ON } },
    );
    expect(result.accepted).toBe(true);
    expect(getPublishedDomainEventsBuffer()).toHaveLength(1);
  });

  it('prepareDomainEventViaFacade normaliza evento', () => {
    const event = prepareDomainEventViaFacade({
      eventType: 'APPOINTMENT_UPDATED',
      aggregateId: 'a2',
      tenantId: TENANT,
      payload: { appointmentId: 'a2' },
    });
    expect(event.eventType).toBe('APPOINTMENT_UPDATED');
    expect(event.aggregateType).toBe('appointment');
    expect(event.source).toBe('agenda');
  });

  it('observability attach + metrics quando flags ON', async () => {
    await publishViaDomainEventFacade(
      {
        eventType: 'APPOINTMENT_CREATED',
        aggregateId: 'a-obs-1',
        tenantId: TENANT,
        correlationId: 'corr-obs-facade',
        payload: { appointmentId: 'a-obs-1' },
      },
      { flagsInput: { overrides: FLAGS_ON } },
    );
    expect(isDomainEventObservabilityAttached()).toBe(true);
    const metrics = getDomainEventMetrics();
    expect(metrics.totalPrepared + metrics.totalPublished).toBeGreaterThan(0);
    expect(getDomainEventTraces().length).toBeGreaterThan(0);
  });

  it('PROD trava flags da facade', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      expect(getDomainEventFlags({ overrides: FLAGS_ON }).DOMAIN_EVENTS).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd === true ? true : false;
    }
  });
});

describe('agendaDomainEvents — registry e guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    __setAgendaDomainEventFlagsForTest(null);
  });

  it('eventos agenda oficiais no registry', () => {
    expect(isRegisteredDomainEventType('APPOINTMENT_CREATED')).toBe(true);
    expect(isRegisteredDomainEventType('APPOINTMENT_CONFIRMED')).toBe(true);
    expect(isRegisteredDomainEventType('APPOINTMENT_UPDATED')).toBe(true);
    expect(isRegisteredDomainEventType('APPOINTMENT_CANCELLED')).toBe(true);
    expect(isRegisteredDomainEventType('APPOINTMENT_RESCHEDULED')).toBe(true);
    expect(isRegisteredDomainEventType('APPOINTMENT_STATUS_CHANGED')).toBe(true);
    expect(isRegisteredDomainEventType('APPOINTMENT_DELETED')).toBe(false);
  });

  it('contrato vitest mantém flags OFF', () => {
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_DOMAIN_EVENTS).toBe('false');
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_DOMAIN_EVENT_AUDIT).toBe('false');
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_DOMAIN_EVENT_OBSERVABILITY).toBe('false');
  });

  it('host production bloqueia', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    expect(getDomainEventFlags({ overrides: FLAGS_ON }).DOMAIN_EVENTS).toBe(false);
  });

  it('resolveAppointmentUpdateEventType prioriza cancel > reschedule > confirm', () => {
    expect(resolveAppointmentUpdateEventType(
      { status: 'agendado', date: '2026-07-20', startTime: '10:00', endTime: '10:30' },
      { status: 'cancelado', date: '2026-07-20', startTime: '10:00', endTime: '10:30' },
      { status: 'cancelado' },
    )).toBe('APPOINTMENT_CANCELLED');

    expect(resolveAppointmentUpdateEventType(
      { status: 'agendado', date: '2026-07-20', startTime: '10:00', endTime: '10:30' },
      { status: 'agendado', date: '2026-07-21', startTime: '11:00', endTime: '11:30' },
      { date: '2026-07-21', startTime: '11:00', endTime: '11:30' },
    )).toBe('APPOINTMENT_RESCHEDULED');

    expect(resolveAppointmentUpdateEventType(
      { status: 'agendado', date: '2026-07-20', startTime: '10:00', endTime: '10:30' },
      { status: 'confirmado', date: '2026-07-20', startTime: '10:00', endTime: '10:30' },
      { status: 'confirmado' },
    )).toBe('APPOINTMENT_CONFIRMED');

    expect(resolveAppointmentUpdateEventType(
      { status: 'agendado', date: '2026-07-20', startTime: '10:00', endTime: '10:30' },
      { status: 'agendado', date: '2026-07-20', startTime: '10:00', endTime: '10:30' },
      { procedureName: 'Limpeza' },
    )).toBe('APPOINTMENT_UPDATED');
  });
});

describe('agendaDomainEvents — adoção Wave A', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedAgendaContext();
    __clearDomainEventBusForTest();
    __clearDomainEventAuditForTest();
    __clearDomainEventDedupForTest();
    __clearDomainEventAuditHooksForTest();
    clearObs();
    __setAgendaDomainEventFlagsForTest(null);
  });

  afterEach(() => {
    __setAgendaDomainEventFlagsForTest(null);
    clearObs();
  });

  it('flags OFF — create não publica', async () => {
    createAppointment(agendaUser, appointmentPayload());
    await flushMicrotasks();
    expect(getPublishedDomainEventsBuffer()).toHaveLength(0);
  });

  it('APPOINTMENT_CREATED em createAppointment', async () => {
    __setAgendaDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const created = createAppointment(agendaUser, appointmentPayload());
    await flushMicrotasks();
    const published = getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'APPOINTMENT_CREATED');
    expect(published).toHaveLength(1);
    expect(published[0].aggregateId).toBe(created.id);
    expect(published[0].payload.patientId).toBe('pat-agenda-001');
    expect(published[0].payload).not.toHaveProperty('notes');
    expect(JSON.stringify(published[0].payload)).not.toMatch(/anamnese|prontuario/i);
  });

  it('APPOINTMENT_CREATED em createAppointmentFromCrm', async () => {
    __setAgendaDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const created = createAppointmentFromCrm(agendaUser, {
      leadId: 'lead-agenda-001',
      professionalId: 'col-agenda-001',
      date: tomorrowIso(),
      startTime: '14:00',
      durationMinutes: 30,
    });
    await flushMicrotasks();
    const published = getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'APPOINTMENT_CREATED');
    expect(published).toHaveLength(1);
    expect(published[0].payload.leadId).toBe('lead-agenda-001');
    expect(created.id).toBeTruthy();
  });

  it('APPOINTMENT_CANCELLED via cancelAppointment', async () => {
    __setAgendaDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const created = createAppointment(agendaUser, appointmentPayload({ startTime: '09:00', endTime: '09:30' }));
    await flushMicrotasks();
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    cancelAppointment(agendaUser, created.id, 'paciente desistiu');
    await flushMicrotasks();
    const cancelled = getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'APPOINTMENT_CANCELLED');
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].payload.cancelReason).toBe('paciente desistiu');
  });

  it('APPOINTMENT_RESCHEDULED ao mudar data/hora', async () => {
    __setAgendaDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const created = createAppointment(agendaUser, appointmentPayload({ startTime: '08:00', endTime: '08:30' }));
    await flushMicrotasks();
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    updateAppointment(agendaUser, created.id, {
      date: tomorrowIso(),
      startTime: '16:00',
      endTime: '16:30',
    });
    await flushMicrotasks();
    const rescheduled = getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'APPOINTMENT_RESCHEDULED');
    expect(rescheduled).toHaveLength(1);
    expect(rescheduled[0].payload.previousStartTime).toBe('08:00');
    expect(rescheduled[0].payload.startTime).toBe('16:00');
  });

  it('APPOINTMENT_CONFIRMED ao confirmar', async () => {
    __setAgendaDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const created = createAppointment(agendaUser, appointmentPayload({ startTime: '07:00', endTime: '07:30' }));
    await flushMicrotasks();
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    updateAppointment(agendaUser, created.id, { status: 'confirmado' });
    await flushMicrotasks();
    const confirmed = getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'APPOINTMENT_CONFIRMED');
    expect(confirmed).toHaveLength(1);
  });

  it('APPOINTMENT_UPDATED em alteração de campos gerais', async () => {
    __setAgendaDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const created = createAppointment(agendaUser, appointmentPayload({ startTime: '06:00', endTime: '06:30' }));
    await flushMicrotasks();
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    updateAppointment(agendaUser, created.id, { procedureName: 'Avaliação' });
    await flushMicrotasks();
    const updated = getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'APPOINTMENT_UPDATED');
    expect(updated).toHaveLength(1);
    expect(updated[0].payload.changeSet.procedureName).toBe('Avaliação');
  });

  it('correlation gerada (não aggregateId permanente)', () => {
    const corr = resolveAgendaOperationCorrelation({});
    expect(corr.correlationId).toMatch(/^de-corr-/);
    expect(corr.correlationId).not.toBe('appt-fake');
  });

  it('causationId propagado', async () => {
    __setAgendaDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const created = createAppointment(agendaUser, appointmentPayload({ startTime: '05:00', endTime: '05:30' }));
    __clearDomainEventDedupForTest();
    __clearDomainEventBusForTest();
    await __publishAppointmentCreatedDomainEventForTest(agendaUser, {
      ...created,
      id: `${created.id}-alt`,
    }, { correlationId: 'agenda-corr', causationId: 'parent-appt' });
    const evt = getPublishedDomainEventsBuffer().find((e) => e.eventType === 'APPOINTMENT_CREATED');
    expect(evt?.correlationId).toBe('agenda-corr');
    expect(evt?.causationId).toBe('parent-appt');
  });

  it('falha da facade não quebra escrita agenda', async () => {
    __setAgendaDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const spy = vi.spyOn(
      await import('../domain-events/shared/domainEventFacade.ts'),
      'publishViaDomainEventFacade',
    ).mockRejectedValue(new Error('facade down'));
    const created = createAppointment(agendaUser, appointmentPayload({ startTime: '04:00', endTime: '04:30' }));
    expect(loadDb().appointments.some((a) => a.id === created.id)).toBe(true);
    await flushMicrotasks();
    spy.mockRestore();
  });

  it('workflow clínico (check-in) não publica Domain Event', async () => {
    __setAgendaDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const created = createAppointment(agendaUser, appointmentPayload({ startTime: '03:00', endTime: '03:30' }));
    await flushMicrotasks();
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    checkInAppointment(agendaUser, created.id);
    await flushMicrotasks();
    expect(getPublishedDomainEventsBuffer()).toHaveLength(0);
    expect(loadDb().appointments.find((a) => a.id === created.id)?.checkInAt).toBeTruthy();
  });

  it('adapter e patientFlow sem Domain Events; publisher só via Facade', () => {
    const adapterSrc = fs.readFileSync(
      path.join(__dirname, '../services/agendaWriteAdapter.js'),
      'utf8',
    );
    expect(adapterSrc).not.toMatch(/agendaAppointmentDomainEventPublisher|publishViaDomainEventFacade|publishDomainEventViaToolkit/);

    const publisherSrc = fs.readFileSync(
      path.join(__dirname, '../services/agendaAppointmentDomainEventPublisher.js'),
      'utf8',
    );
    expect(publisherSrc).toMatch(/publishViaDomainEventFacade/);
    expect(publisherSrc).not.toMatch(/publishDomainEventViaToolkit/);

    const flowSrc = fs.readFileSync(
      path.join(__dirname, '../services/patientFlowService.js'),
      'utf8',
    );
    expect(flowSrc).not.toMatch(/agendaAppointmentDomainEventPublisher|publishViaDomainEventFacade/);

    const serviceSrc = fs.readFileSync(
      path.join(__dirname, '../services/appointmentService.js'),
      'utf8',
    );
    expect(serviceSrc).toMatch(/scheduleAppointmentCreatedDomainEvent/);
    expect(serviceSrc).toMatch(/scheduleAppointmentMutationDomainEvent/);
    expect(serviceSrc).not.toMatch(/publishDomainEventViaToolkit/);
  });

  it('audit prepared/published via facade', async () => {
    __setAgendaDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const statuses = [];
    registerDomainEventAuditHook((r) => statuses.push(r.status));
    scheduleAppointmentCreatedDomainEvent(agendaUser, {
      id: 'appt-audit-1',
      tenant_id: TENANT,
      patientId: 'pat-agenda-001',
      status: 'agendado',
      date: tomorrowIso(),
      startTime: '12:00',
      endTime: '12:30',
    });
    await flushMicrotasks();
    expect(statuses).toContain('prepared');
    expect(statuses).toContain('published');
    expect(getDomainEventAuditLog().length).toBeGreaterThan(0);
  });

  it('nenhum consumer funcional criado nesta phase', () => {
    const sharedDir = fs.readdirSync(path.join(__dirname, '../domain-events/shared'));
    expect(sharedDir).not.toContain('domainEventConsumers.ts');
    const obsDir = fs.readdirSync(path.join(__dirname, '../domain-events/observability'));
    expect(obsDir.every((f) => !f.toLowerCase().includes('consumer'))).toBe(true);
  });
});
