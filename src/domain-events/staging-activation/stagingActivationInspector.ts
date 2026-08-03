/**
 * @module domain-events/staging-activation/stagingActivationInspector
 * @description Inspector interno — Phase 8.6. Sem HTTP/UI/persistência.
 */

import type { DomainEventFlagsInput } from '../domainEventFlags.js';
import {
  buildControlledStagingActivationPlanReport,
} from './stagingActivationReport.js';
import {
  getStagingPlanHistory,
  __clearStagingPlanHistoryForTest,
} from './stagingActivationHistory.js';
import type { BuildStagingPlanOptions } from './stagingActivationPlan.js';
import type { ControlledStagingActivationPlanReport } from './stagingActivationTypes.js';

export { __clearStagingPlanHistoryForTest, getStagingPlanHistory };

export interface StagingActivationInspectorSnapshot {
  readonly current: ControlledStagingActivationPlanReport;
  readonly history: ControlledStagingActivationPlanReport[];
  readonly humanApprovalStatus: string;
  readonly environmentStatus: string;
  readonly planStatus: string;
  readonly autoPromotionAllowed: false;
  readonly remoteActivationAllowed: false;
  readonly inspectedAt: string;
}

export function inspectControlledStagingActivationPlan(
  flagsInput: DomainEventFlagsInput = {},
  planOptions: BuildStagingPlanOptions = {},
): StagingActivationInspectorSnapshot {
  const current = buildControlledStagingActivationPlanReport(
    flagsInput,
    planOptions,
    { recordHistory: true },
  );
  return Object.freeze({
    current,
    history: getStagingPlanHistory(),
    humanApprovalStatus: current.humanApprovalStatus,
    environmentStatus: current.environmentStatus,
    planStatus: current.plan.status,
    autoPromotionAllowed: false,
    remoteActivationAllowed: false,
    inspectedAt: new Date().toISOString(),
  });
}
