/**
 * @module domain/contracts/signatures/signing-session-memory.repository
 * @description Memory repo de sessões — unitários / restart simulado via store compartilhado.
 */

import { createContractDomainError } from '../contract.errors.js';
import type {
  CreateSigningSessionInput,
  SigningSessionRecord,
  SigningSessionRepository,
} from './signing-session.repository.js';

function fail(code: Parameters<typeof createContractDomainError>[0], message: string): never {
  throw Object.assign(new Error(message), {
    domainError: createContractDomainError(code, message),
    code,
  });
}

export function createMemorySigningSessionRepository(
  store: Map<string, SigningSessionRecord> = new Map(),
): SigningSessionRepository & { readonly store: Map<string, SigningSessionRecord> } {
  let seq = 0;

  return {
    store,
    async create(input: CreateSigningSessionInput) {
      if (!/^[a-f0-9]{64}$/.test(input.tokenHash)) {
        fail('SIGNATURE_SESSION_HASH_INVALID', 'token_hash inválido.');
      }
      for (const row of store.values()) {
        if (row.tenantId === input.tenantId
          && (row.tokenId === input.tokenId || row.tokenHash === input.tokenHash)) {
          fail('SIGNATURE_SESSION_PERSISTENCE_FAILED', 'Sessão duplicada.');
        }
      }
      seq += 1;
      const record: SigningSessionRecord = {
        id: input.id || `sess_mem_${seq}`,
        tenantId: input.tenantId,
        envelopeId: input.envelopeId,
        signerId: input.signerId,
        tokenId: input.tokenId,
        tokenHash: input.tokenHash,
        status: 'ACTIVE',
        issuedAt: input.issuedAt,
        expiresAt: input.expiresAt,
        ipHash: input.ipHash,
        userAgentHash: input.userAgentHash,
        createdAt: input.issuedAt,
        rowVersion: 1,
      };
      store.set(record.id, { ...record });
      return { ...record };
    },

    async findByTokenHash(_tenantId, tokenHash) {
      for (const row of store.values()) {
        if (row.tokenHash === tokenHash) return { ...row };
      }
      return null;
    },

    async findByTokenId(tenantId, tokenId) {
      for (const row of store.values()) {
        if (row.tenantId === tenantId && row.tokenId === tokenId) return { ...row };
      }
      return null;
    },

    async findByTokenIdAny(tokenId) {
      for (const row of store.values()) {
        if (row.tokenId === tokenId) return { ...row };
      }
      return null;
    },

    async touchLastUsed(tenantId, sessionId, lastUsedAt, expectedRowVersion) {
      const row = store.get(sessionId);
      if (!row || row.tenantId !== tenantId) {
        fail('SIGNATURE_SESSION_INVALID', 'Sessão não encontrada.');
      }
      if (row.rowVersion !== expectedRowVersion) {
        fail('SIGNATURE_SESSION_PERSISTENCE_FAILED', 'Conflito de versão.');
      }
      const next = { ...row, lastUsedAt, rowVersion: row.rowVersion + 1 };
      store.set(sessionId, next);
      return { ...next };
    },

    async revoke(tenantId, sessionId, revokedAt, expectedRowVersion) {
      const row = store.get(sessionId);
      if (!row || row.tenantId !== tenantId) {
        fail('SIGNATURE_SESSION_INVALID', 'Sessão não encontrada.');
      }
      if (row.rowVersion !== expectedRowVersion) {
        fail('SIGNATURE_SESSION_PERSISTENCE_FAILED', 'Conflito de versão.');
      }
      const next = {
        ...row,
        status: 'REVOKED' as const,
        revokedAt,
        rowVersion: row.rowVersion + 1,
      };
      store.set(sessionId, next);
      return { ...next };
    },

    async revokeForEnvelope(tenantId, envelopeId, revokedAt) {
      let count = 0;
      for (const [id, row] of store.entries()) {
        if (row.tenantId === tenantId
          && row.envelopeId === envelopeId
          && row.status === 'ACTIVE') {
          store.set(id, {
            ...row,
            status: 'REVOKED',
            revokedAt,
            rowVersion: row.rowVersion + 1,
          });
          count += 1;
        }
      }
      return count;
    },

    async consume(tenantId, sessionId, consumedAt, expectedRowVersion) {
      const row = store.get(sessionId);
      if (!row || row.tenantId !== tenantId) {
        fail('SIGNATURE_SESSION_INVALID', 'Sessão não encontrada.');
      }
      if (row.status === 'CONSUMED') {
        fail('SIGNATURE_SESSION_ALREADY_CONSUMED', 'Sessão já consumida.');
      }
      if (row.rowVersion !== expectedRowVersion) {
        fail('SIGNATURE_SESSION_PERSISTENCE_FAILED', 'Conflito de versão.');
      }
      const next = {
        ...row,
        status: 'CONSUMED' as const,
        consumedAt,
        rowVersion: row.rowVersion + 1,
      };
      store.set(sessionId, next);
      return { ...next };
    },

    async markExpired(tenantId, sessionId, at, expectedRowVersion) {
      const row = store.get(sessionId);
      if (!row || row.tenantId !== tenantId) {
        fail('SIGNATURE_SESSION_INVALID', 'Sessão não encontrada.');
      }
      if (row.rowVersion !== expectedRowVersion) {
        fail('SIGNATURE_SESSION_PERSISTENCE_FAILED', 'Conflito de versão.');
      }
      const next = {
        ...row,
        status: 'EXPIRED' as const,
        rowVersion: row.rowVersion + 1,
        lastUsedAt: at,
      };
      store.set(sessionId, next);
      return { ...next };
    },
  };
}
