/**
 * @module domain-events/read-models/shared/readModelPromotionInspector
 * @description Inspector de Promotion Readiness — Phase 8.4.
 * Sem HTTP. Sem UI. Histórico de avaliações in-memory.
 */

import type { DomainEventFlagsInput } from '../../domainEventFlags.js';
import { evaluateReadModelPromotion } from './readModelPromotionEvaluator.js';
import { buildReadModelPromotionReport } from './readModelPromotionReport.js';
import { getReadModelPromotionHealth } from './readModelPromotionHealth.js';
import { runReadModelPromotionChecklist } from './readModelPromotionChecklist.js';
import {
  CQRS_PROMOTION_READ_MODEL_IDS,
  type ReadModelPromotionContract,
} from './readModelPromotionTypes.js';

const evaluationHistory: ReadModelPromotionContract[] = [];
const HISTORY_CAP = 100;

export function appendReadModelPromotionEvaluation(
  contract: ReadModelPromotionContract,
): void {
  evaluationHistory.push(contract);
  while (evaluationHistory.length > HISTORY_CAP) evaluationHistory.shift();
}

export function getReadModelPromotionEvaluationHistory(filter?: {
  readModelId?: string;
}): ReadModelPromotionContract[] {
  return evaluationHistory
    .filter((c) => !filter?.readModelId || c.readModelId === filter.readModelId)
    .map((c) => ({
      ...c,
      promotionWarnings: [...c.promotionWarnings],
      promotionBlockers: [...c.promotionBlockers],
      checks: [...c.checks],
    }));
}

export function __clearReadModelPromotionHistoryForTest(): void {
  evaluationHistory.length = 0;
}

export interface ReadModelPromotionInspectorSnapshot {
  readonly report: ReturnType<typeof buildReadModelPromotionReport>;
  readonly health: ReturnType<typeof getReadModelPromotionHealth>;
  readonly byReadModel: Array<{
    readModelId: string;
    status: string;
    blockers: readonly string[];
    warnings: readonly string[];
    checklist: ReturnType<typeof runReadModelPromotionChecklist>;
    contract: ReadModelPromotionContract;
  }>;
  readonly evaluationHistory: ReadModelPromotionContract[];
  readonly autoPromote: false;
  readonly inspectedAt: string;
}

/**
 * Inspeção consolidada de Promotion Readiness.
 */
export function inspectReadModelPromotion(
  flagsInput: DomainEventFlagsInput = {},
): ReadModelPromotionInspectorSnapshot {
  const report = buildReadModelPromotionReport(flagsInput);
  const health = getReadModelPromotionHealth(flagsInput);
  for (const c of report.contracts) appendReadModelPromotionEvaluation(c);
  return Object.freeze({
    report,
    health,
    byReadModel: Object.freeze(
      CQRS_PROMOTION_READ_MODEL_IDS.map((id) => {
        const contract = evaluateReadModelPromotion(id, flagsInput);
        return Object.freeze({
          readModelId: id,
          status: contract.promotionStatus,
          blockers: contract.promotionBlockers,
          warnings: contract.promotionWarnings,
          checklist: runReadModelPromotionChecklist(id, flagsInput),
          contract,
        });
      }),
    ),
    evaluationHistory: getReadModelPromotionEvaluationHistory(),
    autoPromote: false,
    inspectedAt: new Date().toISOString(),
  });
}

export function inspectReadModelPromotionById(
  readModelId: string,
  flagsInput: DomainEventFlagsInput = {},
) {
  const contract = evaluateReadModelPromotion(readModelId, flagsInput);
  appendReadModelPromotionEvaluation(contract);
  return Object.freeze({
    contract,
    status: contract.promotionStatus,
    blockers: contract.promotionBlockers,
    warnings: contract.promotionWarnings,
    checklist: runReadModelPromotionChecklist(readModelId, flagsInput),
    history: getReadModelPromotionEvaluationHistory({ readModelId }),
    autoPromote: false as const,
  });
}
