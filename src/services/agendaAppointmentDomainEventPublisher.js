/**
 * Publicação de Domain Events Agenda Wave A — Phase 7.4.
 *
 * Ponto canônico: appointmentService após gravação IndexedDB bem-sucedida.
 * Publica exclusivamente via DomainEventFacade (nunca Publisher direto).
 * Não publica a partir do agendaWriteAdapter (evita duplicidade dual-write).
 * Flags OFF = no-op. Falha de publish nunca afeta a operação da agenda.
 *
 * Workflow clínico (check-in / call / finish / return) NÃO emite eventos nesta wave.
 */
import {
  publishViaDomainEventFacade,
} from '../domain-events/shared/domainEventFacade.ts';
import { isDomainEventsEnabled } from '../domain-events/domainEventFlags.ts';
import { createDomainEventCorrelationId } from '../domain-events/shared/domainEventCorrelation.ts';

/** @type {import('../domain-events/domainEventFlags.ts').DomainEventFlagsInput | null} */
let flagsInputOverride = null;

export function __setAgendaDomainEventFlagsForTest(input) {
  flagsInputOverride = input;
}

function flagsInput() {
  return flagsInputOverride ?? {};
}

function logDev(event, payload) {
  if (!import.meta.env?.DEV) return;
  console.debug('[AGENDA_DOMAIN_EVENT]', event, payload);
}

/**
 * Correlation da operação — NÃO usa aggregateId como correlation permanente.
 * @param {{ correlationId?: string, causationId?: string | null }} [meta]
 */
