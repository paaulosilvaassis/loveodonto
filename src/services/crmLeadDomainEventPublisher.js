/**
 * Publicação de Domain Events CRM Wave A (Leads) — Phase 7.1.
 *
 * Ponto canônico: crmService após gravação IndexedDB bem-sucedida.
 * Não publica a partir do dual/primary write adapter (evita duplicidade).
 * Flags OFF = no-op. Falha de publish nunca afeta a operação principal.
 */
import {
  publishViaDomainEventFacade,
} from '../domain-events/shared/domainEventFacade.ts';
import { isDomainEventsEnabled } from '../domain-events/domainEventFlags.ts';
import { createDomainEventCorrelationId } from '../domain-events/shared/domainEventCorrelation.ts';

/** @type {import('../domain-events/domainEventFlags.ts').DomainEventFlagsInput | null} */
let flagsInputOverride = null;

export function __setCrmLeadDomainEventFlagsForTest(input) {
  flagsInputOverride = input;
}

function flagsInput() {
  return flagsInputOverride ?? {};
}

function logDev(event, payload) {
  if (!import.meta.env?.DEV) return;
  console.debug('[CRM_LEAD_DOMAIN_EVENT]', event, payload);
}

/**
 * Correlation da operação lógica — Phase 7.5.
 * NÃO usa lead.id como correlation permanente (lead.id permanece só em aggregateId).
 * @param {{ correlationId?: string, causationId?: string | null }} [meta]
 * @param {string} [_legacyLeadId] ignorado — mantido por compat de assinatura
 */
export function resolveLeadOperationCorrelation(meta = {}, _legacyLeadId) {
  const received = String(meta.correlationId || '').trim();
  return {
    correlationId: received || createDomainEventCorrelationId(),
    causationId: meta.causationId === undefined
      ? null
      : (meta.causationId == null ? null : String(meta.causationId).trim() || null),
  };
}

/**
 * @deprecated Phase 7.5 — use resolveLeadOperationCorrelation.
 * Mantido para imports existentes; NÃO retorna mais leadId como correlation.
 */
export function resolveLeadWriteCorrelationId(leadId, explicit) {
  return resolveLeadOperationCorrelation({ correlationId: explicit }).correlationId;
}

function safePayload(obj) {
  return obj && typeof obj === 'object' ? { ...obj } : {};
}

/**
 * Fire-and-forget: nunca rejeita para o caller.
 * @param {() => Promise<unknown>} runner
 * @param {{ eventType: string, leadId: string }} context
 */
function scheduleLeadDomainEvent(runner, context) {
  if (!isDomainEventsEnabled(flagsInput())) return;
  queueMicrotask(() => {
    void Promise.resolve()
      .then(runner)
      .then((result) => {
        logDev(context.eventType, {
          leadId: context.leadId,
          ok: result?.accepted === true,
          skipped: result?.skipped === true,
          reason: result?.reason,
        });
      })
      .catch((err) => {
        logDev(context.eventType, {
          leadId: context.leadId,
          ok: false,
          error: err instanceof Error ? err.message : String(err || 'publish failed'),
        });
      });
  });
}

function buildChangeSet(partial = {}) {
  const keys = Object.keys(partial || {}).filter((k) => k !== 'updatedAt' && k !== 'updatedByUserId');
  const changeSet = {};
  for (const key of keys) {
    changeSet[key] = partial[key];
  }
  return changeSet;
}

/**
 * LEAD_CREATED — após createLead (IDB ok).
 * @param {object} user
 * @param {object} lead
 * @param {{ correlationId?: string, causationId?: string | null }} [meta]
 */
export function scheduleLeadCreatedDomainEvent(user, lead, meta = {}) {
  if (!lead?.id) return;
  const tenantId = String(lead.tenant_id || lead.tenantId || '').trim();
  if (!tenantId) return;
  const leadId = String(lead.id);
  const { correlationId, causationId } = resolveLeadOperationCorrelation(meta);

  scheduleLeadDomainEvent(async () => publishViaDomainEventFacade(
    {
      eventType: 'LEAD_CREATED',
      eventId: `de-lead-created-${leadId}`,
      aggregateId: leadId,
      tenantId,
      userId: user?.id || lead.createdByUserId || null,
      correlationId,
      causationId,
      source: 'crm',
      payload: safePayload({
        leadId,
        tenantId,
        stageKey: lead.stageKey || null,
        patientId: lead.patientId || null,
        ownerId: lead.assignedToUserId || null,
        source: lead.source || null,
        createdAt: lead.createdAt || null,
      }),
    },
    {
      flagsInput: flagsInput(),
      enableDedup: true,
      requireRegisteredType: true,
    },
  ), { eventType: 'LEAD_CREATED', leadId });
}

/**
 * LEAD_UPDATED — após updateLead (IDB ok).
 * Stage changes via updateLead emitem LEAD_UPDATED (não LEAD_MOVED).
 * @param {object} user
 * @param {object} lead
 * @param {object} [partial]
 * @param {{ correlationId?: string, causationId?: string | null }} [meta]
 */
export function scheduleLeadUpdatedDomainEvent(user, lead, partial = {}, meta = {}) {
  if (!lead?.id) return;
  const tenantId = String(lead.tenant_id || lead.tenantId || '').trim();
  if (!tenantId) return;
  const leadId = String(lead.id);
  const { correlationId, causationId } = resolveLeadOperationCorrelation(meta);

  scheduleLeadDomainEvent(async () => publishViaDomainEventFacade(
    {
      eventType: 'LEAD_UPDATED',
      eventId: `de-lead-updated-${leadId}-${String(lead.updatedAt || '').trim() || 'na'}`,
      aggregateId: leadId,
      tenantId,
      userId: user?.id || lead.updatedByUserId || null,
      correlationId,
      causationId,
      source: 'crm',
      payload: safePayload({
        leadId,
        tenantId,
        changeSet: buildChangeSet(partial),
        updatedAt: lead.updatedAt || null,
      }),
    },
    {
      flagsInput: flagsInput(),
      enableDedup: true,
      requireRegisteredType: true,
    },
  ), { eventType: 'LEAD_UPDATED', leadId });
}

