/**
 * @module domain-events/certification/cqrsCertificationEvidence
 * @description Evidence Model in-memory — Phase 8.5.
 * Sem persistência. Sem dados sensíveis.
 */

import type {
  CqrsCertificationEvidence,
  CqrsCertificationEvidenceType,
  CqrsCertificationGateId,
} from './cqrsCertificationTypes.js';

let seq = 0;

export function createCqrsCertificationEvidence(input: {
  gateId: CqrsCertificationGateId;
  source: string;
  type: CqrsCertificationEvidenceType;
  description: string;
  result: CqrsCertificationEvidence['result'];
  detailsSanitized?: string;
}): CqrsCertificationEvidence {
  seq += 1;
  return Object.freeze({
    evidenceId: `ev-${input.gateId}-${seq}`,
    gateId: input.gateId,
    source: String(input.source || '').slice(0, 120),
    type: input.type,
    description: String(input.description || '').slice(0, 240),
    result: input.result,
    timestamp: new Date().toISOString(),
    detailsSanitized: String(input.detailsSanitized || '').slice(0, 240),
  });
}

export function assertCqrsCertificationEvidenceValid(
  evidence: CqrsCertificationEvidence | null | undefined,
): { valid: boolean; reason?: string } {
  if (!evidence) return { valid: false, reason: 'missing evidence' };
  if (!evidence.evidenceId || !evidence.gateId) return { valid: false, reason: 'incomplete identity' };
  if (!evidence.source || !evidence.type || !evidence.description) {
    return { valid: false, reason: 'incomplete fields' };
  }
  if (!['pass', 'fail', 'warn', 'pending'].includes(evidence.result)) {
    return { valid: false, reason: 'invalid result' };
  }
  // Rejeitar indícios de PII/token em detalhes
  const blob = `${evidence.description} ${evidence.detailsSanitized}`.toLowerCase();
  if (/(password|secret|bearer\s|authorization:|api[_-]?key)/i.test(blob)) {
    return { valid: false, reason: 'sensitive content detected' };
  }
  return { valid: true };
}

export function __resetCqrsCertificationEvidenceSeqForTest(): void {
  seq = 0;
}
