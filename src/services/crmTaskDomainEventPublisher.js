/**
 * Domain Events CRM Wave B — Tasks — Phase 7.5.
 * Publica exclusivamente via DomainEventFacade.
 * Não republica timeline (addLeadEvent permanece side-effect legado).
 */
import {
  publishViaDomainEventFacade,
} from '../domain-events/shared/domainEventFacade.ts';
import { isDomainEventsEnabled } from '../domain-events/domainEventFlags.ts';
import { resolveCrmWaveBOperationCorrelation } from './crmActivityDomainEventPublisher.js';

/** @type {import('../domain-events/domainEventFlags.ts').DomainEventFlagsInput | null} */
let flagsInputOverride = null;

export function __setCrmTaskDomainEventFlagsForTest(input) {
  flagsInputOverride = input;
}

function flagsInput() {
  return flagsInputOverride ?? {};
}

function logDev(event, payload) {
  if (!import.meta.env?.DEV) return;
  console.debug('[CRM_TASK_DOMAIN_EVENT]', event, payload);
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

function basePayload(task) {
  return {
    taskId: task.id,
    leadId: task.leadId || null,
    tenantId: task.tenant_id || task.tenantId || null,
    ownerId: task.assignedTo || task.createdBy || null,
    status: task.status || null,
    dueAt: task.dueAt || null,
    completedAt: task.doneAt || null,
    taskType: task.type || null,
    sourceStore: 'crmTasks',
    occurredAt: new Date().toISOString(),
  };
}

/**
 * Precedência: complete > delete > update (reopen inexistente)
 * cancel → TASK_UPDATED (status canceled)
 */
export function resolveTaskMutationEventType(previous, updated, payload = {}, op = 'update') {
  if (op === 'delete') return 'TASK_DELETED';
  if (op === 'complete') return 'TASK_COMPLETED';

  const prevStatus = String(previous?.status || '').toLowerCase();
  const nextStatus = String(updated?.status || payload.status || '').toLowerCase();
  if (
    (nextStatus === 'done' || nextStatus === 'completed')
    && prevStatus !== nextStatus
  ) {
    return 'TASK_COMPLETED';
  }
  return 'TASK_UPDATED';
}

export function scheduleTaskCreatedDomainEvent(user, task, meta = {}) {
  if (!task?.id) return;
  const tenantId = String(task.tenant_id || task.tenantId || '').trim();
  if (!tenantId) return;
  const taskId = String(task.id);
  const { correlationId, causationId } = resolveCrmWaveBOperationCorrelation(meta);

  publishPrepared({
    eventType: 'TASK_CREATED',
    eventId: `de-task-created-${taskId}`,
    aggregateId: taskId,
    tenantId,
    userId: user?.id || task.createdBy || null,
    correlationId,
    causationId,
    source: 'crm',
    payload: basePayload(task),
  }, { eventType: 'TASK_CREATED', aggregateId: taskId });
}

export function scheduleTaskMutationDomainEvent(
  user,
  updated,
  previous,
  payload = {},
  op = 'update',
  meta = {},
) {
  if (!updated?.id && op !== 'delete') return;
  const taskId = String(updated?.id || previous?.id || payload.taskId || '');
  if (!taskId) return;
  const tenantId = String(
    updated?.tenant_id || updated?.tenantId || previous?.tenant_id || previous?.tenantId || '',
  ).trim();
  if (!tenantId && op !== 'delete') return;
  const eventType = resolveTaskMutationEventType(previous, updated || previous, payload, op);
  const { correlationId, causationId } = resolveCrmWaveBOperationCorrelation(meta);
  const stamp = String(updated?.updatedAt || updated?.doneAt || Date.now());

  const effectiveTenant = tenantId || String(meta.tenantId || '').trim();
  if (!effectiveTenant) return;

  publishPrepared({
    eventType,
    eventId: `de-task-${eventType.toLowerCase().replace(/_/g, '-')}-${taskId}-${stamp}`,
    aggregateId: taskId,
    tenantId: effectiveTenant,
    userId: user?.id || null,
    correlationId,
    causationId,
    source: 'crm',
    payload: op === 'delete'
      ? {
          taskId,
          leadId: previous?.leadId || null,
          tenantId: effectiveTenant,
          status: 'deleted',
          sourceStore: 'crmTasks',
          occurredAt: new Date().toISOString(),
        }
      : basePayload(updated),
  }, { eventType, aggregateId: taskId });
}

export function scheduleTaskCompletedDomainEvent(user, task, meta = {}) {
  scheduleTaskMutationDomainEvent(
    user,
    task,
    { ...task, status: 'pending', doneAt: null },
    { status: 'done' },
    'complete',
    meta,
  );
}

export function scheduleTaskDeletedDomainEvent(user, taskId, previous, meta = {}) {
  scheduleTaskMutationDomainEvent(
    user,
    { id: taskId, ...(previous || {}) },
    previous || { id: taskId },
    { taskId },
    'delete',
    meta,
  );
}
