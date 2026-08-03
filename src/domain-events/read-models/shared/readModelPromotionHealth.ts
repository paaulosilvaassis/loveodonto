/**
 * @module domain-events/read-models/shared/readModelPromotionHealth
 * @description Health específico de Promotion Readiness — Phase 8.4.
 * Não altera o Health operacional dos Read Models.
 */

import type { DomainEventFlagsInput } from '../../domainEventFlags.js';
import { buildReadModelPromotionReport } from './readModelPromotionReport.js';
import type {
  ReadModelPromotionHealthStatus,
  ReadModelPromotionStatus,
} from './readModelPromotionTypes.js';

export interface ReadModelPromotionHealthReport {
  readonly overall: ReadModelPromotionHealthStatus;
  readonly checkedAt: string;
  readonly byReadModel: Record<string, ReadModelPromotionHealthStatus>;
  readonly detail: string;
}

function toPromotionHealth(
  status: ReadModelPromotionStatus,
): ReadModelPromotionHealthStatus {
  if (status === 'ready') return 'ready';
  if (status === 'blocked') return 'blocked';
  return 'warning';
}

/**
 * Health de promoção — separado do health operacional.
 */
export function getReadModelPromotionHealth(
  flagsInput: DomainEventFlagsInput = {},
): ReadModelPromotionHealthReport {
  const report = buildReadModelPromotionReport(flagsInput);
  const byReadModel: Record<string, ReadModelPromotionHealthStatus> = {};
  for (const [id, status] of Object.entries(report.byReadModel)) {
    byReadModel[id] = toPromotionHealth(status);
  }
  return Object.freeze({
    overall: toPromotionHealth(report.overall),
    checkedAt: report.checkedAt,
    byReadModel: Object.freeze({ ...byReadModel }),
    detail: report.detail,
  });
}
