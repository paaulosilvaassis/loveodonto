/**
 * @module domain-events/staging-activation/stagingFlagMatrix
 * @description Matriz de flags + ordem de ativação — Phase 8.6.
 */

import type { DomainEventFlagKey } from '../domainEventFlags.js';
import type {
  StagingActivationStage,
  StagingActivationStageId,
  StagingFlagMatrixRow,
} from './stagingActivationTypes.js';

function row(
  partial: Omit<StagingFlagMatrixRow, 'defaultValue' | 'allowedEnvironments'> & {
    allowedEnvironments?: StagingFlagMatrixRow['allowedEnvironments'];
  },
): StagingFlagMatrixRow {
  return Object.freeze({
    ...partial,
    allowedEnvironments: Object.freeze(
      partial.allowedEnvironments || (['staging', 'local-simulated'] as const),
    ),
    dependencies: Object.freeze([...partial.dependencies]),
    preconditions: Object.freeze([...partial.preconditions]),
    requiredMetrics: Object.freeze([...partial.requiredMetrics]),
    defaultValue: false,
  });
}

/** Matriz normativa Flag → deps → ambiente → pré-condições → efeito → métricas → rollback. */
export const STAGING_FLAG_MATRIX: readonly StagingFlagMatrixRow[] = Object.freeze([
  row({
    flag: 'DOMAIN_EVENTS',
    dependencies: [],
    preconditions: ['architecture certified', 'staging authorized', 'human approved'],
    expectedEffect: 'habilita bus/dispatcher de domain events (in-memory)',
    requiredMetrics: ['published', 'rejected'],
    rollbackAction: 'set DOMAIN_EVENTS=false',
    stageId: 'observability',
  }),
  row({
    flag: 'DOMAIN_EVENT_AUDIT',
    dependencies: ['DOMAIN_EVENTS'],
    preconditions: ['DOMAIN_EVENTS=true'],
    expectedEffect: 'audit hooks in-memory',
    requiredMetrics: ['auditRecords'],
    rollbackAction: 'set DOMAIN_EVENT_AUDIT=false',
    stageId: 'observability',
  }),
  row({
    flag: 'DOMAIN_EVENT_OBSERVABILITY',
    dependencies: ['DOMAIN_EVENTS'],
    preconditions: ['DOMAIN_EVENTS=true'],
    expectedEffect: 'metrics/trace/health inspector',
    requiredMetrics: ['traces', 'health'],
    rollbackAction: 'set DOMAIN_EVENT_OBSERVABILITY=false',
    stageId: 'observability',
  }),
  row({
    flag: 'DOMAIN_EVENT_CONSUMERS',
    dependencies: ['DOMAIN_EVENTS'],
    preconditions: ['observability stage reviewed'],
    expectedEffect: 'consumer runner/dispatcher foundation',
    requiredMetrics: ['consumed', 'deadLetter'],
    rollbackAction: 'set DOMAIN_EVENT_CONSUMERS=false',
    stageId: 'audit_projection',
  }),
  row({
    flag: 'DOMAIN_EVENT_CONSUMER_AUDIT',
    dependencies: ['DOMAIN_EVENT_CONSUMERS'],
    preconditions: ['DOMAIN_EVENT_CONSUMERS=true'],
    expectedEffect: 'audit consumer opt-in',
    requiredMetrics: ['consumerAudit'],
    rollbackAction: 'set DOMAIN_EVENT_CONSUMER_AUDIT=false',
    stageId: 'audit_projection',
  }),
  row({
    flag: 'DOMAIN_EVENT_PROJECTION',
    dependencies: ['DOMAIN_EVENTS', 'DOMAIN_EVENT_CONSUMERS'],
    preconditions: ['somente consumer de auditoria nesta etapa'],
    expectedEffect: 'event audit projection in-memory',
    requiredMetrics: ['projectionCount'],
    rollbackAction: 'set DOMAIN_EVENT_PROJECTION=false',
    stageId: 'audit_projection',
  }),
  row({
    flag: 'DOMAIN_EVENT_ANALYTICS',
    dependencies: ['DOMAIN_EVENTS', 'DOMAIN_EVENT_CONSUMERS'],
    preconditions: ['tenant-scoped projections', 'zero leakage'],
    expectedEffect: 'analytics counters tenant-scoped',
    requiredMetrics: ['projectionHealth', 'tenantIsolationFailures'],
    rollbackAction: 'set DOMAIN_EVENT_ANALYTICS=false',
    stageId: 'analytics_projection',
  }),
  row({
    flag: 'CQRS_READ_MODEL',
    dependencies: ['DOMAIN_EVENTS', 'DOMAIN_EVENT_ANALYTICS'],
    preconditions: ['analytics Health saudável', 'tenant scope'],
    expectedEffect: 'CQRS read model foundation',
    requiredMetrics: ['buildAttempts', 'cacheHits'],
    rollbackAction: 'set CQRS_READ_MODEL=false',
    stageId: 'cqrs_foundation',
  }),
  row({
    flag: 'CQRS_READ_MODEL_CONSISTENCY',
    dependencies: ['CQRS_READ_MODEL'],
    preconditions: ['CQRS_READ_MODEL=true'],
    expectedEffect: 'consistency checks explícitos',
    requiredMetrics: ['consistent', 'drifts'],
    rollbackAction: 'set CQRS_READ_MODEL_CONSISTENCY=false',
    stageId: 'cqrs_foundation',
  }),
  row({
    flag: 'CQRS_READ_MODEL_SOAK',
    dependencies: ['CQRS_READ_MODEL'],
    preconditions: ['CQRS_READ_MODEL=true'],
    expectedEffect: 'soak runner explícito (sem cron)',
    requiredMetrics: ['soakStatus', 'isolationFailures'],
    rollbackAction: 'set CQRS_READ_MODEL_SOAK=false',
    stageId: 'cqrs_foundation',
  }),
  row({
    flag: 'LEAD_ANALYTICS_READ_MODEL',
    dependencies: ['CQRS_READ_MODEL', 'DOMAIN_EVENT_ANALYTICS', 'DOMAIN_EVENTS'],
    preconditions: ['sequential activation only'],
    expectedEffect: 'lead-analytics read model',
    requiredMetrics: ['leadSnapshot', 'leadDrift'],
    rollbackAction: 'set LEAD_ANALYTICS_READ_MODEL=false',
    stageId: 'lead_read_model',
  }),
  row({
    flag: 'APPOINTMENT_ANALYTICS_READ_MODEL',
    dependencies: ['CQRS_READ_MODEL', 'DOMAIN_EVENT_ANALYTICS', 'DOMAIN_EVENTS'],
    preconditions: ['lead stage reviewed'],
    expectedEffect: 'appointment-analytics read model',
    requiredMetrics: ['appointmentSnapshot', 'appointmentDrift'],
    rollbackAction: 'set APPOINTMENT_ANALYTICS_READ_MODEL=false',
    stageId: 'appointment_read_model',
  }),
  row({
    flag: 'FINANCIAL_ANALYTICS_READ_MODEL',
    dependencies: ['CQRS_READ_MODEL', 'DOMAIN_EVENT_ANALYTICS', 'DOMAIN_EVENTS'],
    preconditions: ['appointment stage reviewed'],
    expectedEffect: 'financial-analytics read model',
    requiredMetrics: ['financialSnapshot', 'financialDrift'],
    rollbackAction: 'set FINANCIAL_ANALYTICS_READ_MODEL=false',
    stageId: 'financial_read_model',
  }),
]);

