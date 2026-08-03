/**
 * @module domain-events/domainEventRegistry
 * @description Catálogo central de Domain Events — Phase 6.9.
 * Sem publicação ativa; apenas inventário estrutural.
 */

import type {
  DomainEventRegistryEntry,
  DomainEventTypeName,
} from './domainEventTypes.js';

export const DOMAIN_EVENT_REGISTRY: readonly DomainEventRegistryEntry[] = [
  {
    name: 'LEAD_CREATED',
    aggregate: 'lead',
    version: 1,
    description: 'Lead CRM criado.',
    expectedOrigin: 'crm',
    expectedDestinations: ['activity-stream', 'analytics', 'journey'],
  },
  {
    name: 'LEAD_UPDATED',
    aggregate: 'lead',
    version: 1,
    description: 'Lead CRM atualizado.',
    expectedOrigin: 'crm',
    expectedDestinations: ['activity-stream', 'analytics'],
  },
  {
    name: 'LEAD_MOVED',
    aggregate: 'lead',
    version: 1,
    description: 'Lead movido de estágio no pipeline.',
    expectedOrigin: 'crm',
    expectedDestinations: ['activity-stream', 'analytics', 'journey'],
  },
  {
    name: 'FOLLOW_UP_CREATED',
    aggregate: 'follow_up',
    version: 1,
    description: 'Follow-up CRM ou estratégico criado.',
    expectedOrigin: 'crm',
    expectedDestinations: ['activity-stream', 'agenda'],
  },
  {
    name: 'FOLLOW_UP_UPDATED',
    aggregate: 'follow_up',
    version: 1,
    description: 'Follow-up atualizado (campos gerais).',
    expectedOrigin: 'crm',
    expectedDestinations: ['activity-stream'],
  },
  {
    name: 'FOLLOW_UP_COMPLETED',
    aggregate: 'follow_up',
    version: 1,
    description: 'Follow-up concluído.',
    expectedOrigin: 'crm',
    expectedDestinations: ['activity-stream', 'analytics'],
  },
  {
    name: 'FOLLOW_UP_CANCELLED',
    aggregate: 'follow_up',
    version: 1,
    description: 'Follow-up cancelado.',
    expectedOrigin: 'crm',
    expectedDestinations: ['activity-stream'],
  },
  {
    name: 'FOLLOW_UP_RESCHEDULED',
    aggregate: 'follow_up',
    version: 1,
    description: 'Follow-up reagendado (dueAt/dueDate).',
    expectedOrigin: 'crm',
    expectedDestinations: ['activity-stream', 'agenda'],
  },
  {
    name: 'TASK_CREATED',
    aggregate: 'task',
    version: 1,
    description: 'Tarefa CRM criada.',
    expectedOrigin: 'crm',
    expectedDestinations: ['activity-stream'],
  },
  {
    name: 'TASK_UPDATED',
    aggregate: 'task',
    version: 1,
    description: 'Tarefa CRM atualizada (inclui cancelamento de status).',
    expectedOrigin: 'crm',
    expectedDestinations: ['activity-stream'],
  },
  {
    name: 'TASK_COMPLETED',
    aggregate: 'task',
    version: 1,
    description: 'Tarefa CRM concluída.',
    expectedOrigin: 'crm',
    expectedDestinations: ['activity-stream', 'analytics'],
  },
  {
    name: 'TASK_DELETED',
    aggregate: 'task',
    version: 1,
    description: 'Tarefa CRM removida.',
    expectedOrigin: 'crm',
    expectedDestinations: ['activity-stream'],
  },
  {
    name: 'CRM_TIMELINE_EVENT_CREATED',
    aggregate: 'lead',
    version: 1,
    description: 'Evento explícito na timeline do lead (não side-effect de task/follow-up/move).',
    expectedOrigin: 'crm',
    expectedDestinations: ['activity-stream'],
  },
  {
    name: 'APPOINTMENT_CREATED',
    aggregate: 'appointment',
    version: 1,
    description: 'Agendamento criado.',
    expectedOrigin: 'agenda',
    expectedDestinations: ['crm', 'analytics', 'whatsapp'],
  },
  {
    name: 'APPOINTMENT_CONFIRMED',
    aggregate: 'appointment',
    version: 1,
    description: 'Agendamento confirmado.',
    expectedOrigin: 'agenda',
    expectedDestinations: ['crm', 'analytics', 'whatsapp'],
  },
  {
    name: 'APPOINTMENT_UPDATED',
    aggregate: 'appointment',
    version: 1,
    description: 'Agendamento atualizado (campos gerais).',
    expectedOrigin: 'agenda',
    expectedDestinations: ['crm', 'analytics'],
  },
  {
    name: 'APPOINTMENT_CANCELLED',
    aggregate: 'appointment',
    version: 1,
    description: 'Agendamento cancelado (soft-cancel).',
    expectedOrigin: 'agenda',
    expectedDestinations: ['crm', 'analytics', 'whatsapp'],
  },
  {
    name: 'APPOINTMENT_RESCHEDULED',
    aggregate: 'appointment',
    version: 1,
    description: 'Agendamento remarcado (data/horário).',
    expectedOrigin: 'agenda',
    expectedDestinations: ['crm', 'analytics', 'whatsapp'],
  },
  {
    name: 'APPOINTMENT_STATUS_CHANGED',
    aggregate: 'appointment',
    version: 1,
    description: 'Status do agendamento alterado (fora de confirm/cancel).',
    expectedOrigin: 'agenda',
    expectedDestinations: ['crm', 'analytics'],
  },
  {
    name: 'PATIENT_CREATED',
    aggregate: 'patient',
    version: 1,
    description: 'Paciente criado.',
    expectedOrigin: 'crm',
    expectedDestinations: ['prontuario', 'analytics', 'journey'],
  },
  {
    name: 'BUDGET_CREATED',
    aggregate: 'budget',
    version: 1,
    description: 'Orçamento criado.',
    expectedOrigin: 'crm',
    expectedDestinations: ['financial', 'analytics', 'journey'],
  },
  {
    name: 'CONTRACT_SIGNED',
    aggregate: 'contract',
    version: 1,
    description: 'Contrato assinado.',
    expectedOrigin: 'crm',
    expectedDestinations: ['financial', 'analytics', 'journey'],
  },
  {
    name: 'RECEIVABLE_CREATED',
    aggregate: 'receivable',
    version: 1,
    description: 'Conta a receber criada.',
    expectedOrigin: 'financial',
    expectedDestinations: ['analytics', 'dashboard'],
  },
  {
    name: 'RECEIVABLE_UPDATED',
    aggregate: 'receivable',
    version: 1,
    description: 'Conta a receber atualizada.',
    expectedOrigin: 'financial',
    expectedDestinations: ['analytics', 'dashboard'],
  },
  {
    name: 'PAYABLE_CREATED',
    aggregate: 'payable',
    version: 1,
    description: 'Conta a pagar criada.',
    expectedOrigin: 'financial',
    expectedDestinations: ['analytics', 'dashboard'],
  },
  {
    name: 'PAYABLE_UPDATED',
    aggregate: 'payable',
    version: 1,
    description: 'Conta a pagar atualizada.',
    expectedOrigin: 'financial',
    expectedDestinations: ['analytics', 'dashboard'],
  },
  {
    name: 'PAYABLE_DELETED',
    aggregate: 'payable',
    version: 1,
    description: 'Conta a pagar excluída.',
    expectedOrigin: 'financial',
    expectedDestinations: ['analytics', 'dashboard'],
  },
  {
    name: 'FINANCING_CREATED',
    aggregate: 'financing',
    version: 1,
    description: 'Proposta de financiamento criada.',
    expectedOrigin: 'financial',
    expectedDestinations: ['analytics', 'dashboard'],
  },
  {
    name: 'FINANCING_UPDATED',
    aggregate: 'financing',
    version: 1,
    description: 'Termos de financiamento atualizados.',
    expectedOrigin: 'financial',
    expectedDestinations: ['analytics', 'dashboard'],
  },
  {
    name: 'PAYMENT_RECEIVED',
    aggregate: 'payment',
    version: 1,
    description: 'Pagamento recebido com sucesso.',
    expectedOrigin: 'financial',
    expectedDestinations: ['analytics', 'dashboard', 'journey'],
  },
  {
    name: 'PAYMENT_FAILED',
    aggregate: 'payment',
    version: 1,
    description: 'Falha no pagamento.',
    expectedOrigin: 'financial',
    expectedDestinations: ['analytics', 'dashboard', 'whatsapp'],
  },
  {
    name: 'USER_CREATED',
    aggregate: 'user',
    version: 1,
    description: 'Usuário/colaborador criado.',
    expectedOrigin: 'collaborators',
    expectedDestinations: ['platform', 'audit'],
  },
  {
    name: 'TENANT_CREATED',
    aggregate: 'tenant',
    version: 1,
    description: 'Tenant/clínica provisionado.',
    expectedOrigin: 'platform',
    expectedDestinations: ['platform', 'audit'],
  },
] as const;

const BY_NAME = new Map<string, DomainEventRegistryEntry>(
  DOMAIN_EVENT_REGISTRY.map((entry) => [entry.name, entry]),
);

export function listDomainEventRegistry(): DomainEventRegistryEntry[] {
  return DOMAIN_EVENT_REGISTRY.map((entry) => ({ ...entry }));
}

export function getDomainEventRegistryEntry(
  eventType: DomainEventTypeName | string,
): DomainEventRegistryEntry | null {
  return BY_NAME.get(String(eventType || '').trim()) ?? null;
}

export function isRegisteredDomainEventType(
  eventType: DomainEventTypeName | string,
): boolean {
  return BY_NAME.has(String(eventType || '').trim());
}

export function listDomainEventNames(): DomainEventTypeName[] {
  return DOMAIN_EVENT_REGISTRY.map((entry) => entry.name);
}
