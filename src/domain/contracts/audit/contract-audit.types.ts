/**
 * @module domain/contracts/audit/contract-audit.types
 * @description Preparado para append-only — sem persistência nesta fase.
 */

import type {
  ContractAuditEventId,
  ContractId,
  ContractVersionId,
  SignatureEnvelopeId,
  TenantId,
} from '../contract.ids.js';

export const CONTRACT_AUDIT_ACTOR_TYPES = [
  'USER',
  'PATIENT',
  'SYSTEM',
  'PROVIDER',
  'SUPPORT',
] as const;

export type ContractAuditActorType = (typeof CONTRACT_AUDIT_ACTOR_TYPES)[number];

export interface ContractAuditActor {
  actorType: ContractAuditActorType;
  actorId?: string;
  actorName?: string;
}

export const CONTRACT_AUDIT_SOURCES = [
  'APP',
  'PUBLIC_SIGN',
  'API',
  'WEBHOOK',
  'WORKER',
  'LEGACY',
  'SUPPORT',
] as const;

export type ContractAuditSource = (typeof CONTRACT_AUDIT_SOURCES)[number];

export const CONTRACT_AUDIT_EVENT_TYPES = [
  'CREATED',
  'UPDATED',
  'STATUS_CHANGED',
  'VERSION_CREATED',
  'VERSION_LOCKED',
  'VIEWED',
  'PRINTED',
  'DOWNLOADED',
  'SENT',
  'RESENT',
  'AUTHENTICATED',
  'SIGNED',
  'DECLINED',
  'CANCELLED',
  'TERMINATED',
  'SUPERSEDED',
  'ATTACHMENT_ADDED',
  'ATTACHMENT_REMOVED',
  'ADMIN_ACCESS',
  'INTEGRATION_FAILED',
  'PDF_GENERATED',
  'PDF_FAILED',
] as const;

export type ContractAuditEventType = (typeof CONTRACT_AUDIT_EVENT_TYPES)[number];

export interface ContractAuditEvent {
  id: ContractAuditEventId;
  tenantId: TenantId;
  contractId: ContractId;
  contractVersionId?: ContractVersionId;
  envelopeId?: SignatureEnvelopeId;
  eventType: ContractAuditEventType;
  actor: ContractAuditActor;
  source: ContractAuditSource;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  previousEventHash?: string;
  eventHash?: string;
  occurredAt: string;
}
