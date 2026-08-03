/**
 * @module domain/contracts/signatures/persisted-signing-session-token.service
 * @description Token service com persistência (hash-only) — Phase 10.10.
 */

import { createContractDomainError } from '../contract.errors.js';
import type { SignatureEnvelopeId, TenantId } from '../contract.ids.js';
import { createContractContentHasher } from '../hash/contract-content-hasher.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import { timingSafeEqualHex } from '../files/contract-binary-hash.js';
import type { SigningSessionRepository } from './signing-session.repository.js';
import type {
  IssueSigningSessionTokenInput,
  IssuedSigningSessionToken,
  SigningSessionTokenService,
  ValidatedSigningSessionToken,
} from './signing-session-token.service.js';

export async function hashSigningSessionToken(token: string): Promise<string> {
  const hasher = createContractContentHasher();
  return hasher.hash({
    tenantId: 'token',
    contractId: 'session',
    versionNumber: 1,
    generationReason: 'TOKEN',
    renderedHtml: token,
    snapshots: {},
  });
}

function randomToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `tok_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function sessionError(
  code: Parameters<typeof createContractDomainError>[0],
  message: string,
): never {
  throw Object.assign(new Error(message), {
    domainError: createContractDomainError(code, message, 'token'),
    code,
  });
}

export function createPersistedSigningSessionTokenService(
  repo: SigningSessionRepository,
  clock: ContractClock = createSystemContractClock(),
  options: {
    deterministicToken?: string;
    /** Tenant default para revokeForEnvelope quando o contrato legado não passa tenant. */
    defaultTenantId?: TenantId;
  } = {},
): SigningSessionTokenService {
  let seq = 0;

  return {
    async issue(input: IssueSigningSessionTokenInput): Promise<IssuedSigningSessionToken> {
      if (!repo) {
        sessionError('SIGNATURE_SESSION_STORAGE_UNAVAILABLE', 'Storage de sessão indisponível.');
      }
      seq += 1;
      const tokenId = `sst_${seq.toString(36)}_${Date.now().toString(36)}`;
      const token = options.deterministicToken
        ? `${options.deterministicToken}_${seq}`
        : randomToken();
      const tokenHash = await hashSigningSessionToken(token);
      if (!/^[a-f0-9]{64}$/.test(tokenHash)) {
        sessionError('SIGNATURE_SESSION_HASH_INVALID', 'Hash de token inválido.');
      }
      const issuedAt = clock.nowIso();
      try {
        await repo.create({
          tenantId: input.tenantId,
          envelopeId: input.envelopeId,
          signerId: input.signerId,
          tokenId,
          tokenHash,
          issuedAt,
          expiresAt: input.expiresAt,
        });
      } catch (err) {
        if ((err as { code?: string }).code?.startsWith('SIGNATURE_')) throw err;
        sessionError('SIGNATURE_SESSION_PERSISTENCE_FAILED', 'Falha ao persistir sessão.');
      }
      return { tokenId, token, tokenHash, expiresAt: input.expiresAt };
    },

    async validate(token: string): Promise<ValidatedSigningSessionToken> {
      if (!String(token || '').trim()) {
        sessionError('SIGNATURE_SESSION_INVALID', 'Sessão inválida.');
      }
      const tokenHash = await hashSigningSessionToken(token);
      const stored = await repo.findByTokenHash(null, tokenHash);
      if (!stored || !timingSafeEqualHex(stored.tokenHash, tokenHash)) {
        sessionError('SIGNATURE_SESSION_INVALID', 'Sessão inválida.');
      }
      if (stored.status === 'REVOKED' || stored.revokedAt) {
        sessionError('SIGNATURE_SESSION_REVOKED', 'Sessão revogada.');
      }
      if (stored.status === 'CONSUMED' || stored.consumedAt) {
        sessionError('SIGNATURE_SESSION_ALREADY_CONSUMED', 'Sessão já consumida.');
      }
      if (stored.status === 'EXPIRED' || Date.parse(stored.expiresAt) <= clock.now().getTime()) {
        if (stored.status === 'ACTIVE') {
          try {
            await repo.markExpired(
              stored.tenantId,
              stored.id,
              clock.nowIso(),
              stored.rowVersion,
            );
          } catch {
            // best-effort
          }
        }
        sessionError('SIGNATURE_SESSION_EXPIRED', 'Sessão expirada.');
      }
      if (stored.status !== 'ACTIVE') {
        sessionError('SIGNATURE_SESSION_INVALID', 'Sessão inválida.');
      }

      try {
        await repo.touchLastUsed(
          stored.tenantId,
          stored.id,
          clock.nowIso(),
          stored.rowVersion,
        );
      } catch {
        // best-effort
      }

      return {
        tokenId: stored.tokenId,
        tenantId: stored.tenantId,
        envelopeId: stored.envelopeId,
        signerId: stored.signerId,
        expiresAt: stored.expiresAt,
      };
    },

    async revoke(tokenId: string): Promise<void> {
      const stored = await repo.findByTokenIdAny(tokenId);
      if (!stored) return;
      await repo.revoke(stored.tenantId, stored.id, clock.nowIso(), stored.rowVersion);
    },

    async revokeForEnvelope(envelopeId: SignatureEnvelopeId): Promise<void> {
      if (!options.defaultTenantId) return;
      await repo.revokeForEnvelope(options.defaultTenantId, envelopeId, clock.nowIso());
    },
  };
}
