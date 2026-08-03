/**
 * @module domain/contracts/signatures/signing-session-token.service
 * @description Tokens opacos de sessão de assinatura — Phase 10.6.
 * Armazena somente hash; nunca loga token bruto.
 */

import { createContractDomainError } from '../contract.errors.js';
import type { SignatureEnvelopeId, SignatureSignerId, TenantId } from '../contract.ids.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import { createContractContentHasher } from '../hash/contract-content-hasher.js';

export interface IssueSigningSessionTokenInput {
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  signerId: SignatureSignerId;
  expiresAt: string;
}

export interface IssuedSigningSessionToken {
  tokenId: string;
  /** Token bruto — somente retornado na emissão; não persistir. */
  token: string;
  tokenHash: string;
  expiresAt: string;
}

export interface ValidatedSigningSessionToken {
  tokenId: string;
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  signerId: SignatureSignerId;
  expiresAt: string;
}

export interface SigningSessionTokenService {
  issue(input: IssueSigningSessionTokenInput): Promise<IssuedSigningSessionToken>;
  validate(token: string): Promise<ValidatedSigningSessionToken>;
  revoke(tokenId: string): Promise<void>;
  revokeForEnvelope(envelopeId: SignatureEnvelopeId): Promise<void>;
}

interface StoredSession {
  tokenId: string;
  tokenHash: string;
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  signerId: SignatureSignerId;
  expiresAt: string;
  revokedAt?: string;
}

function randomToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback não usado em produção desta fase — testes Node têm crypto
  return `tok_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

async function hashToken(token: string): Promise<string> {
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

export function createMemorySigningSessionTokenService(
  clock: ContractClock = createSystemContractClock(),
  options: { deterministicToken?: string } = {},
): SigningSessionTokenService {
  const byId = new Map<string, StoredSession>();
  const byHash = new Map<string, string>();
  let seq = 0;

  return {
    async issue(input) {
      seq += 1;
      const tokenId = `sst_${seq.toString(36)}_${Date.now().toString(36)}`;
      const token = options.deterministicToken
        ? `${options.deterministicToken}_${seq}`
        : randomToken();
      const tokenHash = await hashToken(token);
      const stored: StoredSession = {
        tokenId,
        tokenHash,
        tenantId: input.tenantId,
        envelopeId: input.envelopeId,
        signerId: input.signerId,
        expiresAt: input.expiresAt,
      };
      byId.set(tokenId, stored);
      byHash.set(tokenHash, tokenId);
      return { tokenId, token, tokenHash, expiresAt: input.expiresAt };
    },

    async validate(token) {
      if (!String(token || '').trim()) {
        throw Object.assign(new Error('Sessão inválida.'), {
          domainError: createContractDomainError(
            'SIGNATURE_SESSION_INVALID',
            'Sessão inválida.',
            'token',
          ),
        });
      }
      const tokenHash = await hashToken(token);
      const tokenId = byHash.get(tokenHash);
      const stored = tokenId ? byId.get(tokenId) : null;
      if (!stored) {
        throw Object.assign(new Error('Sessão inválida.'), {
          domainError: createContractDomainError(
            'SIGNATURE_SESSION_INVALID',
            'Sessão inválida.',
            'token',
          ),
        });
      }
      if (stored.revokedAt) {
        throw Object.assign(new Error('Sessão revogada.'), {
          domainError: createContractDomainError(
            'SIGNATURE_SESSION_REVOKED',
            'Sessão revogada.',
            'token',
          ),
        });
      }
      if (Date.parse(stored.expiresAt) <= clock.now().getTime()) {
        throw Object.assign(new Error('Sessão expirada.'), {
          domainError: createContractDomainError(
            'SIGNATURE_SESSION_EXPIRED',
            'Sessão expirada.',
            'token',
          ),
        });
      }
      return {
        tokenId: stored.tokenId,
        tenantId: stored.tenantId,
        envelopeId: stored.envelopeId,
        signerId: stored.signerId,
        expiresAt: stored.expiresAt,
      };
    },

    async revoke(tokenId) {
      const stored = byId.get(tokenId);
      if (stored) {
        stored.revokedAt = clock.nowIso();
        byId.set(tokenId, stored);
      }
    },

    async revokeForEnvelope(envelopeId) {
      for (const [id, stored] of byId.entries()) {
        if (stored.envelopeId === envelopeId && !stored.revokedAt) {
          stored.revokedAt = clock.nowIso();
          byId.set(id, stored);
        }
      }
    },
  };
}
