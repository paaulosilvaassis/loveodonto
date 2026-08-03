/**
 * @module domain/contracts/signatures/signature-delivery-memory.repository
 */

import { createContractDomainError } from '../contract.errors.js';
import type {
  CreateSignatureDeliveryAttemptInput,
  SignatureDeliveryAttemptRepository,
} from './signature-delivery.repository.js';
import type { SignatureDeliveryAttempt } from './signature-delivery.types.js';

const SENSITIVE_META = new Set([
  'token', 'otp', 'plainCode', 'fullLink', 'signedUrl',
  'destination', 'email', 'phone', 'cpf',
]);

function sanitizeMetadata(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta || {})) {
    if (SENSITIVE_META.has(k)) continue;
    out[k] = v;
  }
  return out;
}

export function createMemorySignatureDeliveryAttemptRepository(
  store: Map<string, SignatureDeliveryAttempt> = new Map(),
): SignatureDeliveryAttemptRepository & { readonly store: Map<string, SignatureDeliveryAttempt> } {
  let seq = 0;

  return {
    store,
    async create(input: CreateSignatureDeliveryAttemptInput) {
      const existing = [...store.values()].find(
        (r) => r.tenantId === input.tenantId && r.idempotencyKey === input.idempotencyKey,
      );
      if (existing) {
        throw Object.assign(new Error('Delivery attempt duplicado.'), {
          domainError: createContractDomainError(
            'SIGNATURE_INVITATION_ALREADY_SENT',
            'Tentativa de delivery já registrada.',
          ),
          code: 'SIGNATURE_INVITATION_ALREADY_SENT',
          existing,
        });
      }
      seq += 1;
      const now = input.requestedAt;
      const record: SignatureDeliveryAttempt = {
        id: (input.id || `del_mem_${seq}`) as SignatureDeliveryAttempt['id'],
        tenantId: input.tenantId,
        envelopeId: input.envelopeId,
        signerId: input.signerId,
        channel: input.channel,
        purpose: input.purpose,
        destinationMasked: input.destinationMasked,
        status: input.status,
        provider: input.provider,
        providerMessageId: input.providerMessageId,
        idempotencyKey: input.idempotencyKey,
        attemptNumber: input.attemptNumber,
        requestedAt: input.requestedAt,
        completedAt: input.completedAt,
        failedAt: input.failedAt,
        failureCode: input.failureCode,
        metadata: sanitizeMetadata(input.metadata),
        createdAt: now,
        rowVersion: 1,
      };
      store.set(record.id, { ...record });
      return { ...record };
    },

    async findByIdempotencyKey(tenantId, idempotencyKey) {
      for (const row of store.values()) {
        if (row.tenantId === tenantId && row.idempotencyKey === idempotencyKey) {
          return { ...row };
        }
      }
      return null;
    },

    async listByEnvelope(tenantId, envelopeId) {
      return [...store.values()]
        .filter((r) => r.tenantId === tenantId && r.envelopeId === envelopeId)
        .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt))
        .map((r) => ({ ...r }));
    },

    async listBySigner(tenantId, signerId) {
      return [...store.values()]
        .filter((r) => r.tenantId === tenantId && r.signerId === signerId)
        .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt))
        .map((r) => ({ ...r }));
    },

    async countBySignerPurpose(tenantId, signerId, purpose) {
      return [...store.values()].filter(
        (r) => r.tenantId === tenantId && r.signerId === signerId && r.purpose === purpose,
      ).length;
    },

    async findLatestBySignerPurpose(tenantId, signerId, purpose) {
      const list = await this.listBySigner(tenantId, signerId);
      return list.find((r) => r.purpose === purpose) || null;
    },
  };
}
