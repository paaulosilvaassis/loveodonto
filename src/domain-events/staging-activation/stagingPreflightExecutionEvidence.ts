/**
 * @module domain-events/staging-activation/stagingPreflightExecutionEvidence
 * @description Evidence de preflight executado — Phase 8.7.
 */

import type {
  StagingPreflightEvidenceType,
  StagingPreflightExecutionEvidence,
} from './stagingPreflightExecutionTypes.js';

let seq = 0;

const SENSITIVE = /(password|secret|bearer\s|authorization:|api[_-]?key|token=)/i;

export function createStagingPreflightEvidence(input: {
  executionId: string;
  checkId: string;
  environmentId?: string | null;
  type: StagingPreflightEvidenceType;
  source: string;
  result: StagingPreflightExecutionEvidence['result'];
  detailsSanitized?: string;
  operator?: string | null;
}): StagingPreflightExecutionEvidence {
  seq += 1;
  const details = String(input.detailsSanitized || '').slice(0, 240);
  if (SENSITIVE.test(`${input.source} ${details}`)) {
    throw new Error('sensitive content rejected in preflight evidence');
  }
  const now = new Date().toISOString();
  return Object.freeze({
    evidenceId: `pf-ev-${seq}`,
    executionId: input.executionId,
    checkId: input.checkId,
    environmentId: input.environmentId ?? null,
    type: input.type,
    source: String(input.source || '').slice(0, 120),
    startedAt: now,
    finishedAt: now,
    result: input.result,
    detailsSanitized: details,
    operator: input.operator ?? null,
    isRemote: false,
  });
}

export function __resetStagingPreflightEvidenceSeqForTest(): void {
  seq = 0;
}
