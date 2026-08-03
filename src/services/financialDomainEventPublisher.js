/**
 * Publicação de Domain Events Financeiros Wave A — Phase 7.2.
 *
 * Ponto canônico: services financeiros após gravação IndexedDB bem-sucedida.
 * Não publica a partir do financialWriteAdapter (evita duplicidade dual/primary).
 * Flags OFF = no-op. Falha de publish nunca afeta a operação financeira.
 *
 * Correlation: preserva correlationId recebido; gera ID de operação (não aggregateId)
 * quando não houver contexto — Phase 7.1 follow-up.
 */
import {
  publishViaDomainEventFacade,
} from '../domain-events/shared/domainEventFacade.ts';
import { isDomainEventsEnabled } from '../domain-events/domainEventFlags.ts';
import { createDomainEventCorrelationId } from '../domain-events/shared/domainEventCorrelation.ts';

/** @type {import('../domain-events/domainEventFlags.ts').DomainEventFlagsInput | null} */
let flagsInputOverride = null;

export function __setFinancialDomainEventFlagsForTest(input) {
  flagsInputOverride = input;
}

function flagsInput() {
  return flagsInputOverride ?? {};
}

function logDev(event, payload) {
  if (!import.meta.env?.DEV) return;
  console.debug('[FINANCIAL_DOMAIN_EVENT]', event, payload);
}

/**
 * Correlation da operação lógica — NÃO usa aggregateId como correlation permanente.
 * @param {{ correlationId?: string, causationId?: string | null }} [meta]
 */
export function resolveFinancialOperationCorrelation(meta = {}) {
  const received = String(meta.correlationId || '').trim();
  return {
    correlationId: received || createDomainEventCorrelationId(),
    causationId: meta.causationId === undefined
      ? null
      : (meta.causationId == null ? null : String(meta.causationId).trim() || null),
  };
}

function safePayload(obj) {
  return obj && typeof obj === 'object' ? { ...obj } : {};
}

function buildChangeSet(partial = {}) {
  const skip = new Set(['updated_at', 'updatedAt', 'created_at', 'createdAt']);
  const changeSet = {};
  for (const key of Object.keys(partial || {})) {
    if (skip.has(key)) continue;
    // Sanitização: não propagar objetos sensíveis / payer_data completo
    if (key === 'payer_data' || key === 'card' || key === 'bank_account' || key === 'document') continue;
    const value = partial[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) continue;
    changeSet[key] = value;
  }
  return changeSet;
}

function scheduleFinancialDomainEvent(runner, context) {
  if (!isDomainEventsEnabled(flagsInput())) return;
  queueMicrotask(() => {
    void Promise.resolve()
      .then(runner)
      .then((result) => {
        logDev(context.eventType, {
          aggregateId: context.aggregateId,
          ok: result?.accepted === true,
          skipped: result?.skipped === true,
          reason: result?.reason,
        });
      })
      .catch((err) => {
        logDev(context.eventType, {
          aggregateId: context.aggregateId,
          ok: false,
          error: err instanceof Error ? err.message : String(err || 'publish failed'),
        });
      });
  });
}

function publishPrepared(input, context) {
  scheduleFinancialDomainEvent(
    async () => publishViaDomainEventFacade(input, {
      flagsInput: flagsInput(),
      enableDedup: true,
      requireRegisteredType: true,
    }),
    context,
  );
}

/* ─── Receivables ─────────────────────────────────────────────────────────── */

export function scheduleReceivableCreatedDomainEvent(user, record, meta = {}) {
  if (!record?.id) return;
  const tenantId = String(record.tenant_id || record.tenantId || '').trim();
  if (!tenantId) return;
  const { correlationId, causationId } = resolveFinancialOperationCorrelation(meta);
  const aggregateId = String(record.id);

  publishPrepared({
    eventType: 'RECEIVABLE_CREATED',
    eventId: `de-recv-created-${aggregateId}`,
    aggregateId,
    tenantId,
    userId: user?.id || null,
    correlationId,
    causationId,
    source: 'financial',
    metadata: { operation: 'createReceivable', aggregateId },
    payload: safePayload({
      receivableId: aggregateId,
      tenantId,
      patientId: record.patient_id || record.patientId || null,
      budgetId: record.budget_id || record.budgetId || null,
      contractId: record.contract_id || record.contractId || null,
      amount: record.net_amount ?? record.original_amount ?? null,
      dueDate: record.due_date || record.dueDate || null,
      status: record.status || null,
      createdAt: record.created_at || record.createdAt || null,
    }),
  }, { eventType: 'RECEIVABLE_CREATED', aggregateId });
}

