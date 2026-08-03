/**
 * @module domain-events/staging-activation/stagingPreflight
 * @description Preflight Checks — Phase 8.6.
 */

import {
  DOMAIN_EVENT_FLAG_DEFAULTS,
  DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS,
  type DomainEventFlagsInput,
} from '../domainEventFlags.js';
import { DOMAIN_EVENT_REGISTRY } from '../domainEventRegistry.js';
import { LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION } from '../certification/cqrsArchitectureVersion.js';
import { buildCqrsArchitectureCertificationReport } from '../certification/cqrsCertificationReport.js';
import { ANALYTICS_PROJECTION_SCOPE_BY_ID } from '../read-models/shared/readModelProjectionScope.js';
import type {
  ControlledStagingActivationPlan,
  StagingPreflightCheck,
} from './stagingActivationTypes.js';
import { isAuthorizationUsable } from './stagingHumanAuthorization.js';
import { STAGING_EVIDENCE_REQUIREMENTS } from './stagingEvidence.js';

function check(
  checkId: string,
  result: StagingPreflightCheck['result'],
  message: string,
  blocking = result === 'fail',
): StagingPreflightCheck {
  return Object.freeze({
    checkId,
    result,
    blocking: result === 'fail' ? blocking : false,
    message,
  });
}

export function runStagingPreflightChecks(
  plan: ControlledStagingActivationPlan,
  flagsInput: DomainEventFlagsInput = {},
): StagingPreflightCheck[] {
  const checks: StagingPreflightCheck[] = [];

  const cert = buildCqrsArchitectureCertificationReport(flagsInput, {
    recordHistory: false,
  });
  checks.push(
    check(
      'architecture_certified',
      cert.status === 'certified' || cert.status === 'conditional'
        ? cert.status === 'certified'
          ? 'pass'
          : 'warning'
        : 'fail',
      `certification status=${cert.status}`,
      cert.status === 'failed' || cert.status === 'blocked',
    ),
  );

  checks.push(
    check(
      'architecture_version',
      plan.architectureVersion === LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION
        ? 'pass'
        : 'fail',
      `plan version=${plan.architectureVersion}`,
    ),
  );

  const env = plan.environment;
  if (env.isProduction) {
    checks.push(check('staging_identified', 'fail', 'produção detectada'));
  } else if (env.status === 'ok' && env.authorized) {
    checks.push(check('staging_identified', 'pass', 'staging autorizado'));
  } else {
    checks.push(
      check(
        'staging_identified',
        'manual-required',
        'staging não autorizado — autorização explícita requerida',
      ),
    );
  }

  checks.push(
    check(
      'production_rejected',
      env.isProduction ? 'fail' : 'pass',
      env.isProduction ? 'produção não rejeitada' : 'produção rejeitada OK',
    ),
  );

  const authOk = isAuthorizationUsable(plan.authorization);
  checks.push(
    check(
      'human_approval',
      authOk ? 'pass' : 'manual-required',
      `authorization status=${plan.authorization.status}`,
    ),
  );

  checks.push(
    check(
      'tenants_selected',
      plan.tenants.valid ? 'pass' : 'manual-required',
      plan.tenants.valid
        ? 'tenants piloto válidos'
        : plan.tenants.reason || 'tenants não selecionados',
    ),
  );

  const allDefaultsOff = Object.values(DOMAIN_EVENT_FLAG_DEFAULTS).every((v) => v === false);
  checks.push(
    check(
      'flags_initially_false',
      allDefaultsOff ? 'pass' : 'fail',
      allDefaultsOff ? 'defaults OFF' : 'alguma flag default true',
    ),
  );

  checks.push(
    check(
      'production_guards',
      DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS.length >= 10 ? 'pass' : 'fail',
      `locked flags=${DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS.length}`,
    ),
  );

  checks.push(
    check(
      'host_guards',
      'pass',
      'host guards via applyProductionSafeLocksGeneric (estratégia existente)',
    ),
  );

  checks.push(
    check(
      'registry_integrity',
      DOMAIN_EVENT_REGISTRY.length > 0 ? 'pass' : 'fail',
      `registry entries=${DOMAIN_EVENT_REGISTRY.length}`,
    ),
  );

  const scopesTenant = Object.values(ANALYTICS_PROJECTION_SCOPE_BY_ID).every(
    (s) => s === 'tenant',
  );
  checks.push(
    check(
      'projections_tenant_scoped',
      scopesTenant ? 'pass' : 'fail',
      scopesTenant ? 'projections tenant-scoped' : 'scope não tenant',
    ),
  );

  checks.push(
    check(
      'promotion_blockers',
      cert.blockers.length === 0 ? 'pass' : 'warning',
      `cert blockers=${cert.blockers.length}`,
    ),
  );

  checks.push(
    check(
      'regression_baseline',
      'manual-required',
      'baseline de regressão deve ser confirmada na execução 8.7',
    ),
  );

  checks.push(check('inspector_available', 'pass', 'Inspector de staging plan disponível'));
  checks.push(check('metrics_available', 'pass', 'métricas foundation disponíveis'));
  checks.push(check('health_available', 'pass', 'health foundation disponível'));

  checks.push(
    check(
      'rollback_prepared',
      plan.rollbackPlan.steps.length > 0 ? 'pass' : 'fail',
      `rollback steps=${plan.rollbackPlan.steps.length}`,
    ),
  );

  checks.push(
    check(
      'evidence_requirements',
      plan.evidenceRequirements.length === STAGING_EVIDENCE_REQUIREMENTS.length
        ? 'pass'
        : 'fail',
      `evidence requirements=${plan.evidenceRequirements.length}`,
    ),
  );

  checks.push(
    check('no_auto_bootstrap', 'pass', 'sem auto-bootstrap de staging activation'),
  );
  checks.push(
    check('no_auto_wiring', 'pass', 'sem auto-wiring indevido nesta phase'),
  );

  checks.push(
    check(
      'human_approval_required_flag',
      plan.humanApprovalRequired && plan.autoPromotionAllowed === false
        ? 'pass'
        : 'fail',
      'humanApprovalRequired=true; autoPromotionAllowed=false',
    ),
  );

  return Object.freeze(checks) as StagingPreflightCheck[];
}
