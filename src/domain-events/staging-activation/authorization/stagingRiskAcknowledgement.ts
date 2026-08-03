/**
 * @module domain-events/staging-activation/authorization/stagingRiskAcknowledgement
 */

import type {
  StagingRiskAcknowledgement,
  StagingRiskItem,
} from './stagingAuthorizationTypes.js';

const RISK_DEFS = Object.freeze([
  Object.freeze({
    riskId: 'rejected_events',
    description: 'eventos rejeitados',
    severity: 'high' as const,
    mitigation: 'monitor Diagnostics + rollback Stage 1',
  }),
  Object.freeze({
    riskId: 'broken_correlation',
    description: 'correlation quebrada',
    severity: 'high' as const,
    mitigation: 'Inspector por correlationId',
  }),
  Object.freeze({
    riskId: 'inconsistent_causation',
    description: 'causation inconsistente',
    severity: 'medium' as const,
    mitigation: 'timeline + audit projection',
  }),
  Object.freeze({
    riskId: 'tenant_mismatch',
    description: 'tenant mismatch',
    severity: 'critical' as const,
    mitigation: 'guards tenant + fail criteria',
  }),
  Object.freeze({
    riskId: 'memory_growth',
    description: 'crescimento de memória',
    severity: 'medium' as const,
    mitigation: 'cap de métricas in-memory + duração máxima',
  }),
  Object.freeze({
    riskId: 'process_local_metrics',
    description: 'métricas process-local',
    severity: 'medium' as const,
    mitigation: 'evidências exportadas antes do restart',
  }),
  Object.freeze({
    riskId: 'inmemory_loss',
    description: 'perda do estado in-memory após reinício',
    severity: 'high' as const,
    mitigation: 'não depender de persistência; coletar evidências',
  }),
  Object.freeze({
    riskId: 'wrong_host',
    description: 'host incorreto',
    severity: 'critical' as const,
    mitigation: 'Environment Declaration + production rejection',
  }),
  Object.freeze({
    riskId: 'out_of_scope_activation',
    description: 'ativação fora de escopo',
    severity: 'critical' as const,
    mitigation: 'Stage 1 forbidden flags validator',
  }),
  Object.freeze({
    riskId: 'manual_rollback_failure',
    description: 'falha de rollback manual',
    severity: 'high' as const,
    mitigation: 'rollback acknowledgement + drill futuro',
  }),
]);

export interface StagingRiskAckInput {
  /** Aceites reais por riskId → acceptedBy. Sem inventar. */
  acceptances?: Readonly<Record<string, { acceptedBy: string; acceptedAt: string }>>;
}

export function buildStagingRiskAcknowledgement(
  input: StagingRiskAckInput = {},
): StagingRiskAcknowledgement {
  const acceptances = input.acceptances || {};
  const risks: StagingRiskItem[] = RISK_DEFS.map((d) => {
    const a = acceptances[d.riskId];
    const accepted = Boolean(a?.acceptedBy && a?.acceptedAt);
    return Object.freeze({
      ...d,
      accepted,
      acceptedBy: accepted ? a.acceptedBy : null,
      acceptedAt: accepted ? a.acceptedAt : null,
    });
  });
  const allAccepted = risks.every((r) => r.accepted);
  return Object.freeze({
    risks: Object.freeze(risks),
    allAccepted,
    status: allAccepted ? 'acknowledged' : 'pending',
  });
}