export function resolveAgendaOperationCorrelation(meta = {}) {
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

const SENSITIVE_KEYS = new Set([
  'notes',
  'workflowNotes',
  'anamnese',
  'prontuario',
  'clinicalNotes',
  'patient',
  'payer_data',
]);

function buildChangeSet(partial = {}) {
  const skip = new Set(['updatedAt', 'updated_at', 'createdAt', 'created_at']);
  const changeSet = {};
  for (const key of Object.keys(partial || {})) {
    if (skip.has(key) || SENSITIVE_KEYS.has(key)) continue;
    const value = partial[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) continue;
    changeSet[key] = value;
  }
  return changeSet;
}

function appointmentBasePayload(appointment) {
  return safePayload({
    appointmentId: appointment.id,
    tenantId: appointment.tenant_id || appointment.tenantId || null,
    patientId: appointment.patientId || null,
    leadId: appointment.leadId || null,
    professionalId: appointment.professionalId || null,
    roomId: appointment.roomId || null,
    date: appointment.date || null,
    startTime: appointment.startTime || null,
    endTime: appointment.endTime || null,
    status: appointment.status || null,
    isReturn: Boolean(appointment.isReturn),
    procedureName: appointment.procedureName || null,
    channel: appointment.channel || null,
  });
}

function scheduleAgendaDomainEvent(runner, context) {
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
  scheduleAgendaDomainEvent(
    async () => publishViaDomainEventFacade(input, {
      flagsInput: flagsInput(),
      enableDedup: true,
      requireRegisteredType: true,
    }),
    context,
  );
}

/**
 * APPOINTMENT_CREATED — após createAppointment / createAppointmentFromCrm.
 */
export function scheduleAppointmentCreatedDomainEvent(user, appointment, meta = {}) {
  if (!appointment?.id) return;
  const tenantId = String(appointment.tenant_id || appointment.tenantId || '').trim();
  if (!tenantId) return;
  const appointmentId = String(appointment.id);
  const { correlationId, causationId } = resolveAgendaOperationCorrelation(meta);

  publishPrepared(
    {
      eventType: 'APPOINTMENT_CREATED',
      eventId: `de-appt-created-${appointmentId}`,
      aggregateId: appointmentId,
      tenantId,
      userId: user?.id || null,
      correlationId,
      causationId,
      source: 'agenda',
      payload: appointmentBasePayload(appointment),
    },
    { eventType: 'APPOINTMENT_CREATED', aggregateId: appointmentId },
  );
}

/**
 * Resolve o tipo de evento de update (um evento por operação lógica).
 * Prioridade: cancel > reschedule > confirm > status > update.
 */
export function resolveAppointmentUpdateEventType(previous, updated, payload = {}) {
  const prevStatus = String(previous?.status || '');
  const nextStatus = String(updated?.status || '');
  const payloadStatus = payload.status != null ? String(payload.status) : null;

  if (nextStatus === 'cancelado' && prevStatus !== 'cancelado') {
    return 'APPOINTMENT_CANCELLED';
  }

  const dateChanged =
    (payload.date != null && String(payload.date) !== String(previous?.date || '')) ||
    (payload.startTime != null && String(payload.startTime) !== String(previous?.startTime || '')) ||
    (payload.endTime != null && String(payload.endTime) !== String(previous?.endTime || '')) ||
    (updated?.date !== previous?.date) ||
    (updated?.startTime !== previous?.startTime) ||
    (updated?.endTime !== previous?.endTime);

  // Reschedule tem prioridade sobre status genérico quando horário muda
  if (dateChanged && nextStatus !== 'cancelado') {
    return 'APPOINTMENT_RESCHEDULED';
  }

  if (
    (payloadStatus === 'confirmado' || nextStatus === 'confirmado') &&
    prevStatus !== 'confirmado'
  ) {
    return 'APPOINTMENT_CONFIRMED';
  }

  if (payloadStatus != null && payloadStatus !== prevStatus) {
    return 'APPOINTMENT_STATUS_CHANGED';
  }

  if (nextStatus !== prevStatus) {
    return 'APPOINTMENT_STATUS_CHANGED';
  }

  return 'APPOINTMENT_UPDATED';
}

/**
 * Após updateAppointment (inclui cancel/reschedule/confirm via mesmo ponto canônico).
 */
export function scheduleAppointmentMutationDomainEvent(
  user,
  updated,
  previous,
  payload = {},
  meta = {},
) {
  if (!updated?.id) return;
  const tenantId = String(updated.tenant_id || updated.tenantId || '').trim();
  if (!tenantId) return;
  const appointmentId = String(updated.id);
  const eventType = resolveAppointmentUpdateEventType(previous, updated, payload);
  const { correlationId, causationId } = resolveAgendaOperationCorrelation(meta);
  const changeSet = buildChangeSet(payload);

  const payloadExtra = {
    ...appointmentBasePayload(updated),
    previousStatus: previous?.status || null,
    previousDate: previous?.date || null,
    previousStartTime: previous?.startTime || null,
    previousEndTime: previous?.endTime || null,
    changeSet,
  };

  if (eventType === 'APPOINTMENT_CANCELLED') {
    payloadExtra.cancelReason = updated.cancelReason || payload.cancelReason || null;
  }

  const stamp = String(updated.updatedAt || updated.createdAt || Date.now()).trim() || 'na';
  const slug = eventType.toLowerCase().replace(/_/g, '-');

  publishPrepared(
    {
      eventType,
      eventId: `de-appt-${slug}-${appointmentId}-${stamp}`,
      aggregateId: appointmentId,
      tenantId,
      userId: user?.id || null,
      correlationId,
      causationId,
      source: 'agenda',
      payload: safePayload(payloadExtra),
    },
    { eventType, aggregateId: appointmentId },
  );
}

/** @deprecated use scheduleAppointmentMutationDomainEvent */
export function scheduleAppointmentUpdatedDomainEvent(user, updated, previous, payload, meta) {
  scheduleAppointmentMutationDomainEvent(user, updated, previous, payload, meta);
}

export async function __publishAppointmentCreatedDomainEventForTest(user, appointment, meta = {}) {
  const tenantId = String(appointment.tenant_id || appointment.tenantId || '').trim();
  const appointmentId = String(appointment.id);
  const { correlationId, causationId } = resolveAgendaOperationCorrelation(meta);
  return publishViaDomainEventFacade(
    {
      eventType: 'APPOINTMENT_CREATED',
      eventId: `de-appt-created-test-${appointmentId}`,
      aggregateId: appointmentId,
      tenantId,
      userId: user?.id || null,
      correlationId,
      causationId,
      source: 'agenda',
      payload: appointmentBasePayload(appointment),
    },
    {
      flagsInput: flagsInput(),
      enableDedup: true,
      requireRegisteredType: true,
    },
  );
}
