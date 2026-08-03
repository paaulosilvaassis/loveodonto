/**
 * @module domain-events/consumers/domainEventConsumerRetry
 * @description Política de retry estrutural — Phase 7.6.
 * Sem reexecução automática em runtime (flag OFF / sem timers).
 */

import {
  computeDomainEventRetryDelay,
  DOMAIN_EVENT_RETRY_POLICY_DEFAULT,
  type DomainEventRetryPolicy,
} from '../shared/domainEventRetry.js';

export interface DomainEventConsumerRetryPolicy extends DomainEventRetryPolicy {
  retryableErrorCodes: readonly string[];
  nonRetryableErrorCodes: readonly string[];
}

export const DOMAIN_EVENT_CONSUMER_RETRY_POLICY_DEFAULT: Readonly<DomainEventConsumerRetryPolicy> = {
  ...DOMAIN_EVENT_RETRY_POLICY_DEFAULT,
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 5_000,
  jitter: false,
  retryableErrorCodes: ['TIMEOUT', 'TRANSIENT', 'UNKNOWN'],
  nonRetryableErrorCodes: ['CONTRACT', 'VALIDATION', 'NON_RETRYABLE'],
};

export interface DomainEventConsumerRetryEvaluation {
  shouldRetry: boolean;
  attempt: number;
  maxAttempts: number;
  nextDelayMs: number;
  nextAttemptAt: string | null;
  reason: string;
  exhausted: boolean;
}

export function classifyDomainEventConsumerError(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: string }).code || 'UNKNOWN');
  }
  const msg = error instanceof Error ? error.message : String(error || '');
  if (/timeout/i.test(msg)) return 'TIMEOUT';
  if (/valid|contract/i.test(msg)) return 'VALIDATION';
  return 'UNKNOWN';
}

/**
 * Avalia retry — NÃO agenda timers. Apenas contrato.
 */
export function evaluateDomainEventConsumerRetry(input: {
  attempt: number;
  maxAttempts: number;
  error?: unknown;
  policy?: DomainEventConsumerRetryPolicy;
  retryEnabled: boolean;
}): DomainEventConsumerRetryEvaluation {
  const policy = input.policy || DOMAIN_EVENT_CONSUMER_RETRY_POLICY_DEFAULT;
  const attempt = Math.max(0, input.attempt);
  const maxAttempts = Math.max(1, input.maxAttempts || policy.maxAttempts);
  const code = classifyDomainEventConsumerError(input.error);

  if (!input.retryEnabled) {
    return {
      shouldRetry: false,
      attempt,
      maxAttempts,
      nextDelayMs: 0,
      nextAttemptAt: null,
      reason: 'DOMAIN_EVENT_CONSUMER_RETRY=false',
      exhausted: true,
    };
  }

  if (policy.nonRetryableErrorCodes.includes(code)) {
    return {
      shouldRetry: false,
      attempt,
      maxAttempts,
      nextDelayMs: 0,
      nextAttemptAt: null,
      reason: `non-retryable:${code}`,
      exhausted: true,
    };
  }

  const nextAttempt = attempt + 1;
  if (nextAttempt >= maxAttempts) {
    return {
      shouldRetry: false,
      attempt,
      maxAttempts,
      nextDelayMs: 0,
      nextAttemptAt: null,
      reason: 'maxAttempts exhausted',
      exhausted: true,
    };
  }

  const delay = computeDomainEventRetryDelay(nextAttempt, policy);
  return {
    shouldRetry: true,
    attempt,
    maxAttempts,
    nextDelayMs: delay,
    nextAttemptAt: new Date(Date.now() + delay).toISOString(),
    reason: `retryable:${code}`,
    exhausted: false,
  };
}
