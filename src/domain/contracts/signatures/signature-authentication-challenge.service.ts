/**
 * @module domain/contracts/signatures/signature-authentication-challenge.service
 * @description Challenges OTP com hash — Phase 10.6.
 * Nunca armazena OTP em texto; delivery apenas simulado.
 */

import { createContractDomainError } from '../contract.errors.js';
import type { SignatureEnvelopeId, SignatureSignerId, TenantId } from '../contract.ids.js';
import type { SignatureMethod } from './signature.types.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import { createContractContentHasher } from '../hash/contract-content-hasher.js';

export interface CreateSignatureAuthenticationChallengeInput {
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  signerId: SignatureSignerId;
  method: SignatureMethod;
  maxAttempts: number;
  expiresAt: string;
  /** Obrigatório no fluxo persistido (Phase 10.10). */
  sessionId?: string;
}

export interface CreatedAuthenticationChallenge {
  challengeId: string;
  method: SignatureMethod;
  expiresAt: string;
  /** Somente harness de teste — nunca logar em produção. */
  testOnlyPlainCode?: string;
  deliverySimulated: true;
}

export interface VerifySignatureAuthenticationChallengeInput {
  challengeId: string;
  code: string;
  envelopeId: SignatureEnvelopeId;
  signerId: SignatureSignerId;
}

export interface VerifyAuthenticationChallengeResult {
  valid: boolean;
  challengeId: string;
  consumedAt?: string;
  attemptsRemaining?: number;
  errorCode?: string;
}

export interface SignatureAuthenticationChallengeService {
  createChallenge(
    input: CreateSignatureAuthenticationChallengeInput,
  ): Promise<CreatedAuthenticationChallenge>;

  verifyChallenge(
    input: VerifySignatureAuthenticationChallengeInput,
  ): Promise<VerifyAuthenticationChallengeResult>;

  invalidateChallenges(
    envelopeId: SignatureEnvelopeId,
    signerId: SignatureSignerId,
  ): Promise<void>;
}

interface StoredChallenge {
  challengeId: string;
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  signerId: SignatureSignerId;
  method: SignatureMethod;
  codeHash: string;
  expiresAt: string;
  maxAttempts: number;
  attempts: number;
  consumedAt?: string;
  invalidatedAt?: string;
}

async function hashCode(code: string): Promise<string> {
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

export function createMemorySignatureAuthenticationChallengeService(
  clock: ContractClock = createSystemContractClock(),
  options: { deterministicCode?: string; exposePlainCodeInTests?: boolean } = {},
): SignatureAuthenticationChallengeService {
  const store = new Map<string, StoredChallenge>();
  let seq = 0;

  return {
    async createChallenge(input) {
      // Invalida challenges anteriores do mesmo signer
      for (const [id, c] of store.entries()) {
        if (c.envelopeId === input.envelopeId && c.signerId === input.signerId && !c.consumedAt) {
          c.invalidatedAt = clock.nowIso();
          store.set(id, c);
        }
      }

      seq += 1;
      const challengeId = `sch_${seq.toString(36)}`;
      const plain = generateCode(options.deterministicCode);
      const codeHash = await hashCode(plain);
      store.set(challengeId, {
        challengeId,
        tenantId: input.tenantId,
        envelopeId: input.envelopeId,
        signerId: input.signerId,
        method: input.method,
        codeHash,
        expiresAt: input.expiresAt,
        maxAttempts: input.maxAttempts,
        attempts: 0,
      });

      return {
        challengeId,
        method: input.method,
        expiresAt: input.expiresAt,
        deliverySimulated: true,
        ...(options.exposePlainCodeInTests ? { testOnlyPlainCode: plain } : {}),
      };
    },

    async verifyChallenge(input) {
      const challenge = store.get(input.challengeId);
      // Resposta genérica — não revela existência
      const invalid = (): VerifyAuthenticationChallengeResult => ({
        valid: false,
        challengeId: input.challengeId,
        errorCode: 'SIGNATURE_AUTHENTICATION_FAILED',
      });

      if (!challenge
        || challenge.envelopeId !== input.envelopeId
        || challenge.signerId !== input.signerId
        || challenge.invalidatedAt) {
        return invalid();
      }
      if (challenge.consumedAt) {
        return {
          valid: false,
          challengeId: input.challengeId,
          errorCode: 'SIGNATURE_CHALLENGE_ALREADY_CONSUMED',
        };
      }
      if (Date.parse(challenge.expiresAt) <= clock.now().getTime()) {
        return {
          valid: false,
          challengeId: input.challengeId,
          errorCode: 'SIGNATURE_CHALLENGE_EXPIRED',
        };
      }
      if (challenge.attempts >= challenge.maxAttempts) {
        return {
          valid: false,
          challengeId: input.challengeId,
          errorCode: 'SIGNATURE_CHALLENGE_ATTEMPTS_EXCEEDED',
          attemptsRemaining: 0,
        };
      }

      challenge.attempts += 1;
      const codeHash = await hashCode(input.code);
      if (codeHash !== challenge.codeHash) {
        store.set(challenge.challengeId, challenge);
        if (challenge.attempts >= challenge.maxAttempts) {
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
          attemptsRemaining: challenge.maxAttempts - challenge.attempts,
        };
      }

      const consumedAt = clock.nowIso();
      challenge.consumedAt = consumedAt;
      store.set(challenge.challengeId, challenge);
      return { valid: true, challengeId: input.challengeId, consumedAt };
    },

    async invalidateChallenges(envelopeId, signerId) {
      for (const [id, c] of store.entries()) {
        if (c.envelopeId === envelopeId && c.signerId === signerId) {
          c.invalidatedAt = clock.nowIso();
          store.set(id, c);
        }
      }
    },
  };
}

export function mapChallengeError(code?: string) {
  if (!code) return createContractDomainError('SIGNATURE_AUTHENTICATION_FAILED', 'Autenticação falhou.');
  return createContractDomainError(code as never, 'Autenticação falhou.', 'challenge');
}