/**
 * LEAD_MOVED — após moveLeadToStage (IDB ok).
 * Nome oficial do registry (não LEAD_STAGE_CHANGED).
 * @param {object} user
 * @param {object} lead
 * @param {string} fromStageKey
 * @param {string} toStageKey
 * @param {{ lossReason?: string, correlationId?: string, causationId?: string | null }} [meta]
 */
export function scheduleLeadMovedDomainEvent(user, lead, fromStageKey, toStageKey, meta = {}) {
  if (!lead?.id) return;
  const tenantId = String(lead.tenant_id || lead.tenantId || '').trim();
  if (!tenantId) return;
  const leadId = String(lead.id);
  const { correlationId, causationId } = resolveLeadOperationCorrelation(meta);

  scheduleLeadDomainEvent(async () => publishViaDomainEventFacade(
    {
      eventType: 'LEAD_MOVED',
      eventId: `de-lead-moved-${leadId}-${String(fromStageKey || '')}-${String(toStageKey || '')}-${String(lead.updatedAt || '').trim() || 'na'}`,
      aggregateId: leadId,
      tenantId,
      userId: user?.id || lead.updatedByUserId || null,
      correlationId,
      causationId,
      source: 'crm',
      payload: safePayload({
        leadId,
        tenantId,
        fromStageKey: fromStageKey || null,
        toStageKey: toStageKey || null,
        changedAt: lead.updatedAt || lead.lastContactAt || null,
        reason: meta.lossReason != null
          ? String(meta.lossReason).trim() || null
          : (lead.lossReason || null),
      }),
    },
    {
      flagsInput: flagsInput(),
      enableDedup: true,
      requireRegisteredType: true,
    },
  ), { eventType: 'LEAD_MOVED', leadId });
}

/** Helpers awaitable para testes. */
export async function __publishLeadCreatedDomainEventForTest(user, lead, meta = {}) {
  if (!isDomainEventsEnabled(flagsInput())) {
    return { accepted: false, skipped: true, reason: 'DOMAIN_EVENTS=false', eventId: null };
  }
  const tenantId = String(lead.tenant_id || lead.tenantId || '').trim();
  const { correlationId, causationId } = resolveLeadOperationCorrelation(meta);
  return publishViaDomainEventFacade(
    {
      eventType: 'LEAD_CREATED',
      eventId: `de-lead-created-${lead.id}`,
      aggregateId: String(lead.id),
      tenantId,
      userId: user?.id || null,
      correlationId,
      causationId,
      source: 'crm',
      payload: {
        leadId: lead.id,
        tenantId,
        stageKey: lead.stageKey || null,
        patientId: lead.patientId || null,
        ownerId: lead.assignedToUserId || null,
        source: lead.source || null,
        createdAt: lead.createdAt || null,
      },
    },
    { flagsInput: flagsInput(), enableDedup: true, requireRegisteredType: true },
  );
}

export async function __publishLeadUpdatedDomainEventForTest(user, lead, partial = {}, meta = {}) {
  if (!isDomainEventsEnabled(flagsInput())) {
    return { accepted: false, skipped: true, reason: 'DOMAIN_EVENTS=false', eventId: null };
  }
  const tenantId = String(lead.tenant_id || lead.tenantId || '').trim();
  const { correlationId, causationId } = resolveLeadOperationCorrelation(meta);
  return publishViaDomainEventFacade(
    {
      eventType: 'LEAD_UPDATED',
      eventId: `de-lead-updated-${lead.id}-${String(lead.updatedAt || '').trim() || 'na'}`,
      aggregateId: String(lead.id),
      tenantId,
      userId: user?.id || null,
      correlationId,
      causationId,
      source: 'crm',
      payload: {
        leadId: lead.id,
        tenantId,
        changeSet: buildChangeSet(partial),
        updatedAt: lead.updatedAt || null,
      },
    },
    { flagsInput: flagsInput(), enableDedup: true, requireRegisteredType: true },
  );
}

export async function __publishLeadMovedDomainEventForTest(
  user,
  lead,
  fromStageKey,
  toStageKey,
  meta = {},
) {
  if (!isDomainEventsEnabled(flagsInput())) {
    return { accepted: false, skipped: true, reason: 'DOMAIN_EVENTS=false', eventId: null };
  }
  const tenantId = String(lead.tenant_id || lead.tenantId || '').trim();
  const { correlationId, causationId } = resolveLeadOperationCorrelation(meta);
  return publishViaDomainEventFacade(
    {
      eventType: 'LEAD_MOVED',
      eventId: `de-lead-moved-${lead.id}-${String(fromStageKey || '')}-${String(toStageKey || '')}-${String(lead.updatedAt || '').trim() || 'na'}`,
      aggregateId: String(lead.id),
      tenantId,
      userId: user?.id || null,
      correlationId,
      causationId,
      source: 'crm',
      payload: {
        leadId: lead.id,
        tenantId,
        fromStageKey: fromStageKey || null,
        toStageKey: toStageKey || null,
        changedAt: lead.updatedAt || null,
        reason: meta.lossReason != null ? String(meta.lossReason).trim() || null : null,
      },
    },
    { flagsInput: flagsInput(), enableDedup: true, requireRegisteredType: true },
  );
}