export function scheduleReceivableUpdatedDomainEvent(user, record, partial = {}, meta = {}) {
  if (!record?.id) return;
  const tenantId = String(record.tenant_id || record.tenantId || '').trim();
  if (!tenantId) return;
  const { correlationId, causationId } = resolveFinancialOperationCorrelation(meta);
  const aggregateId = String(record.id);
  const updatedAt = record.updated_at || record.updatedAt || '';

  publishPrepared({
    eventType: 'RECEIVABLE_UPDATED',
    eventId: `de-recv-updated-${aggregateId}-${String(updatedAt).trim() || 'na'}`,
    aggregateId,
    tenantId,
    userId: user?.id || null,
    correlationId,
    causationId,
    source: 'financial',
    metadata: { operation: 'updateReceivable', aggregateId },
    payload: safePayload({
      receivableId: aggregateId,
      tenantId,
      changeSet: buildChangeSet(partial),
      updatedAt: updatedAt || null,
    }),
  }, { eventType: 'RECEIVABLE_UPDATED', aggregateId });
}

/* ─── Payables ────────────────────────────────────────────────────────────── */

export function schedulePayableCreatedDomainEvent(user, record, meta = {}) {
  if (!record?.id) return;
  const tenantId = String(record.tenant_id || record.tenantId || '').trim();
  if (!tenantId) return;
  const { correlationId, causationId } = resolveFinancialOperationCorrelation(meta);
  const aggregateId = String(record.id);

  publishPrepared({
    eventType: 'PAYABLE_CREATED',
    eventId: `de-pay-created-${aggregateId}`,
    aggregateId,
    tenantId,
    userId: user?.id || null,
    correlationId,
    causationId,
    source: 'financial',
    metadata: { operation: 'createPayable', aggregateId },
    payload: safePayload({
      payableId: aggregateId,
      tenantId,
      supplierId: record.supplierId || null,
      categoryId: record.categoryId || null,
      amount: record.amount ?? null,
      dueDate: record.dueDate || null,
      status: record.status || null,
      createdAt: record.created_at || record.createdAt || null,
    }),
  }, { eventType: 'PAYABLE_CREATED', aggregateId });
}

export function schedulePayableUpdatedDomainEvent(user, record, partial = {}, meta = {}) {
  if (!record?.id) return;
  const tenantId = String(record.tenant_id || record.tenantId || '').trim();
  if (!tenantId) return;
  const { correlationId, causationId } = resolveFinancialOperationCorrelation(meta);
  const aggregateId = String(record.id);
  const updatedAt = record.updated_at || record.updatedAt || '';

  publishPrepared({
    eventType: 'PAYABLE_UPDATED',
    eventId: `de-pay-updated-${aggregateId}-${String(updatedAt).trim() || 'na'}`,
    aggregateId,
    tenantId,
    userId: user?.id || null,
    correlationId,
    causationId,
    source: 'financial',
    metadata: { operation: 'updatePayable', aggregateId },
    payload: safePayload({
      payableId: aggregateId,
      tenantId,
      changeSet: buildChangeSet(partial),
      updatedAt: updatedAt || null,
    }),
  }, { eventType: 'PAYABLE_UPDATED', aggregateId });
}

export function schedulePayableDeletedDomainEvent(user, payableId, tenantIdHint, meta = {}) {
  const aggregateId = String(payableId || '').trim();
  const tenantId = String(tenantIdHint || '').trim();
  if (!aggregateId || !tenantId) return;
  const { correlationId, causationId } = resolveFinancialOperationCorrelation(meta);
  const deletedAt = meta.deletedAt || new Date().toISOString();

  publishPrepared({
    eventType: 'PAYABLE_DELETED',
    eventId: `de-pay-deleted-${aggregateId}-${deletedAt}`,
    aggregateId,
    tenantId,
    userId: user?.id || null,
    correlationId,
    causationId,
    source: 'financial',
    metadata: { operation: 'deletePayable', aggregateId },
    payload: safePayload({
      payableId: aggregateId,
      tenantId,
      deletedAt,
      reason: meta.reason || null,
    }),
  }, { eventType: 'PAYABLE_DELETED', aggregateId });
}

/* ─── Financing ───────────────────────────────────────────────────────────── */

export function scheduleFinancingCreatedDomainEvent(user, record, meta = {}) {
  if (!record?.id) return;
  const tenantId = String(
    record.tenant_id
    || record.tenantId
    || user?.tenantId
    || user?.tenant_id
    || meta.tenantId
    || '',
  ).trim();
  if (!tenantId) return;
  const { correlationId, causationId } = resolveFinancialOperationCorrelation(meta);
  const aggregateId = String(record.id);

  publishPrepared({
    eventType: 'FINANCING_CREATED',
    eventId: `de-fin-created-${aggregateId}`,
    aggregateId,
    tenantId,
    userId: user?.id || record.created_by || null,
    correlationId,
    causationId,
    source: 'financial',
    metadata: { operation: 'createFinancingProposal', aggregateId },
    payload: safePayload({
      financingId: aggregateId,
      tenantId,
      patientId: record.patient_id || null,
      budgetId: record.budget_id || record.treatment_plan_id || null,
      amount: record.total_amount ?? record.total_payable_amount ?? null,
      installmentCount: record.installments_count ?? null,
      status: record.status || null,
      createdAt: record.created_at || null,
    }),
  }, { eventType: 'FINANCING_CREATED', aggregateId });
}

