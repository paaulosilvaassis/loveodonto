/**
 * @module domain-events/read-models/shared/readModelPromotionReport
 * @description Relatório consolidado de Promotion Readiness — Phase 8.4.
 * Nunca promove flags. autoPromote sempre false.
 */

import type { DomainEventFlagsInput } from '../../domainEventFlags.js';
import { evaluateReadModelPromotion } from './readModelPromotionEvaluator.js';
import {
  CQRS_PROMOTION_READ_MODEL_IDS,
  type ReadModelPromotionReport,
  type ReadModelPromotionRecommendation,
  type ReadModelPromotionStatus,
} from './readModelPromotionTypes.js';

function aggregateOverall(
  statuses: ReadModelPromotionStatus[],
): ReadModelPromotionStatus {
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.includes('not_ready')) return 'not_ready';
  if (statuses.includes('warning')) return 'warning';
  if (statuses.length > 0 && statuses.every((s) => s === 'ready')) return 'ready';
  return 'not_ready';
}

function recommendationFor(
  overall: ReadModelPromotionStatus,
): ReadModelPromotionRecommendation {
  if (overall === 'blocked') return 'do_not_promote';
  if (overall === 'ready') return 'architecturally_ready_awaiting_human';
  if (overall === 'warning') return 'hold_for_human_review';
  return 'not_applicable';
}

/**
 * Constrói relatório oficial de Promotion Readiness.
 * Não altera flags. Não altera produção. Nunca auto-promove.
 */
export function buildReadModelPromotionReport(
  flagsInput: DomainEventFlagsInput = {},
): ReadModelPromotionReport {
  const checkedAt = new Date().toISOString();
  const contracts = CQRS_PROMOTION_READ_MODEL_IDS.map((id) =>
    evaluateReadModelPromotion(id, flagsInput),
  );

  const byReadModel: Record<string, ReadModelPromotionStatus> = {};
  const blockers: string[] = [];
  const warnings: string[] = [];
  let checksPassed = 0;
  let checksFailed = 0;
  let checksWarned = 0;

  for (const c of contracts) {
    byReadModel[c.readModelId] = c.promotionStatus;
    for (const b of c.promotionBlockers) blockers.push(`${c.readModelId}: ${b}`);
    for (const w of c.promotionWarnings) warnings.push(`${c.readModelId}: ${w}`);
    for (const check of c.checks) {
      if (check.result === 'pass' || check.result === 'skip') checksPassed += 1;
      else if (check.result === 'fail') checksFailed += 1;
      else if (check.result === 'warn') checksWarned += 1;
    }
  }

  const overall = aggregateOverall(Object.values(byReadModel));
  const recommendation = recommendationFor(overall);
  const uniqueBlockers = [...new Set(blockers)];
  const uniqueWarnings = [...new Set(warnings)];

  return Object.freeze({
    overall,
    checkedAt,
    byReadModel: Object.freeze({ ...byReadModel }),
    contracts: Object.freeze([...contracts]),
    blockers: Object.freeze(uniqueBlockers),
    warnings: Object.freeze(uniqueWarnings),
    checksPassed,
    checksFailed,
    checksWarned,
    recommendation,
    detail:
      overall === 'ready'
        ? 'arquiteturalmente ready — promoção somente humana; flags intactas'
        : overall === 'blocked'
          ? `blocked — ${uniqueBlockers[0] || 'ver blockers'}`
          : overall === 'warning'
            ? 'warning — hold for human review'
            : 'not_ready — evidência insuficiente (attach/soak)',
    autoPromote: false,
  });
}
