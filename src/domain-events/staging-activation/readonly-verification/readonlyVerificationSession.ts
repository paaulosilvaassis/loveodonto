/**
 * @module domain-events/staging-activation/readonly-verification/readonlyVerificationSession
 */

import { buildSafeReadonlyCapabilities } from './readonlyVerificationCapabilities.js';
import type {
  ReadonlyVerificationCapabilities,
  ReadonlyVerificationEvidence,
  ReadonlyVerificationResult,
  ReadonlyVerificationSession,
  ReadonlyVerificationSessionMode,
  ReadonlyProbeResult,
} from './readonlyVerificationTypes.js';

let sessionSeq = 0;

export function createReadonlyVerificationSession(args: {
  mode?: ReadonlyVerificationSessionMode;
  verificationApprovalId?: string | null;
  authorizationPackageId?: string | null;
  environmentId?: string | null;
  tenantIds?: readonly string[];
  operator?: string | null;
  capabilities?: ReadonlyVerificationCapabilities;
  result?: ReadonlyVerificationResult;
  blockers?: readonly string[];
  warnings?: readonly string[];
  probes?: readonly ReadonlyProbeResult[];
  evidence?: readonly ReadonlyVerificationEvidence[];
  finishedAt?: string | null;
}): ReadonlyVerificationSession {
  sessionSeq += 1;
  const mode = args.mode || 'local-static';
  const simulationOnly = mode === 'local-simulated' || mode === 'local-static';
  return Object.freeze({
    sessionId: `ro-session-${sessionSeq}`,
    verificationApprovalId: args.verificationApprovalId ?? null,
    authorizationPackageId: args.authorizationPackageId ?? null,
    environmentId: args.environmentId ?? null,
    tenantIds: Object.freeze([...(args.tenantIds || [])]),
    mode,
    startedAt: new Date().toISOString(),
    finishedAt: args.finishedAt ?? null,
    operator: args.operator ?? null,
    capabilities: args.capabilities || buildSafeReadonlyCapabilities({ readOnlyGuaranteed: false }),
    probes: Object.freeze([...(args.probes || [])]),
    evidence: Object.freeze([...(args.evidence || [])]),
    blockers: Object.freeze([...(args.blockers || [])]),
    warnings: Object.freeze([...(args.warnings || [])]),
    result: args.result || 'not_started',
    remoteConnectionOpened: false as const,
    remoteReadsExecuted: false as const,
    remoteWritesExecuted: false as const,
    flagsChanged: false as const,
    simulationOnly,
  });
}

export function __resetReadonlyVerificationSessionSeqForTest(): void {
  sessionSeq = 0;
}