export function scheduleFinancingUpdatedDomainEvent(user, record, partial = {}, meta = {}) {
  if (!record?.id) return;
  const tenantId = String(
    record.tenant_id
    || record.tenantId
    || user?.tenantId
    || user?.tenant_id
    || meta.tenantId
    || '',
  ).trim();
  if (!tenantId) return;
  const { correlationId, causationId } = resolveFinancialOperationCorrelation(meta);
  const aggregateId = String(record.id);
  const updatedAt = record.updated_at || '';

  publishPrepared({
    eventType: 'FINANCING_UPDATED',
    eventId: `de-fin-updated-${aggregateId}-${String(updatedAt).trim() || 'na'}`,
    aggregateId,
    tenantId,
    userId: user?.id || null,
    correlationId,
    causationId,
    source: 'financial',
    metadata: { operation: 'updateFinancingTerms', aggregateId },
    payload: safePayload({
      financingId: aggregateId,
      tenantId,
      patientId: record.patient_id || null,
      budgetId: record.budget_id || record.treatment_plan_id || null,
      amount: record.total_amount ?? record.total_payable_amount ?? null,
      installmentCount: record.installments_count ?? null,
      status: record.status || null,
      updatedAt: updatedAt || null,
      changeSet: buildChangeSet(partial),
    }),
  }, { eventType: 'FINANCING_UPDATED', aggregateId });
}

/* ─── Payments (PAYMENT_RECEIVED — registry oficial) ──────────────────────── */

/**
 * Após registerReceivablePayment (ponto canônico único).
 * registerFinancingPayment reutiliza esse fluxo — não publicar de novo lá.
 */
export function schedulePaymentReceivedDomainEvent(user, payment, receivable, meta = {}) {
  if (!payment?.id) return;
  const tenantId = String(
    payment.tenant_id || receivable?.tenant_id || receivable?.tenantId || '',
  ).trim();
  if (!tenantId) return;
  const { correlationId, causationId } = resolveFinancialOperationCorrelation(meta);
  const aggregateId = String(payment.id);

  publishPrepared({
    eventType: 'PAYMENT_RECEIVED',
    eventId: `de-payment-received-${aggregateId}`,
    aggregateId,
    tenantId,
    userId: user?.id || payment.created_by || null,
    correlationId,
    causationId,
    source: 'financial',
    metadata: { operation: 'registerReceivablePayment', aggregateId },
    payload: safePayload({
      paymentId: aggregateId,
      tenantId,
      originType: 'receivable',
      originId: payment.receivable_id || receivable?.id || null,
      amount: payment.amount_received ?? null,
      paymentMethod: payment.payment_method || null,
      paidAt: payment.payment_date || payment.created_at || null,
      status: 'received',
    }),
  }, { eventType: 'PAYMENT_RECEIVED', aggregateId });
}

/* ─── Test helpers ────────────────────────────────────────────────────────── */

export async function __publishReceivableCreatedDomainEventForTest(user, record, meta = {}) {
  if (!isDomainEventsEnabled(flagsInput())) {
    return { accepted: false, skipped: true, reason: 'DOMAIN_EVENTS=false', eventId: null };
  }
  const tenantId = String(record.tenant_id || '').trim();
  const { correlationId, causationId } = resolveFinancialOperationCorrelation(meta);
  return publishViaDomainEventFacade({
    eventType: 'RECEIVABLE_CREATED',
    eventId: `de-recv-created-${record.id}`,
    aggregateId: String(record.id),
    tenantId,
    userId: user?.id || null,
    correlationId,
    causationId,
    source: 'financial',
    payload: {
      receivableId: record.id,
      tenantId,
      patientId: record.patient_id || null,
      amount: record.net_amount ?? null,
      dueDate: record.due_date || null,
      status: record.status || null,
      createdAt: record.created_at || null,
    },
  }, { flagsInput: flagsInput(), enableDedup: true, requireRegisteredType: true });
}

export async function __publishPaymentReceivedDomainEventForTest(user, payment, receivable, meta = {}) {
  if (!isDomainEventsEnabled(flagsInput())) {
    return { accepted: false, skipped: true, reason: 'DOMAIN_EVENTS=false', eventId: null };
  }
  const tenantId = String(payment.tenant_id || receivable?.tenant_id || '').trim();
  const { correlationId, causationId } = resolveFinancialOperationCorrelation(meta);
  return publishViaDomainEventFacade({
    eventType: 'PAYMENT_RECEIVED',
    eventId: `de-payment-received-${payment.id}`,
    aggregateId: String(payment.id),
    tenantId,
    userId: user?.id || null,
    correlationId,
    causationId,
    source: 'financial',
    payload: {
      paymentId: payment.id,
      tenantId,
      originType: 'receivable',
      originId: payment.receivable_id || null,
      amount: payment.amount_received ?? null,
      paymentMethod: payment.payment_method || null,
      paidAt: payment.payment_date || null,
      status: 'received',
    },
  }, { flagsInput: flagsInput(), enableDedup: true, requireRegisteredType: true });
}
