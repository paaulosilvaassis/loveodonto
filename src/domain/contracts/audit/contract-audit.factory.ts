/**
 * @module domain/contracts/audit/contract-audit.factory
 * @description Factory de eventos de auditoria (sem PII integral) — Phase 10.5.
 */

import type {
  ContractAuditEventId,
  ContractId,
  ContractVersionId,
  TenantId,
} from '../contract.ids.js';
import type {
  ContractAuditActor,
  ContractAuditEvent,
  ContractAuditEventType,
  ContractAuditSource,
} from './contract-audit.types.js';

export interface CreateContractAuditEventInput {
  tenantId: TenantId;
  contractId: ContractId;
  contractVersionId?: ContractVersionId;
  eventType: ContractAuditEventType;
  actor: ContractAuditActor;
  source: ContractAuditSource;
  occurredAt: string;
  metadata?: Record<string, unknown>;
  id?: string;
}

const FORBIDDEN_META_KEYS = new Set([
  'html',
  'renderedHtml',
  'contentHtml',
  'cpf',
  'documentNumber',
  'token',
  'otp',
  'password',
  'snapshot',
  'financialSnapshot',
  'patientSnapshot',
]);

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_META_KEYS.has(key)) continue;
    if (typeof value === 'string' && value.length > 200) continue;
    if (typeof value === 'object' && value != null) continue;
    out[key] = value;
  }
  return out;
}

export function createContractAuditEvent(
  input: CreateContractAuditEventInput,
): ContractAuditEvent {
  if (!String(input.tenantId || '').trim()) {
    throw new Error('TENANT_REQUIRED');
  }
  return {
    id: (input.id || `aud_${Date.now().toString(36)}`) as ContractAuditEventId,
    tenantId: input.tenantId,
    contractId: input.contractId,
    contractVersionId: input.contractVersionId,
    eventType: input.eventType,
    actor: input.actor,
    source: input.source,
    metadata: sanitizeMetadata(input.metadata),
    occurredAt: input.occurredAt,
  };
}
