/**
 * @module domain/contracts/signatures/persisted-signature-authentication-challenge.service
 * @description Challenge OTP persistido (hash-only) — Phase 10.10.
 */

import { createContractDomainError } from '../contract.errors.js';
import type { SignatureEnvelopeId, SignatureSignerId } from '../contract.ids.js';
import { createContractContentHasher } from '../hash/contract-content-hasher.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import { timingSafeEqualHex } from '../files/contract-binary-hash.js';
import type { SignatureAuthenticationChallengeRepository } from './signature-challenge.repository.js';
import type {
  CreateSignatureAuthenticationChallengeInput,
  CreatedAuthenticationChallenge,
  SignatureAuthenticationChallengeService,
  VerifyAuthenticationChallengeResult,
  VerifySignatureAuthenticationChallengeInput,
} from './signature-authentication-challenge.service.js';

export async function hashSignatureOtpCode(code: string): Promise<string> {
  const hasher = createContractContentHasher();
  return hasher.hash({
    tenantId: 'otp',
    contractId: 'challenge',
    versionNumber: 1,
    generationReason: 'OTP',
    renderedHtml: String(code || ''),
    snapshots: {},
  });
}

function generateCode(deterministic?: string): string {
  if (deterministic) return deterministic;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    return String(100000 + (n[0] % 900000));
  }
  return String(100000 + Math.floor(Math.random() * 900000));
}

export function createPersistedSignatureAuthenticationChallengeService(
  repo: SignatureAuthenticationChallengeRepository,
  clock: ContractClock = createSystemContractClock(),
  options: {
    deterministicCode?: string;
    exposePlainCodeInTests?: boolean;
    /** sessionId derivado da sessão validada — obrigatório no fluxo persistido. */
    resolveSessionId?: (input: CreateSignatureAuthenticationChallengeInput) => Promise<string>;
  } = {},
): SignatureAuthenticationChallengeService {
  return {
    async createChallenge(
      input: CreateSignatureAuthenticationChallengeInput & { sessionId?: string },
    ): Promise<CreatedAuthenticationChallenge> {
      if (!repo) {
        throw Object.assign(new Error('Challenge storage indisponível.'), {
          domainError: createContractDomainError(
            'SIGNATURE_CHALLENGE_STORAGE_UNAVAILABLE',
            'Challenge storage indisponível.',
          ),
          code: 'SIGNATURE_CHALLENGE_STORAGE_UNAVAILABLE',
        });
      }

      const sessionId = input.sessionId
        || (options.resolveSessionId ? await options.resolveSessionId(input) : null);
      if (!sessionId) {
        throw Object.assign(new Error('sessionId obrigatório para challenge persistido.'), {
          domainError: createContractDomainError(
            'SIGNATURE_CHALLENGE_PERSISTENCE_FAILED',
            'sessionId obrigatório.',
            'sessionId',
          ),
          code: 'SIGNATURE_CHALLENGE_PERSISTENCE_FAILED',
        });
      }

      await repo.invalidateActiveForSigner(
        input.tenantId,
        input.envelopeId,
        input.signerId,
        clock.nowIso(),
      );

      const plain = generateCode(options.deterministicCode);
      const codeHash = await hashSignatureOtpCode(plain);
      const issuedAt = clock.nowIso();

      const created = await repo.create({
        tenantId: input.tenantId,
        envelopeId: input.envelopeId,
        signerId: input.signerId,
        sessionId,
        challengeType: input.method,
        codeHash,
        maxAttempts: input.maxAttempts,
        issuedAt,
        expiresAt: input.expiresAt,
      });

      return {
        challengeId: created.id,
        method: input.method,
        expiresAt: input.expiresAt,
        deliverySimulated: true,
        ...(options.exposePlainCodeInTests ? { testOnlyPlainCode: plain } : {}),
      };
    },

    async verifyChallenge(
      input: VerifySignatureAuthenticationChallengeInput & { tenantId?: string },
    ): Promise<VerifyAuthenticationChallengeResult> {
      const invalid = (): VerifyAuthenticationChallengeResult => ({
        valid: false,
        challengeId: input.challengeId,
        errorCode: 'SIGNATURE_AUTHENTICATION_FAILED',
      });

      if (!input.tenantId) return invalid();

      const challenge = await repo.findById(input.tenantId as never, input.challengeId);
      if (!challenge
        || challenge.envelopeId !== input.envelopeId
        || challenge.signerId !== input.signerId
        || challenge.status === 'INVALIDATED'
        || challenge.invalidatedAt) {
        return invalid();
      }
      if (challenge.status === 'CONSUMED' || challenge.status === 'VERIFIED' || challenge.consumedAt) {
        return {
          valid: false,
          challengeId: input.challengeId,
          errorCode: 'SIGNATURE_CHALLENGE_ALREADY_CONSUMED',
        };
      }
      if (challenge.status === 'EXPIRED' || Date.parse(challenge.expiresAt) <= clock.now().getTime()) {
        try {
          await repo.markExpired(
            challenge.tenantId,
            challenge.id,
            clock.nowIso(),
            challenge.rowVersion,
          );
        } catch {
          // best-effort
        }
        return {
          valid: false,
          challengeId: input.challengeId,
          errorCode: 'SIGNATURE_CHALLENGE_EXPIRED',
        };
      }
      if (challenge.status === 'LOCKED' || challenge.attemptCount >= challenge.maxAttempts) {
        return {
          valid: false,
          challengeId: input.challengeId,
          errorCode: 'SIGNATURE_CHALLENGE_ATTEMPTS_EXCEEDED',
          attemptsRemaining: 0,
        };
      }

      const codeHash = await hashSignatureOtpCode(input.code);
      if (!timingSafeEqualHex(codeHash, challenge.codeHash)) {
        const updated = await repo.recordFailedAttempt(
          challenge.tenantId,
          challenge.id,
          challenge.rowVersion,
        );
        if (updated.attemptCount >= updated.maxAttempts || updated.status === 'LOCKED') {
          return {
            valid: false,
            challengeId: input.challengeId,
            errorCode: 'SIGNATURE_CHALLENGE_ATTEMPTS_EXCEEDED',
            attemptsRemaining: 0,
          };
        }
        return {
          valid: false,
          challengeId: input.challengeId,
          errorCode: 'SIGNATURE_AUTHENTICATION_FAILED',
          attemptsRemaining: updated.maxAttempts - updated.attemptCount,
        };
      }

      const verified = await repo.markVerified(
        challenge.tenantId,
        challenge.id,
        clock.nowIso(),
        challenge.rowVersion,
      );
      return {
        valid: true,
        challengeId: input.challengeId,
        consumedAt: verified.consumedAt || verified.verifiedAt,
      };
    },

    async invalidateChallenges(
      envelopeId: SignatureEnvelopeId,
      signerId: SignatureSignerId,
    ): Promise<void> {
      // Contrato legado sem tenant — no-op se não houver resolver.
      void envelopeId;
      void signerId;
    },
  };
}

export async function invalidatePersistedChallenges(
  repo: SignatureAuthenticationChallengeRepository,
  tenantId: Parameters<SignatureAuthenticationChallengeRepository['invalidateActiveForSigner']>[0],
  envelopeId: SignatureEnvelopeId,
  signerId: SignatureSignerId,
  clock: ContractClock = createSystemContractClock(),
): Promise<void> {
  await repo.invalidateActiveForSigner(tenantId, envelopeId, signerId, clock.nowIso());
}
