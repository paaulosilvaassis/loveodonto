/**
 * @module domain-events/shared/domainEventRetry
 * @description Contratos e política base de retry — Phase 7.0.
 * Não executa retries reais nesta phase.
 */

export interface DomainEventRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

export interface DomainEventRetryState {
  attempt: number;
  lastError: string | null;
  nextDelayMs: number;
  exhausted: boolean;
}

export const DOMAIN_EVENT_RETRY_POLICY_DEFAULT: Readonly<DomainEventRetryPolicy> = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 5_000,
  jitter: false,
};

/** Calcula delay exponencial (sem sleep). */
export function computeDomainEventRetryDelay(
  attempt: number,
  policy: DomainEventRetryPolicy = DOMAIN_EVENT_RETRY_POLICY_DEFAULT,
): number {
  const safeAttempt = Math.max(0, attempt);
  const raw = policy.baseDelayMs * (2 ** safeAttempt);
  let delay = Math.min(raw, policy.maxDelayMs);
  if (policy.jitter) {
    delay = Math.floor(delay * (0.5 + Math.random() * 0.5));
  }
  return delay;
}

/**
 * Avalia se ainda há tentativas — não executa retry.
 */
export function evaluateDomainEventRetry(
  attempt: number,
  error?: unknown,
  policy: DomainEventRetryPolicy = DOMAIN_EVENT_RETRY_POLICY_DEFAULT,
): DomainEventRetryState {
  const nextAttempt = Math.max(0, attempt);
  const exhausted = nextAttempt >= policy.maxAttempts;
  return {
    attempt: nextAttempt,
    lastError: error instanceof Error ? error.message : (error ? String(error) : null),
    nextDelayMs: exhausted ? 0 : computeDomainEventRetryDelay(nextAttempt, policy),
    exhausted,
  };
}

/**
 * Contrato de execução com retry — foundation only.
 * Nesta phase: executa UMA vez; não re-tenta de fato.
 */
export async function runWithDomainEventRetryContract<T>(
  runner: () => Promise<T>,
  policy: DomainEventRetryPolicy = DOMAIN_EVENT_RETRY_POLICY_DEFAULT,
): Promise<{ result: T | null; state: DomainEventRetryState }> {
  try {
    const result = await runner();
    return {
      result,
      state: {
        attempt: 0,
        lastError: null,
        nextDelayMs: 0,
        exhausted: false,
      },
    };
  } catch (err) {
    return {
      result: null,
      state: evaluateDomainEventRetry(1, err, policy),
    };
  }
}
