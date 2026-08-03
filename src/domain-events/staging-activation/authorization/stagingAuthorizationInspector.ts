/**
 * @module domain-events/staging-activation/authorization/stagingAuthorizationInspector
 */

import type { DomainEventFlagsInput } from '../../domainEventFlags.js';
import {
  buildStagingAuthorizationPackageReport,
} from './stagingAuthorizationReport.js';
import type { BuildAuthorizationPackageOptions } from './stagingAuthorizationPackage.js';
import {
  getStagingAuthorizationHistory,
  __clearStagingAuthorizationHistoryForTest,
} from './stagingAuthorizationHistory.js';

export { __clearStagingAuthorizationHistoryForTest, getStagingAuthorizationHistory };

export function inspectStagingAuthorizationPackage(
  options: BuildAuthorizationPackageOptions = {},
  flagsInput: DomainEventFlagsInput = {},
) {
  const current = buildStagingAuthorizationPackageReport(options, flagsInput, {
    recordHistory: true,
  });
  return Object.freeze({
    current,
    history: getStagingAuthorizationHistory(),
    packageStatus: current.packageStatus,
    readinessStatus: current.readiness.status,
    humanApprovalStatus: current.humanApproval.status,
    recommendation: current.recommendation,
    flagsChanged: false as const,
    remoteActionsExecuted: false as const,
    inspectedAt: new Date().toISOString(),
  });
}
