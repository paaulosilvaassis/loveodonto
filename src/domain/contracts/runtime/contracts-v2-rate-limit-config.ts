/**
 * @module domain/contracts/runtime/contracts-v2-rate-limit-config
 * @description Matriz centralizada de rate limits públicos — Phase 10.12.
 */

export interface RateLimitRule {
  windowSeconds: number;
  maxAttempts: number;
  /** Escopos combinados na chave (sem token bruto / PII). */
  scopes: Array<'ip' | 'session' | 'signer' | 'envelope' | 'operation' | 'tenant'>;
}

export interface PublicSigningRateLimitConfig {
  open: RateLimitRule;
  view: RateLimitRule;
  requestChallenge: RateLimitRule;
  verifyChallenge: RateLimitRule;
  acceptTerms: RateLimitRule;
  sign: RateLimitRule;
  decline: RateLimitRule;
  status: RateLimitRule;
  document: RateLimitRule;
}

export type PublicSigningRateLimitOperation = keyof PublicSigningRateLimitConfig;

/** Valores conservadores para testes / local-integration. Staging revisa antes de ativar. */
export const DEFAULT_PUBLIC_SIGNING_RATE_LIMITS: PublicSigningRateLimitConfig = {
  open: {
    windowSeconds: 60,
    maxAttempts: 30,
    scopes: ['ip', 'operation'],
  },
  view: {
    windowSeconds: 60,
    maxAttempts: 60,
    scopes: ['ip', 'session', 'operation'],
  },
  requestChallenge: {
    windowSeconds: 300,
    maxAttempts: 5,
    scopes: ['ip', 'signer', 'operation'],
  },
  verifyChallenge: {
    windowSeconds: 300,
    maxAttempts: 10,
    scopes: ['ip', 'session', 'operation'],
  },
  acceptTerms: {
    windowSeconds: 300,
    maxAttempts: 20,
    scopes: ['ip', 'session', 'operation'],
  },
  sign: {
    windowSeconds: 300,
    maxAttempts: 10,
    scopes: ['ip', 'session', 'envelope', 'operation'],
  },
  decline: {
    windowSeconds: 300,
    maxAttempts: 10,
    scopes: ['ip', 'session', 'operation'],
  },
  status: {
    windowSeconds: 60,
    maxAttempts: 60,
    scopes: ['ip', 'operation'],
  },
  document: {
    windowSeconds: 60,
    maxAttempts: 30,
    scopes: ['ip', 'session', 'operation'],
  },
};

export type ContractsV2RateLimitMode = 'memory-test' | 'persisted' | 'disabled';

export function getRateLimitRule(
  config: PublicSigningRateLimitConfig,
  operation: PublicSigningRateLimitOperation,
): RateLimitRule {
  return config[operation];
}

export function buildRateLimitKey(parts: {
  operation: string;
  ipHash?: string | null;
  sessionId?: string | null;
  signerIdHash?: string | null;
  envelopeId?: string | null;
  tenantIdHash?: string | null;
  scopes: RateLimitRule['scopes'];
}): string {
  const segments: string[] = [`op:${parts.operation}`];
  for (const scope of parts.scopes) {
    if (scope === 'ip' && parts.ipHash) segments.push(`ip:${parts.ipHash}`);
    if (scope === 'session' && parts.sessionId) segments.push(`sess:${parts.sessionId}`);
    if (scope === 'signer' && parts.signerIdHash) segments.push(`sig:${parts.signerIdHash}`);
    if (scope === 'envelope' && parts.envelopeId) segments.push(`env:${parts.envelopeId}`);
    if (scope === 'tenant' && parts.tenantIdHash) segments.push(`ten:${parts.tenantIdHash}`);
    if (scope === 'operation') {
      /* already in op */
    }
  }
  return segments.join('|');
}
