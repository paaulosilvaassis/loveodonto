/**
 * @module domain-events/certification/cqrsCertificationReport
 * @description Builder oficial buildCqrsArchitectureCertificationReport — Phase 8.5.
 */

import type { DomainEventFlagsInput } from '../domainEventFlags.js';
import {
  LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION,
  LOVE_ODONTO_V3_CQRS_CERTIFICATION_VERSION,
  CQRS_ARCHITECTURE_VERSION_COMPONENTS,
  CQRS_CERTIFIED_READ_MODEL_IDS,
} from './cqrsArchitectureVersion.js';
import { runCqrsCertificationGates } from './cqrsCertificationGates.js';
import { buildCqrsStagingEvidenceContract } from './cqrsCertificationStaging.js';
import { buildCqrsHumanApprovalGate } from './cqrsCertificationHumanApproval.js';
import { buildReadModelPromotionReport } from '../read-models/shared/readModelPromotionReport.js';
import type {
  CqrsCertificationContract,
  CqrsCertificationRecommendation,
  CqrsCertificationStatus,
} from './cqrsCertificationTypes.js';
import { appendCqrsCertificationHistory } from './cqrsCertificationHistory.js';

let certSeq = 0;

function deriveStatus(
  gates: ReturnType<typeof runCqrsCertificationGates>['gates'],
): CqrsCertificationStatus {
  if (gates.some((g) => g.result === 'fail' && g.blocking)) return 'blocked';
  if (gates.some((g) => g.result === 'fail')) return 'failed';
  const warns = gates.filter((g) => g.result === 'warn');
  const passes = gates.filter((g) => g.result === 'pass');
  if (warns.length > 0 && passes.length > 0) return 'conditional';
  if (passes.length === gates.length) return 'certified';
  if (passes.length === 0) return 'not_evaluated';
  return 'conditional';
}

function recommendationFor(
  status: CqrsCertificationStatus,
): CqrsCertificationRecommendation {
  if (status === 'certified') {
    return 'architecture_certified_awaiting_staging_and_human_approval';
  }
  if (status === 'blocked' || status === 'failed') return 'architecture_blocked';
  if (status === 'conditional') return 'architecture_conditional';
  return 'not_applicable';
}

/**
 * Relatório oficial de certificação arquitetural CQRS.
 * Nunca promove flags. Human approval permanece pending.
 */
export function buildCqrsArchitectureCertificationReport(
  flagsInput: DomainEventFlagsInput = {},
  options: { evaluatedBy?: string; recordHistory?: boolean } = {},
): CqrsCertificationContract {
  certSeq += 1;
  const evaluatedAt = new Date().toISOString();
  const { gates, evidence } = runCqrsCertificationGates(flagsInput);
  const status = deriveStatus(gates);
  const staging = buildCqrsStagingEvidenceContract();
  const humanApproval = buildCqrsHumanApprovalGate();
  const promotion = buildReadModelPromotionReport(flagsInput);

  const blockers = gates
    .filter((g) => g.result === 'fail')
    .map((g) => `${g.gateId}: ${g.message}`);
  const warnings = [
    ...gates.filter((g) => g.result === 'warn').map((g) => `${g.gateId}: ${g.message}`),
    staging.state === 'manual-required' ? 'staging: evidência operacional manual-required' : null,
    humanApproval.state === 'pending' ? 'human_approval: pending' : null,
  ].filter(Boolean) as string[];

  const byReadModel: Record<string, CqrsCertificationStatus> = {};
  for (const id of CQRS_CERTIFIED_READ_MODEL_IDS) {
    const p = promotion.byReadModel[id];
    if (status === 'certified' && p === 'ready') byReadModel[id] = 'certified';
    else if (p === 'blocked' || status === 'blocked') byReadModel[id] = 'blocked';
    else if (p === 'ready' && status === 'conditional') byReadModel[id] = 'conditional';
    else if (status === 'failed') byReadModel[id] = 'failed';
    else byReadModel[id] = 'conditional';
  }

  const recommendation = recommendationFor(status);

  const contract: CqrsCertificationContract = Object.freeze({
    certificationId: `cqrs-cert-${LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION}-${certSeq}`,
    architectureVersion: LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION,
    certificationVersion: LOVE_ODONTO_V3_CQRS_CERTIFICATION_VERSION,
    scope: Object.freeze([
      'domain-events',
      'consumers',
      'analytics-projections',
      'cqrs-read-models',
    ]),
    evaluatedAt,
    evaluatedBy: options.evaluatedBy || 'local-architectural-evaluator',
    environment: 'local-architectural',
    domains: Object.freeze(['crm-analytics', 'agenda-analytics', 'financial-analytics']),
    components: Object.freeze([...CQRS_ARCHITECTURE_VERSION_COMPONENTS]),
    checks: Object.freeze([...gates]),
    evidence: Object.freeze([...evidence]),
    warnings: Object.freeze([...new Set(warnings)]),
    blockers: Object.freeze([...new Set(blockers)]),
    status,
    humanApprovalRequired: true,
    autoPromotionAllowed: false,
    byReadModel: Object.freeze({ ...byReadModel }),
    staging,
    humanApproval,
    recommendation,
    statement:
      'Architecture Certified ≠ Production Promoted — staging + human approval obrigatórios antes de qualquer promoção operacional',
  });

  if (options.recordHistory !== false) {
    appendCqrsCertificationHistory(contract);
  }

  return contract;
}

export function __resetCqrsCertificationSeqForTest(): void {
  certSeq = 0;
}
