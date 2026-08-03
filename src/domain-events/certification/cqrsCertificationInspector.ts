/**
 * @module domain-events/certification/cqrsCertificationInspector
 * @description Inspector interno de certificação — Phase 8.5.
 * Sem HTTP. Sem UI. Histórico in-memory.
 */

import type { DomainEventFlagsInput } from '../domainEventFlags.js';
import { buildCqrsArchitectureCertificationReport } from './cqrsCertificationReport.js';
import { getCqrsArchitectureCertificationHealth } from './cqrsCertificationHealth.js';
import {
  getCqrsCertificationHistory,
  __clearCqrsCertificationHistoryForTest,
} from './cqrsCertificationHistory.js';
import type { CqrsCertificationContract } from './cqrsCertificationTypes.js';
import { CQRS_RECERTIFICATION_TRIGGERS } from './cqrsCertificationTypes.js';

export { __clearCqrsCertificationHistoryForTest, getCqrsCertificationHistory };

export interface CqrsCertificationInspectorSnapshot {
  readonly current: CqrsCertificationContract;
  readonly health: ReturnType<typeof getCqrsArchitectureCertificationHealth>;
  readonly history: CqrsCertificationContract[];
  readonly recertificationTriggers: typeof CQRS_RECERTIFICATION_TRIGGERS;
  readonly humanApprovalState: 'pending' | 'approved' | 'rejected';
  readonly stagingState: string;
  readonly autoPromotionAllowed: false;
  readonly inspectedAt: string;
}

export function inspectCqrsArchitectureCertification(
  flagsInput: DomainEventFlagsInput = {},
): CqrsCertificationInspectorSnapshot {
  const current = buildCqrsArchitectureCertificationReport(flagsInput, {
    recordHistory: true,
  });
  const health = getCqrsArchitectureCertificationHealth(flagsInput);
  return Object.freeze({
    current,
    health,
    history: getCqrsCertificationHistory(),
    recertificationTriggers: CQRS_RECERTIFICATION_TRIGGERS,
    humanApprovalState: current.humanApproval.state,
    stagingState: current.staging.state,
    autoPromotionAllowed: false,
    inspectedAt: new Date().toISOString(),
  });
}
