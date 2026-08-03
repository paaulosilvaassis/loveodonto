/**
 * @module domain-events/staging-activation/readonly-verification/readonlyVerificationEvidence
 */

import type {
  ReadonlyEvidenceType,
  ReadonlyProbeResult,
  ReadonlyVerificationEvidence,
} from './readonlyVerificationTypes.js';

let evidenceSeq = 0;

const PROBE_EVIDENCE_TYPE: Record<string, ReadonlyEvidenceType> = {
  'verify-environment-identity': 'environment-identity',
  'verify-non-production-host': 'production-exclusion',
  'verify-project-reference': 'production-exclusion',
  'verify-tenant-existence': 'tenant-existence',
  'verify-flag-baseline-off': 'flag-baseline',
  'verify-production-guards': 'guard-verification',
  'verify-host-guards': 'guard-verification',
  'verify-architecture-version': 'architecture-version',
  'verify-certification-status': 'certification',
  'verify-inspector-availability': 'inspector-availability',
  'verify-health-availability': 'health-availability',
};

export function buildEvidenceFromProbe(
  sessionId: string,
  probe: ReadonlyProbeResult,
  operator: string | null,
): ReadonlyVerificationEvidence {
  evidenceSeq += 1;
  return Object.freeze({
    evidenceId: `ro-ev-${evidenceSeq}`,
    sessionId,
    probeId: String(probe.probeId),
    evidenceType: PROBE_EVIDENCE_TYPE[String(probe.probeId)] || 'manual-required',
    environmentId: probe.environmentId,
    tenantId: probe.tenantId,
    source: probe.isRemote ? 'remote-readonly' : 'local-static',
    startedAt: probe.startedAt,
    finishedAt: probe.finishedAt,
    result: probe.status,
    detailsSanitized: String(probe.resultSanitized || '').slice(0, 240),
    operator,
    isRemote: probe.isRemote,
  });
}

export function collectEvidenceFromProbes(
  sessionId: string,
  probes: readonly ReadonlyProbeResult[],
  operator: string | null,
): readonly ReadonlyVerificationEvidence[] {
  return Object.freeze(
    probes
      .filter((p) => p.status !== 'not_run')
      .map((p) => buildEvidenceFromProbe(sessionId, p, operator)),
  );
}

export function __resetReadonlyVerificationEvidenceSeqForTest(): void {
  evidenceSeq = 0;
}
