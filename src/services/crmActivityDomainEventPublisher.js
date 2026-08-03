/**
 * Domain Events CRM Wave B — Activity / Timeline — Phase 7.5.
 * Publica exclusivamente via DomainEventFacade.
 * Não publica side-effects de task/follow-up/move (evita duplicidade).
 */
import {
  publishViaDomainEventFacade,
} from '../domain-events/shared/domainEventFacade.ts';
import { isDomainEventsEnabled } from '../domain-events/domainEventFlags.ts';
import { createDomainEventCorrelationId } from '../domain-events/shared/domainEventCorrelation.ts';

/** @type {import('../domain-events/domainEventFlags.ts').DomainEventFlagsInput | null} */
let flagsInputOverride = null;

export function __setCrmActivityDomainEventFlagsForTest(input) {
  flagsInputOverride = input;
}

function flagsInput() {
  return flagsInputOverride ?? {};
}

function logDev(event, payload) {
  if (!import.meta.env?.DEV) return;
  console.debug('[CRM_ACTIVITY_DOMAIN_EVENT]', event, payload);
}

export function resolveCrmWaveBOperationCorrelation(meta = {}) {
  const received = String(meta.correlationId || '').trim();
  return {
    correlationId: received || createDomainEventCorrelationId(),
    causationId: meta.causationId === undefined
      ? null
      : (meta.causationId == null ? null : String(meta.causationId).trim() || null),
  };
}

/** Tipos de timeline que já têm Domain Event no service pai — não republicar. */
export const TIMELINE_DE_SKIP_TYPES = new Set([
  'follow_up_created',
  'task_created',
  'task_done',
  'status_change',
  'converted_to_patient',
  'appointment_scheduled',
  'budget_created',
  'budget_sent',
  'budget_approved',
  'budget_rejected',
    'budget_presented',
    'budget_em_analise_followup',
    'message_sent',
    'meta_lead_received',
    'meta_lead_updated',
]);

export function shouldPublishTimelineDomainEvent(type) {
  const key = String(type || '').trim().toLowerCase();
  if (!key) return false;
  return !TIMELINE_DE_SKIP_TYPES.has(key);
}

function sanitizeTimelineData(data = {}) {
  const out = {};
  const skip = new Set([
    'notes', 'description', 'body', 'message', 'text', 'content',
    'anamnese', 'prontuario', 'patient', 'conversation', 'whatsapp',
  ]);
  for (const [k, v] of Object.entries(data || {})) {
    if (skip.has(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) continue;
    if (typeof v === 'string' && v.length > 200) {
      out[k] = `${v.slice(0, 200)}…`;
      continue;
    }
    out[k] = v;
  }
  return out;
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

/**
 * CRM_TIMELINE_EVENT_CREATED — após addLeadEvent/createLeadEvent (IDB ok),
 * somente quando o type não é side-effect de outra operação Wave A/B.
 */
export function scheduleCrmTimelineEventCreatedDomainEvent(user, event, meta = {}) {
  if (!event?.id) return;
  if (!shouldPublishTimelineDomainEvent(event.type)) return;
  const tenantId = String(event.tenant_id || event.tenantId || '').trim();
  if (!tenantId) return;
  const eventId = String(event.id);
  const leadId = String(event.leadId || '');
  const { correlationId, causationId } = resolveCrmWaveBOperationCorrelation(meta);

  schedule(async () => publishViaDomainEventFacade({
    eventType: 'CRM_TIMELINE_EVENT_CREATED',
    eventId: `de-crm-timeline-${eventId}`,
    aggregateId: leadId || eventId,
    tenantId,
    userId: user?.id || event.userId || null,
    correlationId,
    causationId,
    source: 'crm',
    payload: {
      eventId,
      leadId: leadId || null,
      tenantId,
      activityType: event.type || null,
      actorId: event.userId || user?.id || null,
      occurredAt: event.createdAt || null,
      metadata: sanitizeTimelineData(event.data),
      sourceStore: 'crmLeadEvents',
    },
  }, {
    flagsInput: flagsInput(),
    enableDedup: true,
    requireRegisteredType: true,
  }), { eventType: 'CRM_TIMELINE_EVENT_CREATED', aggregateId: eventId });
}