const stage = (
  stageId: StagingActivationStageId,
  order: number,
  flagsToEnable: DomainEventFlagKey[],
  description: string,
  requiresPriorStage: StagingActivationStageId | null,
): StagingActivationStage => Object.freeze({
  stageId,
  order,
  flagsToEnable: Object.freeze([...flagsToEnable]),
  description,
  requiresPriorStage,
});

/** Ordem obrigatória de ativação (nunca todos os RMs juntos na 1ª execução). */
export const STAGING_ACTIVATION_STAGES: readonly StagingActivationStage[] = Object.freeze([
  stage('preflight', 0, [], 'Preflight estructural — sem flags', null),
  stage('observability', 1, [
    'DOMAIN_EVENTS',
    'DOMAIN_EVENT_AUDIT',
    'DOMAIN_EVENT_OBSERVABILITY',
  ], 'Etapa 1 — Observabilidade sem consumers', 'preflight'),
  stage('audit_projection', 2, [
    'DOMAIN_EVENT_CONSUMERS',
    'DOMAIN_EVENT_CONSUMER_AUDIT',
    'DOMAIN_EVENT_PROJECTION',
  ], 'Etapa 2 — Audit Projection Pilot', 'observability'),
  stage('analytics_projection', 3, [
    'DOMAIN_EVENT_ANALYTICS',
  ], 'Etapa 3 — Analytics Projection tenant-scoped', 'audit_projection'),
  stage('cqrs_foundation', 4, [
    'CQRS_READ_MODEL',
    'CQRS_READ_MODEL_CONSISTENCY',
    'CQRS_READ_MODEL_SOAK',
  ], 'Etapa 4 — CQRS Foundation', 'analytics_projection'),
  stage('lead_read_model', 5, [
    'LEAD_ANALYTICS_READ_MODEL',
  ], 'Etapa 5a — Lead Analytics (1º RM)', 'cqrs_foundation'),
  stage('appointment_read_model', 6, [
    'APPOINTMENT_ANALYTICS_READ_MODEL',
  ], 'Etapa 5b — Appointment Analytics (2º RM)', 'lead_read_model'),
  stage('financial_read_model', 7, [
    'FINANCIAL_ANALYTICS_READ_MODEL',
  ], 'Etapa 5c — Financial Analytics (3º RM)', 'appointment_read_model'),
  stage('rollback_drill', 8, [], 'Rollback drill planejado (não remoto nesta phase)', 'financial_read_model'),
  stage('final_review', 9, [], 'Human review final', 'rollback_drill'),
]);

