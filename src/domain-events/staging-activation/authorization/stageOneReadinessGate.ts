/**
 * @module domain-events/staging-activation/authorization/stageOneReadinessGate
 * evaluateStageOneReadiness — nunca running/activated/enabled/promoted.
 */

import {
  DOMAIN_EVENT_FLAG_DEFAULTS,
  type DomainEventFlagsInput,
} from '../../domainEventFlags.js';
import { buildCqrsArchitectureCertificationReport } from '../../certification/cqrsCertificationReport.js';
import { buildControlledStagingPreflightReport } from '../stagingPreflightReport.js';
import type { StagingAuthorizationPackage } from './stagingAuthorizationTypes.js';
import type { StageOneReadinessGateResult } from './stagingAuthorizationTypes.js';
import { STAGE_ONE_AUTHORIZED_FLAGS, STAGE_ONE_FORBIDDEN_FLAGS } from './stagingAuthorizationTypes.js';
import { validateStagingAuthorizationPackage } from './stagingAuthorizationValidator.js';

function check(
  checkId: string,
  result: 'pass' | 'fail' | 'manual_required',
  message: string,
) {
  return Object.freeze({ checkId, result, message });
}

export function evaluateStageOneReadiness(
  pkg: StagingAuthorizationPackage,
  flagsInput: DomainEventFlagsInput = {},
  options: { regressionGreen?: boolean } = {},
): StageOneReadinessGateResult {
  const checks: StageOneReadinessGateResult['checks'][number][] = [];

  const cert = buildCqrsArchitectureCertificationReport(flagsInput, { recordHistory: false });
  checks.push(
    check(
      'architecture_certified',
      cert.status === 'certified' || cert.status === 'conditional' ? 'pass' : 'fail',
      `cert=${cert.status}`,
    ),
  );

  const preflight = buildControlledStagingPreflightReport(flagsInput, { recordHistory: false });
  checks.push(
    check(
      'preflight_local',
      preflight.execution.remoteActionsExecuted === false && preflight.execution.flagsChanged === false
        ? 'pass'
        : 'fail',
      `preflight result=${preflight.result}`,
    ),
  );

  checks.push(
    check(
      'staging_valid',
      pkg.environmentDeclaration.complete && pkg.environmentDeclaration.isStaging
        ? 'pass'
        : 'manual_required',
      pkg.environmentDeclaration.complete ? 'staging ok' : 'staging incompleto',
    ),
  );

  checks.push(
    check(
      'human_approved',
      pkg.humanApproval.status === 'approved' ? 'pass' : 'fail',
      `human=${pkg.humanApproval.status}`,
    ),
  );

  checks.push(
    check(
      'tenants_pilot',
      pkg.tenantSelection.valid ? 'pass' : 'manual_required',
      pkg.tenantSelection.valid ? 'tenants ok' : 'tenants ausentes/inválidos',
    ),
  );

  checks.push(
    check(
      'readonly_verified',
      pkg.readonlyAccessDeclaration.status === 'verified_readonly' ? 'pass' : 'fail',
      `readonly=${pkg.readonlyAccessDeclaration.status}`,
    ),
  );

  checks.push(
    check(
      'stage_one_authorized',
      pkg.stageOneAuthorization.status === 'approved' ? 'pass' : 'fail',
      `stage1=${pkg.stageOneAuthorization.status}`,
    ),
  );

  const defaultsOff = STAGE_ONE_AUTHORIZED_FLAGS.every(
    (f) => DOMAIN_EVENT_FLAG_DEFAULTS[f] === false,
  )
    && STAGE_ONE_FORBIDDEN_FLAGS.every((f) => DOMAIN_EVENT_FLAG_DEFAULTS[f] === false);
  checks.push(
    check('flags_initially_off', defaultsOff ? 'pass' : 'fail', 'defaults OFF'),
  );

  checks.push(
    check(
      'only_three_flags',
      pkg.stageOneAuthorization.authorizedFlags.length === 3
        && pkg.stageOneAuthorization.forbiddenFlags.length >= 9
        ? 'pass'
        : 'fail',
      'Stage 1 scope',
    ),
  );

  checks.push(
    check(
      'rollback_reviewed',
      pkg.rollbackAcknowledgement.status === 'acknowledged' ? 'pass' : 'fail',
      `rollback=${pkg.rollbackAcknowledgement.status}`,
    ),
  );

  checks.push(
    check(
      'success_criteria',
      pkg.stageOneAuthorization.successCriteria.length > 0 ? 'pass' : 'fail',
      'success criteria',
    ),
  );
  checks.push(
    check(
      'failure_criteria',
      pkg.stageOneAuthorization.failureCriteria.length > 0 ? 'pass' : 'fail',
      'failure criteria',
    ),
  );
  checks.push(
    check(
      'evidence_defined',
      pkg.stageOneAuthorization.evidenceRequirements.length > 0
        && pkg.evidenceAcknowledgement.status === 'acknowledged'
        ? 'pass'
        : 'fail',
      'evidence',
    ),
  );

  const authValid = pkg.stageOneAuthorization.status === 'approved'
    && pkg.stageOneAuthorization.expiresAt
    && Date.parse(pkg.stageOneAuthorization.expiresAt) >= Date.now()
    && pkg.expiresAt
    && Date.parse(pkg.expiresAt) >= Date.now();
  checks.push(
    check('authorization_valid', authValid ? 'pass' : 'fail', 'auth validity'),
  );

  checks.push(
    check(
      'zero_production_ref',
      !pkg.environmentDeclaration.isProduction ? 'pass' : 'fail',
      'production ref',
    ),
  );

  checks.push(
    check(
      'regression_green',
      options.regressionGreen === true ? 'pass' : 'manual_required',
      options.regressionGreen ? 'regression green' : 'regression evidencia requerida',
    ),
  );

  const validation = validateStagingAuthorizationPackage(pkg);
  const blockers = Object.freeze([
    ...new Set([
      ...validation.blockers,
      ...checks.filter((c) => c.result === 'fail').map((c) => `${c.checkId}: ${c.message}`),
    ]),
  ]);

  let status: StageOneReadinessGateResult['status'] = 'blocked';
  if (blockers.length === 0 && checks.every((c) => c.result === 'pass')) {
    status = 'ready_for_explicit_stage_one_execution';
  } else if (checks.some((c) => c.result === 'manual_required') && !checks.some((c) => c.result === 'fail' && c.checkId === 'human_approved')) {
    // still blocked if human pending fails
    status = checks.some((c) => c.result === 'fail') ? 'blocked' : 'manual_required';
  } else if (checks.some((c) => c.result === 'fail')) {
    status = 'blocked';
  } else {
    status = 'manual_required';
  }

  // Spec: without real data remain blocked
  if (pkg.status === 'incomplete' || pkg.humanApproval.status === 'pending') {
    status = 'blocked';
  }

  return Object.freeze({
    status,
    checks: Object.freeze(checks),
    blockers,
    flagsChanged: false,
    remoteActionsExecuted: false,
  });
}
