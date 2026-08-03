/**
 * Phase 7.2 — Financial Domain Event Adoption (Wave A).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import { createReceivable, updateReceivable, registerReceivablePayment } from '../services/receivablesService.js';
import { createPayable, updatePayable, deletePayable } from '../services/payablesService.js';
import { createFinancingProposal, updateFinancingTerms } from '../services/financingsService.js';
import {
  __setFinancialDomainEventFlagsForTest,
  __publishReceivableCreatedDomainEventForTest,
  __publishPaymentReceivedDomainEventForTest,
  resolveFinancialOperationCorrelation,
  scheduleReceivableCreatedDomainEvent,
} from '../services/financialDomainEventPublisher.js';
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

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const FLAGS_ON = DOMAIN_EVENTS_FLAGS_RESOLVED;

const financeUser = {
  id: 'user-fin-de',
  role: 'admin',
  tenantId: TENANT,
  permissions: {
    'finance:write': true,
    'financeiro_financiamentos:create': true,
    'financeiro_financiamentos:edit': true,
  },
};

function seedFinanceContext() {
  withDb((db) => {
    db.clinicProfile = { id: 'clinic-1', tenant_id: TENANT };
    db.patients = [{ id: 'pat-fin-001', tenant_id: TENANT, full_name: 'Paciente Fin' }];
    db.accountsReceivable = [];
    db.receivablePayments = [];
    db.payables = [];
    db.financings = [];
    return db;
  });
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

describe('financialDomainEvents — registry e guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    __setFinancialDomainEventFlagsForTest(null);
  });

  it('eventos financeiros oficiais no registry', () => {
    expect(isRegisteredDomainEventType('RECEIVABLE_CREATED')).toBe(true);
    expect(isRegisteredDomainEventType('RECEIVABLE_UPDATED')).toBe(true);
    expect(isRegisteredDomainEventType('PAYABLE_CREATED')).toBe(true);
    expect(isRegisteredDomainEventType('PAYABLE_UPDATED')).toBe(true);
    expect(isRegisteredDomainEventType('PAYABLE_DELETED')).toBe(true);
    expect(isRegisteredDomainEventType('FINANCING_CREATED')).toBe(true);
    expect(isRegisteredDomainEventType('FINANCING_UPDATED')).toBe(true);
    expect(isRegisteredDomainEventType('PAYMENT_RECEIVED')).toBe(true);
    expect(isRegisteredDomainEventType('PAYMENT_REGISTERED')).toBe(false);
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

describe('financialDomainEvents — adoção Wave A', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedFinanceContext();
    __clearDomainEventBusForTest();
    __clearDomainEventAuditForTest();
    __clearDomainEventAuditHooksForTest();
    __clearDomainEventDedupForTest();
    __setFinancialDomainEventFlagsForTest(null);
  });

  afterEach(() => {
    __setFinancialDomainEventFlagsForTest(null);
    __clearDomainEventBusForTest();
    __clearDomainEventAuditForTest();
    __clearDomainEventAuditHooksForTest();
    __clearDomainEventDedupForTest();
    vi.restoreAllMocks();
  });

  it('flags OFF — createReceivable 100% legado sem publicar', async () => {
    const handler = vi.fn();
    subscribeAllDomainEvents(handler);
    const record = createReceivable(financeUser, {
      description: 'Legado',
      patient_id: 'pat-fin-001',
      original_amount: 100,
      due_date: '2026-08-01',
    });
    expect(loadDb().accountsReceivable.some((r) => r.id === record.id)).toBe(true);
    await flushMicrotasks();
    expect(handler).not.toHaveBeenCalled();
    expect(getPublishedDomainEventsBuffer()).toHaveLength(0);
  });

  it('RECEIVABLE_CREATED após createReceivable', async () => {
    __setFinancialDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const record = createReceivable(financeUser, {
      description: 'Criado DE',
      patient_id: 'pat-fin-001',
      original_amount: 250,
      due_date: '2026-08-02',
      budget_id: 'bud-1',
    });
    await flushMicrotasks();
    const published = getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'RECEIVABLE_CREATED');
    expect(published).toHaveLength(1);
    expect(published[0].payload.receivableId).toBe(record.id);
    expect(published[0].payload.patientId).toBe('pat-fin-001');
    expect(published[0].correlationId).not.toBe(record.id);
    expect(published[0].correlationId).toMatch(/^de-corr-/);
  });

  it('RECEIVABLE_UPDATED após updateReceivable', async () => {
    __setFinancialDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const record = createReceivable(financeUser, {
      description: 'Antes',
      patient_id: 'pat-fin-001',
      original_amount: 100,
      due_date: '2026-08-03',
    });
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    updateReceivable(financeUser, record.id, { description: 'Depois', notes: 'ok' });
    await flushMicrotasks();
    const published = getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'RECEIVABLE_UPDATED');
    expect(published).toHaveLength(1);
    expect(published[0].payload.changeSet.description).toBe('Depois');
  });

  it('PAYABLE_CREATED / UPDATED / DELETED', async () => {
    __setFinancialDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const payable = createPayable(financeUser, {
      description: 'Aluguel',
      amount: 500,
      dueDate: '2026-08-10',
      paymentMethod: 'pix',
    });
    await flushMicrotasks();
    expect(getPublishedDomainEventsBuffer().some((e) => e.eventType === 'PAYABLE_CREATED')).toBe(true);

    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    updatePayable(financeUser, payable.id, { description: 'Aluguel atualizado', amount: 550, dueDate: '2026-08-10', paymentMethod: 'pix' });
    await flushMicrotasks();
    expect(getPublishedDomainEventsBuffer().some((e) => e.eventType === 'PAYABLE_UPDATED')).toBe(true);

    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    deletePayable(financeUser, payable.id);
    await flushMicrotasks();
    const deleted = getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'PAYABLE_DELETED');
    expect(deleted).toHaveLength(1);
    expect(deleted[0].payload.payableId).toBe(payable.id);
  });

  it('FINANCING_CREATED / FINANCING_UPDATED', async () => {
    __setFinancialDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const fin = createFinancingProposal(financeUser, {
      patient_id: 'pat-fin-001',
      description: 'Financiamento DE',
      total_amount: 1000,
      entry_amount: 100,
      installments_count: 3,
    });
    await flushMicrotasks();
    expect(getPublishedDomainEventsBuffer().some((e) => e.eventType === 'FINANCING_CREATED')).toBe(true);

    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    updateFinancingTerms(financeUser, fin.id, { entry_amount: 150 });
    await flushMicrotasks();
    expect(getPublishedDomainEventsBuffer().some((e) => e.eventType === 'FINANCING_UPDATED')).toBe(true);
  });

  it('PAYMENT_RECEIVED após registerReceivablePayment', async () => {
    __setFinancialDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const record = createReceivable(financeUser, {
      description: 'Pagável',
      patient_id: 'pat-fin-001',
      original_amount: 200,
      due_date: '2026-08-15',
    });
    __clearDomainEventBusForTest();
    __clearDomainEventDedupForTest();
    const result = registerReceivablePayment(financeUser, record.id, {
      amount_received: 50,
      payment_method: 'pix',
    });
    expect(result.payment.id).toBeTruthy();
    await flushMicrotasks();
    const published = getPublishedDomainEventsBuffer().filter((e) => e.eventType === 'PAYMENT_RECEIVED');
    expect(published).toHaveLength(1);
    expect(published[0].payload.paymentId).toBe(result.payment.id);
    expect(published[0].payload.originType).toBe('receivable');
    expect(JSON.stringify(published[0].payload)).not.toMatch(/card|cvv|bank_account/i);
  });

  it('falha do publisher não quebra operação financeira', async () => {
    __setFinancialDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const spy = vi.spyOn(
      await import('../domain-events/shared/domainEventFacade.ts'),
      'publishViaDomainEventFacade',
    ).mockRejectedValue(new Error('publisher down'));
    const record = createReceivable(financeUser, {
      description: 'Resiliente',
      patient_id: 'pat-fin-001',
      original_amount: 80,
      due_date: '2026-08-20',
    });
    expect(loadDb().accountsReceivable.some((r) => r.id === record.id)).toBe(true);
    await flushMicrotasks();
    spy.mockRestore();
  });

  it('correlationId preservado quando recebido; gerado quando ausente', () => {
    const withCtx = resolveFinancialOperationCorrelation({ correlationId: 'op-corr-1' });
    expect(withCtx.correlationId).toBe('op-corr-1');
    const generated = resolveFinancialOperationCorrelation({});
    expect(generated.correlationId).toMatch(/^de-corr-/);
    expect(generated.correlationId).not.toBe('recv-fake');
  });

  it('causationId propagado', async () => {
    __setFinancialDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const record = createReceivable(financeUser, {
      description: 'Causation',
      patient_id: 'pat-fin-001',
      original_amount: 90,
      due_date: '2026-08-21',
    });
    __clearDomainEventDedupForTest();
    __clearDomainEventBusForTest();
    await __publishReceivableCreatedDomainEventForTest(financeUser, {
      ...record,
      id: `${record.id}-alt`,
    }, { correlationId: 'shared-corr', causationId: 'parent-evt' });
    const evt = getPublishedDomainEventsBuffer().find((e) => e.eventType === 'RECEIVABLE_CREATED');
    expect(evt?.correlationId).toBe('shared-corr');
    expect(evt?.causationId).toBe('parent-evt');
  });

  it('deduplicação da mesma operação', async () => {
    __setFinancialDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const record = createReceivable(financeUser, {
      description: 'Dedup',
      patient_id: 'pat-fin-001',
      original_amount: 70,
      due_date: '2026-08-22',
    });
    const first = await __publishReceivableCreatedDomainEventForTest(financeUser, record);
    const second = await __publishReceivableCreatedDomainEventForTest(financeUser, record);
    expect(first.accepted).toBe(true);
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('deduplicated');
  });

  it('ausência de duplicidade dual/primary — adapter sem Domain Events', () => {
    const adapterSrc = fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../services/financialWriteAdapter.js'),
      'utf8',
    );
    expect(adapterSrc).not.toMatch(/financialDomainEventPublisher|publishDomainEventViaToolkit|publishViaDomainEventFacade/);
    const publisherSrc = fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../services/financialDomainEventPublisher.js'),
      'utf8',
    );
    expect(publisherSrc).toMatch(/publishViaDomainEventFacade/);
    expect(publisherSrc).not.toMatch(/publishDomainEventViaToolkit/);
  });

  it('audit states prepared/published', async () => {
    __setFinancialDomainEventFlagsForTest({ overrides: FLAGS_ON });
    const statuses = [];
    registerDomainEventAuditHook((r) => statuses.push(r.status));
    await __publishPaymentReceivedDomainEventForTest(financeUser, {
      id: 'rvpay-audit-1',
      tenant_id: TENANT,
      receivable_id: 'recv-1',
      amount_received: 10,
      payment_method: 'pix',
      payment_date: '2026-07-10',
    }, { id: 'recv-1', tenant_id: TENANT });
    expect(statuses).toContain('prepared');
    expect(statuses).toContain('published');
    expect(getDomainEventAuditLog().length).toBeGreaterThan(0);
  });

  it('ausência de consumers funcionais', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    for (const file of ['receivablesService.js', 'payablesService.js', 'financingsService.js']) {
      const src = fs.readFileSync(path.join(root, 'services', file), 'utf8');
      expect(src).not.toMatch(/registerDomainEventSubscriber|DomainEventSubscriberBase/);
    }
  });

  it('schedule no-op com flags OFF', async () => {
    __setFinancialDomainEventFlagsForTest(null);
    scheduleReceivableCreatedDomainEvent(financeUser, {
      id: 'recv-noop',
      tenant_id: TENANT,
      patient_id: 'pat-fin-001',
      net_amount: 1,
      due_date: '2026-08-01',
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    await flushMicrotasks();
    expect(getPublishedDomainEventsBuffer()).toHaveLength(0);
  });
});
