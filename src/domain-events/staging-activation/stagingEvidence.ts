/**
 * @module domain-events/staging-activation/stagingEvidence
 * @description Evidence Collection Contract — Phase 8.6.
 * Sem persistência. Sem execução remota.
 */

import type {
  StagingEvidenceRecord,
  StagingEvidenceRequirement,
  StagingEvidenceType,
  StagingActivationStageId,
} from './stagingActivationTypes.js';

export const STAGING_EVIDENCE_REQUIREMENTS: readonly StagingEvidenceRequirement[] = Object.freeze([
  Object.freeze({ type: 'preflight' as const, required: true, description: 'resultado preflight' }),
  Object.freeze({ type: 'flag-resolution' as const, required: true, description: 'resolução de flags' }),
  Object.freeze({ type: 'event-observability' as const, required: true, description: 'observabilidade' }),
  Object.freeze({ type: 'consumer' as const, required: true, description: 'consumers/audit' }),
  Object.freeze({ type: 'projection' as const, required: true, description: 'analytics projection' }),
  Object.freeze({ type: 'read-model' as const, required: true, description: 'read models' }),
  Object.freeze({ type: 'soak' as const, required: true, description: 'soak 48–72h' }),
  Object.freeze({ type: 'consistency' as const, required: true, description: 'consistency' }),
  Object.freeze({ type: 'drift' as const, required: true, description: 'drift' }),
  Object.freeze({ type: 'tenant-isolation' as const, required: true, description: 'isolamento multi-tenant' }),
  Object.freeze({ type: 'rollback' as const, required: true, description: 'rollback drill' }),
  Object.freeze({ type: 'manual-review' as const, required: true, description: 'revisão humana' }),
]);

let evSeq = 0;

/** Cria registro estrutural pending (não coleta remota). */
export function createStagingEvidenceRecord(input: {
  planId: string;
  stageId: StagingActivationStageId;
  type: StagingEvidenceType;
  source: string;
  environmentId?: string | null;
  tenantId?: string | null;
  operator?: string | null;
}): StagingEvidenceRecord {
  evSeq += 1;
  return Object.freeze({
    evidenceId: `stg-ev-${evSeq}`,
    planId: input.planId,
    stageId: input.stageId,
    environmentId: input.environmentId ?? null,
    tenantId: input.tenantId ?? null,
    type: input.type,
    source: String(input.source || '').slice(0, 120),
    startedAt: null,
    finishedAt: null,
    result: 'pending',
    metrics: null,
    health: null,
    drifts: null,
    errorsSanitized: Object.freeze([] as string[]),
    operator: input.operator ?? null,
  });
}

export function __resetStagingEvidenceSeqForTest(): void {
  evSeq = 0;
}
