/**
 * Phase 7.1 — CRM Domain Event Adoption (Wave A — Leads).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import { createLead, updateLead, moveLeadToStage } from '../services/crmService.js';
import {
  __setCrmLeadDomainEventFlagsForTest,
  __publishLeadCreatedDomainEventForTest,
  __publishLeadUpdatedDomainEventForTest,
  __publishLeadMovedDomainEventForTest,
  resolveLeadWriteCorrelationId,
  resolveLeadOperationCorrelation,
  scheduleLeadCreatedDomainEvent,
} from '../services/crmLeadDomainEventPublisher.js';
import {
  __clearDomainEventBusForTest,
  getPublishedDomainEventsBuffer,
  subscribeAllDomainEvents,
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
  DOMAIN_EVENTS_FLAGS_RESOLVED,
  DOMAIN_EVENT_TEST_FLAG_CONTRACT,
} from './rhTestFlagContract.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const FLAGS_ON = DOMAIN_EVENTS_FLAGS_RESOLVED;

const crmUser = {
  id: 'user-lead-de',
  role: 'admin',
  tenantId: TENANT,
};

function seedLeadContext() {
  withDb((db) => {
    db.clinicProfile = { id: 'clinic-1', tenant_id: TENANT };
    db.crmLeads = [];
    db.crmLeadEvents = [];
    db.crmPipelineStages = [{
      id: 'crm-stage-1',
      tenant_id: TENANT,
      key: 'novo_lead',
      label: 'Novo Lead',
      order: 1,
      color: '#60a5fa',
      isActive: true,
      stageType: 'normal',
    }, {
      id: 'crm-stage-2',
      tenant_id: TENANT,
      key: 'aprovado',
      label: 'Aprovado',
      order: 2,
      color: '#10b981',
      isActive: true,
      stageType: 'conversion',
    }, {
      id: 'crm-stage-3',
      tenant_id: TENANT,
      key: 'perdido',
      label: 'Perdido',
      order: 3,
      color: '#ef4444',
      isActive: true,
      stageType: 'lost',
    }];
    return db;
  });
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

describe('crmLeadDomainEvents — registry e guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    __setCrmLeadDomainEventFlagsForTest(null);
  });

  it('usa nomes oficiais do registry (LEAD_MOVED, não LEAD_STAGE_CHANGED)', () => {
    expect(isRegisteredDomainEventType('LEAD_CREATED')).toBe(true);
    expect(isRegisteredDomainEventType('LEAD_UPDATED')).toBe(true);
    expect(isRegisteredDomainEventType('LEAD_MOVED')).toBe(true);
    expect(isRegisteredDomainEventType('LEAD_STAGE_CHANGED')).toBe(false);
  });

  it('contrato vitest mantém DOMAIN_EVENTS OFF', () => {
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_DOMAIN_EVENTS).toBe('false');
  });

  it('PROD trava DOMAIN_EVENTS', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      expect(getDomainEventFlags({ overrides: FLAGS_ON }).DOMAIN_EVENTS).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd === true ? true : false;
    }
  });

  it('host production bloqueia', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    expect(getDomainEventFlags({ overrides: FLAGS_ON }).DOMAIN_EVENTS).toBe(false);
  });
});

describe('crmLeadDomainEvents — adoção Wave A', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedLeadContext();
    __clearDomainEventBusForTest();
    __clearDomainEventAuditForTest();
    __clearDomainEventAuditHooksForTest();
    __clearDomainEventDedupForTest();
    __setCrmLeadDomainEventFlagsForTest(null);
  });

  afterEach(() => {
    __setCrmLeadDomainEventFlagsForTest(null);
    __clearDomainEventBusForTest();
    __clearDomainEventAuditForTest();
    __clearDomainEventAuditHooksForTest();
    __clearDomainEventDedupForTest();
    vi.restoreAllMocks();
  });

  it('flags OFF — createLead 100% legado sem publicar', async () => {
    const handler = vi.fn();
    subscribeAllDomainEvents(handler);
    const lead = createLead(crmUser, { name: 'Legado', phone: '11911112222' });
    expect(lead.id).toBeTruthy();
    expect(loadDb().crmLeads.some((l) => l.id === lead.id)).toBe(true);
    await flushMicrotasks();
    expect(handler).not.toHaveBeenCalled();
    expect(getPublishedDomainEventsBuffer()).toHaveLength(0);
  });

  it('LEAD_CREATED após createLead', async () => {
    __setCrmLeadDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const lead = createLead(crmUser, { name: 'Criado DE', phone: '11922223333' });
    await flushMicrotasks();
    const published = getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'LEAD_CREATED');
    expect(published).toHaveLength(1);
    expect(published[0].aggregateId).toBe(lead.id);
    expect(published[0].payload.leadId).toBe(lead.id);
    expect(published[0].payload.stageKey).toBe('novo_lead');
    expect(published[0].correlationId).toMatch(/^de-corr-/);
    expect(published[0].correlationId).not.toBe(lead.id);
  });

  it('LEAD_UPDATED após updateLead', async () => {
    __setCrmLeadDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const lead = createLead(crmUser, { name: 'Antes', phone: '11933334444' });
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    const updated = updateLead(crmUser, lead.id, { name: 'Depois' });
    expect(updated.name).toBe('Depois');
    await flushMicrotasks();
    const published = getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'LEAD_UPDATED');
    expect(published).toHaveLength(1);
    expect(published[0].payload.changeSet.name).toBe('Depois');
  });

  it('LEAD_MOVED após moveLeadToStage', async () => {
    __setCrmLeadDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const lead = createLead(crmUser, { name: 'Mover', phone: '11944445555' });
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    const moved = moveLeadToStage(crmUser, lead.id, 'aprovado');
    expect(moved.stageKey).toBe('aprovado');
    await flushMicrotasks();
    const published = getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'LEAD_MOVED');
    expect(published).toHaveLength(1);
    expect(published[0].payload.fromStageKey).toBe('novo_lead');
    expect(published[0].payload.toStageKey).toBe('aprovado');
  });

  it('falha de publicação não quebra escrita', async () => {
    __setCrmLeadDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const spy = vi.spyOn(
      await import('../domain-events/shared/domainEventFacade.ts'),
      'publishViaDomainEventFacade',
    ).mockRejectedValue(new Error('publisher down'));
    const lead = createLead(crmUser, { name: 'Resiliente', phone: '11955556666' });
    expect(loadDb().crmLeads.some((l) => l.id === lead.id)).toBe(true);
    await flushMicrotasks();
    expect(lead.name).toBe('Resiliente');
    spy.mockRestore();
  });

  it('correlationId é operação (de-corr-*), não lead.id', () => {
    const leadId = 'crmlead-corr-test';
    const generated = resolveLeadWriteCorrelationId(leadId);
    expect(generated).toMatch(/^de-corr-/);
    expect(generated).not.toBe(leadId);
    expect(resolveLeadWriteCorrelationId(leadId, 'explicit-corr')).toBe('explicit-corr');
  });

  it('causationId propagado quando informado', async () => {
    __setCrmLeadDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const lead = createLead(crmUser, { name: 'Causation', phone: '11966667777' });
    const result = await __publishLeadCreatedDomainEventForTest(crmUser, lead, {
      causationId: 'parent-event-1',
      correlationId: lead.id,
    });
    // segunda chamada dedup — limpar e republicar com causation
    __clearDomainEventDedupForTest();
    __clearDomainEventBusForTest();
    const result2 = await __publishLeadUpdatedDomainEventForTest(
      crmUser,
      { ...lead, updatedAt: '2026-07-10T20:00:00.000Z' },
      { notes: 'x' },
      { causationId: 'parent-event-1', correlationId: lead.id },
    );
    expect(result2.accepted || result.accepted).toBeTruthy();
    const updated = getPublishedDomainEventsBuffer().find((e) => e.eventType === 'LEAD_UPDATED');
    expect(updated?.causationId).toBe('parent-event-1');
    expect(updated?.correlationId).toBe(lead.id);
  });

  it('deduplicação na mesma operação lógica', async () => {
    __setCrmLeadDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const lead = createLead(crmUser, { name: 'Dedup', phone: '11977778888' });
    const first = await __publishLeadCreatedDomainEventForTest(crmUser, lead);
    const second = await __publishLeadCreatedDomainEventForTest(crmUser, lead);
    expect(first.accepted).toBe(true);
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('deduplicated');
  });

  it('nenhum evento duplicado entre dual e primary — só ponto canônico no service', async () => {
    __setCrmLeadDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const lead = createLead(crmUser, { name: 'Single', phone: '11988889999' });
    await flushMicrotasks();
    const created = getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'LEAD_CREATED');
    expect(created).toHaveLength(1);
    // crmWriteAdapter não importa publisher de domain events
    const adapterSrc = fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../services/crmWriteAdapter.js'),
      'utf8',
    );
    expect(adapterSrc).not.toMatch(/crmLeadDomainEventPublisher|publishDomainEventViaToolkit|publishViaDomainEventFacade/);
    const publisherSrc = fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../services/crmLeadDomainEventPublisher.js'),
      'utf8',
    );
    expect(publisherSrc).toMatch(/publishViaDomainEventFacade/);
    expect(publisherSrc).not.toMatch(/publishDomainEventViaToolkit/);
  });

  it('audit states prepared/published com DOMAIN_EVENT_AUDIT', async () => {
    __setCrmLeadDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const statuses = [];
    registerDomainEventAuditHook((r) => statuses.push(r.status));
    const lead = createLead(crmUser, { name: 'Audit', phone: '11900001111' });
    await __publishLeadMovedDomainEventForTest(crmUser, {
      ...lead,
      updatedAt: '2026-07-10T21:00:00.000Z',
    }, 'novo_lead', 'aprovado');
    expect(statuses).toContain('prepared');
    expect(statuses).toContain('published');
    expect(getDomainEventAuditLog().length).toBeGreaterThan(0);
  });

  it('ausência de consumers funcionais no CRM', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const crmService = fs.readFileSync(path.join(root, 'services/crmService.js'), 'utf8');
    expect(crmService).not.toMatch(/registerDomainEventSubscriber|DomainEventSubscriberBase/);
    expect(crmService).toMatch(/scheduleLeadCreatedDomainEvent/);
  });

  it('scheduleLeadCreatedDomainEvent no-op com flags OFF', async () => {
    __setCrmLeadDomainEventFlagsForTest(null);
    const lead = createLead(crmUser, { name: 'Noop', phone: '11811112222' });
    scheduleLeadCreatedDomainEvent(crmUser, lead);
    await flushMicrotasks();
    expect(getPublishedDomainEventsBuffer()).toHaveLength(0);
  });
});
