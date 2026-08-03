/**
 * @module domain/contracts/runtime/contracts-v2-correlation
 * @description Request / correlation IDs — Phase 10.12.
 */

import { randomBytes } from 'node:crypto';

const ID_RE = /^[A-Za-z0-9._-]{8,128}$/;

export interface ContractsV2RequestIds {
  requestId: string;
  correlationId: string;
  clientProvidedIgnored: boolean;
}

export function generateContractsV2Id(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

export function isValidClientId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value.trim());
}

/**
 * Gera IDs server-side. Client IDs inválidos são ignorados (não confiamos cegamente).
 * Correlation pode herdar um client válido; requestId sempre server-generated.
 */
export function resolveContractsV2RequestIds(input: {
  clientRequestId?: unknown;
  clientCorrelationId?: unknown;
}): ContractsV2RequestIds {
  const requestId = generateContractsV2Id('req');
  let clientProvidedIgnored = false;
  let correlationId: string;

  if (isValidClientId(input.clientCorrelationId)) {
    correlationId = String(input.clientCorrelationId).trim();
  } else {
    if (input.clientCorrelationId != null && String(input.clientCorrelationId).trim() !== '') {
      clientProvidedIgnored = true;
    }
    correlationId = generateContractsV2Id('corr');
  }

  if (input.clientRequestId != null && !isValidClientId(input.clientRequestId)) {
    clientProvidedIgnored = true;
  }

  return { requestId, correlationId, clientProvidedIgnored };
}
