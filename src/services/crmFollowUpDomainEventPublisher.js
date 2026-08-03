/**
 * Domain Events CRM Wave B — Follow-ups — Phase 7.5.
 * Cobre crmFollowUps (legado) e followUps (estratégico) sem consolidar stores.
 * Publica exclusivamente via DomainEventFacade.
 */
import {
  publishViaDomainEventFacade,
} from '../domain-events/shared/domainEventFacade.ts';
import { isDomainEventsEnabled } from '../domain-events/domainEventFlags.ts';
import { resolveCrmWaveBOperationCorrelation } from './crmActivityDomainEventPublisher.js';

/** @type {import('../domain-events/domainEventFlags.ts').DomainEventFlagsInput | null} */
let flagsInputOverride = null;

export function __setCrmFollowUpDomainEventFlagsForTest(input) {
  flagsInputOverride = input;
}

function flagsInput() {
  return flagsInputOverride ?? {};
}

function logDev(event, payload) {
  if (!import.meta.env?.DEV) return;
  console.debug('[CRM_FOLLOWUP_DOMAIN_EVENT]', event, payload);
}

function schedule(runner, context) {
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
  schedule(
    async () => publishViaDomainEventFacade(input, {
      flagsInput: flagsInput(),
      enableDedup: true,
      requireRegisteredType: true,
    }),
    context,
  );
}

function basePayload(followUp, sourceStore) {
  return {
    followUpId: followUp.id,
    leadId: followUp.leadId || null,
    tenantId: followUp.tenant_id || followUp.tenantId || null,
    ownerId: followUp.assignedTo || followUp.createdByUserId || null,
    status: followUp.status || (followUp.doneAt ? 'completed' : 'pending'),
    scheduledAt: followUp.dueAt || followUp.dueDate || null,
    completedAt: followUp.completedAt || followUp.doneAt || null,
    sourceStore,
    occurredAt: new Date().toISOString(),
  };
}

/**
 * Precedência: complete > cancel > reschedule > update
 */
export function resolveFollowUpMutationEventType(previous, updated, payload = {}, sourceStore) {
  const prevDone = Boolean(previous?.doneAt || previous?.completedAt || previous?.status === 'completed');
  const nextDone = Boolean(updated?.doneAt || updated?.completedAt || updated?.status === 'completed');
  const nextStatus = String(updated?.status || payload.status || '').toLowerCase();
  const prevStatus = String(previous?.status || '').toLowerCase();

  if (!prevDone && nextDone) return 'FOLLOW_UP_COMPLETED';
  if (
    nextStatus === 'cancelled'
    || nextStatus === 'canceled'
    || nextStatus === 'cancelado'
  ) {
    if (prevStatus !== nextStatus) return 'FOLLOW_UP_CANCELLED';
  }

  const prevDue = String(previous?.dueAt || previous?.dueDate || '');
  const nextDue = String(updated?.dueAt || updated?.dueDate || '');
  const dueChanged =
    (payload.dueAt != null || payload.dueDate != null) ||
    (prevDue && nextDue && prevDue !== nextDue);

  if (dueChanged && !nextDone) return 'FOLLOW_UP_RESCHEDULED';
  return 'FOLLOW_UP_UPDATED';
}

export function scheduleFollowUpCreatedDomainEvent(user, followUp, sourceStore, meta = {}) {
  if (!followUp?.id) return;
  const tenantId = String(followUp.tenant_id || followUp.tenantId || '').trim();
  if (!tenantId) return;
  const followUpId = String(followUp.id);
  const { correlationId, causationId } = resolveCrmWaveBOperationCorrelation(meta);

  publishPrepared({
    eventType: 'FOLLOW_UP_CREATED',
    eventId: `de-fup-created-${sourceStore}-${followUpId}`,
    aggregateId: followUpId,
    tenantId,
    userId: user?.id || null,
    correlationId,
    causationId,
    source: 'crm',
    payload: basePayload(followUp, sourceStore),
  }, { eventType: 'FOLLOW_UP_CREATED', aggregateId: followUpId });
}

export function scheduleFollowUpMutationDomainEvent(
  user,
  updated,
  previous,
  payload = {},
  sourceStore,
  meta = {},
) {
  if (!updated?.id) return;
  const tenantId = String(updated.tenant_id || updated.tenantId || '').trim();
  if (!tenantId) return;
  const followUpId = String(updated.id);
  const eventType = resolveFollowUpMutationEventType(previous, updated, payload, sourceStore);
  const { correlationId, causationId } = resolveCrmWaveBOperationCorrelation(meta);
  const stamp = String(updated.updatedAt || updated.completedAt || updated.doneAt || Date.now());

  publishPrepared({
    eventType,
    eventId: `de-fup-${eventType.toLowerCase().replace(/_/g, '-')}-${sourceStore}-${followUpId}-${stamp}`,
    aggregateId: followUpId,
    tenantId,
    userId: user?.id || null,
    correlationId,
    causationId,
    source: 'crm',
    payload: {
      ...basePayload(updated, sourceStore),
      previousScheduledAt: previous?.dueAt || previous?.dueDate || null,
      reason: payload.reason || updated.reason || null,
    },
  }, { eventType, aggregateId: followUpId });
}

export function scheduleFollowUpCompletedDomainEvent(user, followUp, sourceStore, meta = {}) {
  scheduleFollowUpMutationDomainEvent(
    user,
    followUp,
    { ...followUp, doneAt: null, completedAt: null, status: 'pending' },
    { status: 'completed' },
    sourceStore,
    meta,
  );
}
