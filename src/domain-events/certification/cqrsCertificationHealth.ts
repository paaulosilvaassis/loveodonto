/**
 * @module domain-events/certification/cqrsCertificationHealth
 * @description Health específico de certificação — Phase 8.5.
 * Separado do Health operacional e do Promotion Health.
 */

import type { DomainEventFlagsInput } from '../domainEventFlags.js';
import { buildCqrsArchitectureCertificationReport } from './cqrsCertificationReport.js';
import type { CqrsCertificationStatus } from './cqrsCertificationTypes.js';

export interface CqrsCertificationHealthReport {
  readonly overall: CqrsCertificationStatus;
  readonly checkedAt: string;
  readonly byReadModel: Readonly<Record<string, CqrsCertificationStatus>>;
  readonly operationalPromotionAuthorized: false;
  readonly detail: string;
}

export function getCqrsArchitectureCertificationHealth(
  flagsInput: DomainEventFlagsInput = {},
): CqrsCertificationHealthReport {
  const report = buildCqrsArchitectureCertificationReport(flagsInput, {
    recordHistory: false,
  });
  return Object.freeze({
    overall: report.status,
    checkedAt: report.evaluatedAt,
    byReadModel: report.byReadModel,
    operationalPromotionAuthorized: false,
    detail: report.statement,
  });
}
