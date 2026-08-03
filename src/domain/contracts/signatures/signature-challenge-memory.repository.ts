/**
 * @module domain/contracts/signatures/signature-challenge-memory.repository
 */

import { createContractDomainError } from '../contract.errors.js';
import type {
  CreateSignatureChallengeInput,
  SignatureAuthenticationChallengeRepository,
  SignatureChallengeRecord,
} from './signature-challenge.repository.js';

function fail(code: Parameters<typeof createContractDomainError>[0], message: string): never {
  throw Object.assign(new Error(message), {
    domainError: createContractDomainError(code, message),
    code,
  });
}

export function createMemorySignatureAuthenticationChallengeRepository(
  store: Map<string, SignatureChallengeRecord> = new Map(),
): SignatureAuthenticationChallengeRepository & {
  readonly store: Map<string, SignatureChallengeRecord>;
} {
  let seq = 0;

  return {
    store,
    async create(input: CreateSignatureChallengeInput) {
      if (!/^[a-f0-9]{64}$/.test(input.codeHash)) {
        fail('SIGNATURE_CHALLENGE_PERSISTENCE_FAILED', 'code_hash inválido.');
      }
      seq += 1;
      const record: SignatureChallengeRecord = {
        id: input.id || `chal_mem_${seq}`,
        tenantId: input.tenantId,
        envelopeId: input.envelopeId,
        signerId: input.signerId,
        sessionId: input.sessionId,
        challengeType: input.challengeType,
        destinationHash: input.destinationHash,
        codeHash: input.codeHash,
        status: 'PENDING',
        attemptCount: 0,
        maxAttempts: input.maxAttempts,
        issuedAt: input.issuedAt,
        expiresAt: input.expiresAt,
        createdAt: input.issuedAt,
        rowVersion: 1,
      };
      store.set(record.id, { ...record });
      return { ...record };
    },

    async findById(tenantId, challengeId) {
      const row = store.get(challengeId);
      if (!row || row.tenantId !== tenantId) return null;
      return { ...row };
    },

    async invalidateActiveForSigner(tenantId, envelopeId, signerId, invalidatedAt) {
      let count = 0;
      for (const [id, row] of store.entries()) {
        if (row.tenantId === tenantId
          && row.envelopeId === envelopeId
          && row.signerId === signerId
          && row.status === 'PENDING') {
          store.set(id, {
            ...row,
            status: 'INVALIDATED',
            invalidatedAt,
            rowVersion: row.rowVersion + 1,
          });
          count += 1;
        }
      }
      return count;
    },

    async recordFailedAttempt(tenantId, challengeId, expectedRowVersion) {
      const row = store.get(challengeId);
      if (!row || row.tenantId !== tenantId) {
        fail('SIGNATURE_CHALLENGE_PERSISTENCE_FAILED', 'Challenge não encontrado.');
      }
      if (row.rowVersion !== expectedRowVersion) {
        fail('SIGNATURE_CHALLENGE_PERSISTENCE_FAILED', 'Conflito de versão.');
      }
      const attemptCount = row.attemptCount + 1;
      const locked = attemptCount >= row.maxAttempts;
      const next: SignatureChallengeRecord = {
        ...row,
        attemptCount,
        status: locked ? 'LOCKED' : row.status,
        rowVersion: row.rowVersion + 1,
      };
      store.set(challengeId, next);
      return { ...next };
    },

    async markVerified(tenantId, challengeId, verifiedAt, expectedRowVersion) {
      const row = store.get(challengeId);
      if (!row || row.tenantId !== tenantId) {
        fail('SIGNATURE_CHALLENGE_PERSISTENCE_FAILED', 'Challenge não encontrado.');
      }
      if (row.rowVersion !== expectedRowVersion) {
        fail('SIGNATURE_CHALLENGE_PERSISTENCE_FAILED', 'Conflito de versão.');
      }
      const next: SignatureChallengeRecord = {
        ...row,
        status: 'VERIFIED',
        verifiedAt,
        consumedAt: verifiedAt,
        attemptCount: row.attemptCount + 1,
        rowVersion: row.rowVersion + 1,
      };
      store.set(challengeId, next);
      return { ...next };
    },

    async markConsumed(tenantId, challengeId, consumedAt, expectedRowVersion) {
      const row = store.get(challengeId);
      if (!row || row.tenantId !== tenantId) {
        fail('SIGNATURE_CHALLENGE_PERSISTENCE_FAILED', 'Challenge não encontrado.');
      }
      if (row.rowVersion !== expectedRowVersion) {
        fail('SIGNATURE_CHALLENGE_PERSISTENCE_FAILED', 'Conflito de versão.');
      }
      const next: SignatureChallengeRecord = {
        ...row,
        status: 'CONSUMED',
        consumedAt,
        rowVersion: row.rowVersion + 1,
      };
      store.set(challengeId, next);
      return { ...next };
    },

    async markExpired(tenantId, challengeId, at, expectedRowVersion) {
      const row = store.get(challengeId);
      if (!row || row.tenantId !== tenantId) {
        fail('SIGNATURE_CHALLENGE_PERSISTENCE_FAILED', 'Challenge não encontrado.');
      }
      if (row.rowVersion !== expectedRowVersion) {
        fail('SIGNATURE_CHALLENGE_PERSISTENCE_FAILED', 'Conflito de versão.');
      }
      const next: SignatureChallengeRecord = {
        ...row,
        status: 'EXPIRED',
        invalidatedAt: at,
        rowVersion: row.rowVersion + 1,
      };
      store.set(challengeId, next);
      return { ...next };
    },
  };
}