/** Ordem recomendada dos Read Models. */
export const RECOMMENDED_READ_MODEL_FLAG_ORDER = Object.freeze([
  'LEAD_ANALYTICS_READ_MODEL',
  'APPOINTMENT_ANALYTICS_READ_MODEL',
  'FINANCIAL_ANALYTICS_READ_MODEL',
] as const satisfies readonly DomainEventFlagKey[]);

export function getFlagMatrixRow(flag: DomainEventFlagKey): StagingFlagMatrixRow | undefined {
  return STAGING_FLAG_MATRIX.find((r) => r.flag === flag);
}

export function validateFlagEnablementOrder(
  enabledInOrder: readonly DomainEventFlagKey[],
): { ok: boolean; reason?: string } {
  const seen = new Set<DomainEventFlagKey>();
  for (const flag of enabledInOrder) {
    const rowDef = getFlagMatrixRow(flag);
    if (!rowDef) return { ok: false, reason: `flag desconhecida: ${flag}` };
    for (const dep of rowDef.dependencies) {
      if (!seen.has(dep)) {
        return { ok: false, reason: `${flag} exige ${dep} antes` };
      }
    }
    seen.add(flag);
  }

  const rms = RECOMMENDED_READ_MODEL_FLAG_ORDER.filter((f) => enabledInOrder.includes(f));
  if (rms.length > 1) {
    const idxs = rms.map((f) => enabledInOrder.indexOf(f));
    for (let i = 1; i < rms.length; i += 1) {
      if (idxs[i] < idxs[i - 1]) {
        return {
          ok: false,
          reason: 'ordem de Read Models diverge da recomendada sem justificativa',
        };
      }
    }
  }

  if (enabledInOrder.includes('DOMAIN_EVENT_ANALYTICS')) {
    const ai = enabledInOrder.indexOf('DOMAIN_EVENT_ANALYTICS');
    const di = enabledInOrder.indexOf('DOMAIN_EVENTS');
    if (di < 0 || di > ai) return { ok: false, reason: 'analytics antes de DOMAIN_EVENTS' };
  }
  if (enabledInOrder.includes('DOMAIN_EVENT_CONSUMERS')) {
    const ci = enabledInOrder.indexOf('DOMAIN_EVENT_CONSUMERS');
    const di = enabledInOrder.indexOf('DOMAIN_EVENTS');
    if (di < 0 || di > ci) return { ok: false, reason: 'consumers antes de DOMAIN_EVENTS' };
  }
  for (const rm of RECOMMENDED_READ_MODEL_FLAG_ORDER) {
    if (!enabledInOrder.includes(rm)) continue;
    const ri = enabledInOrder.indexOf(rm);
    const ai = enabledInOrder.indexOf('DOMAIN_EVENT_ANALYTICS');
    if (ai < 0 || ai > ri) {
      return { ok: false, reason: `${rm} antes de DOMAIN_EVENT_ANALYTICS` };
    }
  }

  return { ok: true };
}

export function assertSequentialReadModelsOnly(
  flagsEnabledInSameBatch: readonly DomainEventFlagKey[],
): { ok: boolean; reason?: string } {
  const rms = RECOMMENDED_READ_MODEL_FLAG_ORDER.filter((f) =>
    flagsEnabledInSameBatch.includes(f),
  );
  if (rms.length > 1) {
    return {
      ok: false,
      reason: 'ativação simultânea de múltiplos Read Models proibida na primeira execução',
    };
  }
  return { ok: true };
}
