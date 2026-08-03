/**
 * @module domain-events/staging-activation/stagingPreflightExecutionRunner
 * @description Execução de preflight Phase 8.7 — local only por default.
 * remoteActionsExecuted=false · flagsChanged=false · nunca muda authorization.
 */

import {
  DOMAIN_EVENT_FLAG_DEFAULTS,
  getDomainEventFlags,
  type DomainEventFlagKey,
  type DomainEventFlagsInput,
} from '../domainEventFlags.js';
import { LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION } from '../certification/cqrsArchitectureVersion.js';
import { buildCqrsArchitectureCertificationReport } from '../certification/cqrsCertificationReport.js';
import {
  ANALYTICS_PROJECTION_SCOPE_BY_ID,
  getReadModelProjectionScope,
} from '../read-models/shared/readModelProjectionScope.js';
import { listAnalyticsProjectionDefinitions } from '../projections/analyticsProjectionRegistry.js';
import {
  buildReadModelPromotionReport,
  CQRS_PROMOTION_READ_MODEL_IDS,
} from '../read-models/shared/index.js';
import {
  buildControlledStagingActivationPlan,
  type BuildStagingPlanOptions,
} from './stagingActivationPlan.js';
import { isAuthorizationUsable } from './stagingHumanAuthorization.js';
import {
  STAGING_ACTIVATION_STAGES,
  validateFlagEnablementOrder,
  assertSequentialReadModelsOnly,
  RECOMMENDED_READ_MODEL_FLAG_ORDER,
} from './stagingFlagMatrix.js';
import { STAGING_ROLLBACK_FLAG_ORDER, buildStagingRollbackPlan } from './stagingRollback.js';
import { STAGING_EVIDENCE_REQUIREMENTS } from './stagingEvidence.js';
import { createStagingPreflightEvidence } from './stagingPreflightExecutionEvidence.js';
import {
  PREFLIGHT_ALLOWED_EXECUTION_MODES,
  type ControlledStagingPreflightExecution,
  type StagingPreflightExecutionCheck,
  type StagingPreflightExecutionEvidence,
  type StagingPreflightExecutionMode,
  type StagingPreflightRecommendation,
  type StagingPreflightResult,
  type StagingRegressionEvidenceInput,
} from './stagingPreflightExecutionTypes.js';

const BASELINE_FLAGS = [
  'DOMAIN_EVENTS',
  'DOMAIN_EVENT_AUDIT',
  'DOMAIN_EVENT_OBSERVABILITY',
  'DOMAIN_EVENT_CONSUMERS',
  'DOMAIN_EVENT_PROJECTION',
  'DOMAIN_EVENT_ANALYTICS',
  'CQRS_READ_MODEL',
  'CQRS_READ_MODEL_SOAK',
  'CQRS_READ_MODEL_CONSISTENCY',
  'LEAD_ANALYTICS_READ_MODEL',
  'APPOINTMENT_ANALYTICS_READ_MODEL',
  'FINANCIAL_ANALYTICS_READ_MODEL',
] as const satisfies readonly DomainEventFlagKey[];

let execSeq = 0;

function chk(
  checkId: string,
  category: string,
  result: StagingPreflightExecutionCheck['result'],
  message: string,
  evidenceSource: string,
  execution: StagingPreflightExecutionCheck['execution'],
  actionRequired: string | null = null,
  blocking = result === 'fail',
): StagingPreflightExecutionCheck {
  return Object.freeze({
    checkId,
    category,
    result,
    blocking: result === 'fail' ? true : blocking && result !== 'pass',
    message,
    evidenceSource,
    execution,
    actionRequired,
  });
}

export interface ExecutePreflightOptions {
  flagsInput?: DomainEventFlagsInput;
  planOptions?: BuildStagingPlanOptions;
  executionMode?: StagingPreflightExecutionMode;
  operator?: string;
  regression?: StagingRegressionEvidenceInput | null;
  /** Somente se env+auth reais; tools read-only garantidas. */
  allowAuthorizedStagingReadonly?: boolean;
}

function assertMode(
  mode: StagingPreflightExecutionMode,
  allowReadonly: boolean,
  envAuthorized: boolean,
  authUsable: boolean,
): { mode: StagingPreflightExecutionMode; modeBlocker: string | null } {
  if (!PREFLIGHT_ALLOWED_EXECUTION_MODES.includes(mode)) {
    return { mode: 'local-static', modeBlocker: `modo inválido rejeitado: ${mode}` };
  }
  if (mode === 'authorized-staging-readonly') {
    if (!allowReadonly || !envAuthorized || !authUsable) {
      return {
        mode: 'local-static',
        modeBlocker:
          'authorized-staging-readonly indisponível — autorização/ambiente ausentes ou read-only não garantido',
      };
    }
  }
  return { mode, modeBlocker: null };
}

function deriveResult(args: {
  checks: StagingPreflightExecutionCheck[];
  authPending: boolean;
  envBlocked: boolean;
  tenantsInvalid: boolean;
  production: boolean;
}): StagingPreflightResult {
  if (args.production) return 'failed';
  if (args.checks.some((c) => c.result === 'fail' && c.category === 'regression')) {
    return 'failed';
  }
  if (args.checks.some((c) => c.result === 'fail' && c.checkId === 'flag_baseline')) {
    return 'failed';
  }
  if (args.checks.some((c) => c.result === 'fail' && c.checkId === 'flag_resolved_overrides')) {
    return 'failed';
  }
  if (args.authPending || args.envBlocked || args.tenantsInvalid) return 'blocked';
  if (args.checks.some((c) => c.result === 'fail')) return 'failed';
  // manual-required (ex.: readonly remote) e warnings não-bloqueantes não impedem passed local
  return 'passed';
}

function deriveRecommendation(args: {
  result: StagingPreflightResult;
  authPending: boolean;
  envBlocked: boolean;
  tenantsInvalid: boolean;
}): StagingPreflightRecommendation {
  if (args.result === 'failed') return 'preflight_failed';
  // Prioridade: human approval → environment → tenants
  if (args.authPending) return 'preflight_blocked_awaiting_human_approval';
  if (args.envBlocked) return 'preflight_blocked_awaiting_environment';
  if (args.tenantsInvalid) return 'preflight_blocked_awaiting_tenant_selection';
  if (args.result === 'passed') {
    return 'preflight_passed_awaiting_stage_activation_authorization';
  }
  return 'preflight_blocked_awaiting_human_approval';
}

/**
 * Executa preflight. Nunca altera flags, authorization ou ambiente remoto.
 */
export function executeControlledStagingPreflight(
  options: ExecutePreflightOptions = {},
): ControlledStagingPreflightExecution {
  execSeq += 1;
  const startedAt = new Date().toISOString();
  const flagsInput = options.flagsInput || {};
  const plan = buildControlledStagingActivationPlan(options.planOptions || {});
  const authUsable = isAuthorizationUsable(plan.authorization);
  const envAuthorized = plan.environment.status === 'ok' && plan.environment.authorized;

  const modeRes = assertMode(
    options.executionMode || 'local-static',
    Boolean(options.allowAuthorizedStagingReadonly),
    envAuthorized,
    authUsable,
  );
  const executionMode = modeRes.mode;
  const executionId = `pf-exec-${LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION}-${execSeq}`;
  const operator = options.operator || 'local-preflight-operator';

  const checks: StagingPreflightExecutionCheck[] = [];
  const evidence: StagingPreflightExecutionEvidence[] = [];

  const pushEv = (
    checkId: string,
    type: StagingPreflightExecutionEvidence['type'],
    source: string,
    result: StagingPreflightExecutionEvidence['result'],
    details: string,
  ) => {
    evidence.push(
      createStagingPreflightEvidence({
        executionId,
        checkId,
        environmentId: plan.environment.environmentId,
        type,
        source,
        result,
        detailsSanitized: details,
        operator,
      }),
    );
  };

  if (modeRes.modeBlocker) {
    checks.push(
      chk(
        'execution_mode',
        'execution',
        'manual-required',
        modeRes.modeBlocker,
        'assertMode',
        'none',
        'fornecer autorização real + garantia read-only',
      ),
    );
    pushEv('execution_mode', 'manual-required', 'assertMode', 'manual-required', modeRes.modeBlocker);
  } else {
    checks.push(
      chk(
        'execution_mode',
        'execution',
        'pass',
        `mode=${executionMode}`,
        'assertMode',
        'local',
        null,
      ),
    );
    pushEv('execution_mode', 'contract', 'assertMode', 'pass', `mode=${executionMode}`);
  }

  // 1. Architecture Certification
  const cert = buildCqrsArchitectureCertificationReport(flagsInput, { recordHistory: false });
  const certOk = cert.status === 'certified'
    && cert.autoPromotionAllowed === false
    && cert.humanApprovalRequired === true;
  checks.push(
    chk(
      'architecture_certification',
      'certification',
      certOk ? 'pass' : cert.status === 'conditional' ? 'warning' : 'fail',
      `status=${cert.status}; autoPromotion=${cert.autoPromotionAllowed}`,
      'buildCqrsArchitectureCertificationReport',
      'local',
      certOk ? null : 'obter certified local (attach+soak) ou corrigir blockers',
    ),
  );
  pushEv(
    'architecture_certification',
    'inspection',
    'certification',
    certOk ? 'pass' : 'warn',
    `status=${cert.status}`,
  );

  checks.push(
    chk(
      'architecture_version',
      'certification',
      plan.architectureVersion === LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION ? 'pass' : 'fail',
      `version=${plan.architectureVersion}`,
      'LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION',
      'local',
    ),
  );

  // 2. Environment
  if (plan.environment.isProduction) {
    checks.push(
      chk('environment_identification', 'environment', 'fail', 'produção detectada', 'environment', 'local', 'usar staging'),
    );
    pushEv('environment_identification', 'inspection', 'environment', 'fail', 'production');
  } else if (envAuthorized) {
    checks.push(
      chk('environment_identification', 'environment', 'pass', 'staging autorizado', 'environment', 'local'),
    );
    pushEv('environment_identification', 'contract', 'environment', 'pass', 'authorized');
  } else {
    checks.push(
      chk(
        'environment_identification',
        'environment',
        'manual-required',
        'staging não configurado/autorizado',
        'environment',
        'none',
        'autorizar environment staging explícito',
      ),
    );
    pushEv('environment_identification', 'manual-required', 'environment', 'manual-required', 'not configured');
  }

  // 3. Human Authorization — pending = fail/block; NÃO modificar status
  const authStatus = plan.authorization.status;
  if (authUsable) {
    checks.push(
      chk('human_authorization', 'authorization', 'pass', 'approved usable', 'authorization', 'local'),
    );
    pushEv('human_authorization', 'contract', 'authorization', 'pass', 'approved');
  } else if (authStatus === 'pending') {
    checks.push(
      chk(
        'human_authorization',
        'authorization',
        'fail',
        'authorization pending — bloqueia preflight passed',
        'authorization',
        'none',
        'aprovar explicitamente (sem autoaprovação)',
        true,
      ),
    );
    pushEv('human_authorization', 'manual-required', 'authorization', 'fail', 'pending unchanged');
  } else {
    checks.push(
      chk(
        'human_authorization',
        'authorization',
        'fail',
        `authorization ${authStatus}`,
        'authorization',
        'none',
        'obter aprovação válida',
        true,
      ),
    );
    pushEv('human_authorization', 'contract', 'authorization', 'fail', authStatus);
  }

  // 4. Tenants
  if (plan.tenants.valid) {
    checks.push(
      chk('tenant_selection', 'tenants', 'pass', 'seleção válida', 'tenants', 'local'),
    );
    pushEv('tenant_selection', 'contract', 'tenants', 'pass', `pilots=${plan.tenants.pilotTenantIds.length}`);
  } else {
    checks.push(
      chk(
        'tenant_selection',
        'tenants',
        'manual-required',
        plan.tenants.reason || 'tenants ausentes',
        'tenants',
        'none',
        'selecionar tenants piloto reais autorizados — não inventar IDs',
      ),
    );
    pushEv('tenant_selection', 'manual-required', 'tenants', 'manual-required', plan.tenants.reason || 'absent');
  }

  // 5. Flag baseline OFF (defaults oficiais — overrides locais de teste ≠ promoção)
  const resolved = getDomainEventFlags(flagsInput);
  const unexpectedOn = BASELINE_FLAGS.filter((k) => resolved[k] === true);
  const defaultsOff = BASELINE_FLAGS.every((k) => DOMAIN_EVENT_FLAG_DEFAULTS[k] === false);
  checks.push(
    chk(
      'flag_baseline',
      'flags',
      defaultsOff ? 'pass' : 'fail',
      defaultsOff
        ? 'defaults oficiais OFF'
        : 'default oficial true detectado',
      'DOMAIN_EVENT_FLAG_DEFAULTS',
      'local',
      defaultsOff ? null : 'não corrigir remotamente — investigar origem',
    ),
  );
  pushEv(
    'flag_baseline',
    'flag-resolution',
    'flags',
    defaultsOff ? 'pass' : 'fail',
    `defaultsOff=${defaultsOff}`,
  );

  if (unexpectedOn.length > 0) {
    const structuralOverride = executionMode === 'local-simulated';
    checks.push(
      chk(
        'flag_resolved_overrides',
        'flags',
        structuralOverride ? 'warning' : 'fail',
        structuralOverride
          ? `overrides locais para local-simulated: ${unexpectedOn.join(',')} — NÃO é ativação de ambiente`
          : `flags resolvidas ON fora de local-simulated: ${unexpectedOn.join(',')}`,
        'getDomainEventFlags',
        'local',
        structuralOverride
          ? null
          : 'não corrigir remotamente — investigar origem',
        !structuralOverride,
      ),
    );
    pushEv(
      'flag_resolved_overrides',
      'flag-resolution',
      'flags',
      structuralOverride ? 'warn' : 'fail',
      `unexpected=${unexpectedOn.length}; mode=${executionMode}`,
    );
  } else {
    checks.push(
      chk(
        'flag_resolved_overrides',
        'flags',
        'pass',
        'nenhum override ON na resolução',
        'getDomainEventFlags',
        'local',
      ),
    );
    pushEv('flag_resolved_overrides', 'flag-resolution', 'flags', 'pass', 'all off');
  }

  // 6. Dependency resolution (local structural)
  const validOrder = [
    'DOMAIN_EVENTS',
    'DOMAIN_EVENT_AUDIT',
    'DOMAIN_EVENT_OBSERVABILITY',
    'DOMAIN_EVENT_CONSUMERS',
    'DOMAIN_EVENT_PROJECTION',
    'DOMAIN_EVENT_ANALYTICS',
    'CQRS_READ_MODEL',
    'CQRS_READ_MODEL_CONSISTENCY',
    'CQRS_READ_MODEL_SOAK',
    'LEAD_ANALYTICS_READ_MODEL',
  ] as const;
  const orderOk = validateFlagEnablementOrder(validOrder).ok;
  const invalidAnalytics = !validateFlagEnablementOrder(['DOMAIN_EVENT_ANALYTICS']).ok;
  const invalidConsumers = !validateFlagEnablementOrder(['DOMAIN_EVENT_CONSUMERS']).ok;
  const invalidSimRm = !assertSequentialReadModelsOnly([
    'LEAD_ANALYTICS_READ_MODEL',
    'APPOINTMENT_ANALYTICS_READ_MODEL',
  ]).ok;
  const stagesOk = STAGING_ACTIVATION_STAGES.length >= 8
    && RECOMMENDED_READ_MODEL_FLAG_ORDER[0] === 'LEAD_ANALYTICS_READ_MODEL';
  const depsOk = orderOk && invalidAnalytics && invalidConsumers && invalidSimRm && stagesOk;
  checks.push(
    chk(
      'flag_dependency_resolution',
      'flags',
      depsOk ? 'pass' : 'fail',
      depsOk ? 'ordem/deps estruturais OK' : 'falha na validação de ordem/deps',
      'stagingFlagMatrix',
      'local',
    ),
  );
  pushEv('flag_dependency_resolution', 'static-analysis', 'flagMatrix', depsOk ? 'pass' : 'fail', 'local validation');

  // 7. Tenant-scoped projections
  const scopes = Object.values(ANALYTICS_PROJECTION_SCOPE_BY_ID);
  const defs = listAnalyticsProjectionDefinitions();
  const scopeOk = scopes.every((s) => s === 'tenant')
    && defs.every((d) => d.scope === 'tenant' && d.tenantRequired === true)
    && CQRS_PROMOTION_READ_MODEL_IDS.every(
      (id) => getReadModelProjectionScope(id).scope === 'tenant',
    );
  checks.push(
    chk(
      'tenant_scoped_projections',
      'tenant-scope',
      scopeOk ? 'pass' : 'fail',
      scopeOk ? 'projections/RMs tenant-scoped' : 'scope não tenant',
      'readModelProjectionScope',
      'local',
    ),
  );
  pushEv('tenant_scoped_projections', 'contract', 'tenantScope', scopeOk ? 'pass' : 'fail', 'tenantRequired');

  // 8. Promotion readiness
  const promotion = buildReadModelPromotionReport(flagsInput);
  const promoBy: Record<string, string> = {};
  let promoAllReady = true;
  for (const id of CQRS_PROMOTION_READ_MODEL_IDS) {
    const st = promotion.byReadModel[id] || 'not_ready';
    promoBy[id] = st;
    if (st !== 'ready') promoAllReady = false;
  }
  const promoOk = promoAllReady && promotion.autoPromote === false;
  // Sem soak prévio, expected not ready — ainda bloqueia “passed”, mas evidencia-se
  checks.push(
    chk(
      'promotion_readiness',
      'promotion',
      promoOk ? 'pass' : 'fail',
      `overall=${promotion.overall}; autoPromote=${promotion.autoPromote}; by=${JSON.stringify(promoBy)}`,
      'buildReadModelPromotionReport',
      'local',
      promoOk
        ? null
        : 'rodar validação estrutural local (attach+soak) em teste; não é soak remoto',
      true,
    ),
  );
  pushEv(
    'promotion_readiness',
    'inspection',
    'promotion',
    promoOk ? 'pass' : 'fail',
    `autoPromote=${promotion.autoPromote}`,
  );

  // 9. Observability readiness (disponibilidade de APIs — sem attach no boot)
  const obsOk = typeof buildCqrsArchitectureCertificationReport === 'function'
    && typeof buildReadModelPromotionReport === 'function';
  checks.push(
    chk(
      'observability_readiness',
      'observability',
      obsOk ? 'pass' : 'fail',
      'Inspector/Health/Metrics foundation disponível (sem auto-attach)',
      'domain-events APIs',
      'local',
    ),
  );
  pushEv('observability_readiness', 'inspection', 'observability', 'pass', 'no auto-bootstrap');

  // 10. Rollback readiness
  const rollback = buildStagingRollbackPlan();
  const rbOk = rollback.steps.length === STAGING_ROLLBACK_FLAG_ORDER.length
    && rollback.requiresMigration === false
    && rollback.drill.remoteExecutionAllowed === false
    && rollback.drill.status === 'planned_not_executed'
    && rollback.steps[0].flag === 'FINANCIAL_ANALYTICS_READ_MODEL'
    && rollback.steps[rollback.steps.length - 1].flag === 'DOMAIN_EVENTS';
  checks.push(
    chk(
      'rollback_readiness',
      'rollback',
      rbOk ? 'pass' : 'fail',
      `steps=${rollback.steps.length}; drill=${rollback.drill.status}`,
      'stagingRollback',
      'local',
    ),
  );
  pushEv('rollback_readiness', 'contract', 'rollback', rbOk ? 'pass' : 'fail', 'no remote drill');

  // 11. Evidence requirements
  const requiredTypes = [
    'preflight', 'flag-resolution', 'event-observability', 'consumer', 'projection',
    'read-model', 'soak', 'consistency', 'drift', 'tenant-isolation', 'rollback', 'manual-review',
  ];
  const evOk = requiredTypes.every((t) =>
    STAGING_EVIDENCE_REQUIREMENTS.some((r) => r.type === t && r.required),
  );
  checks.push(
    chk(
      'evidence_requirements',
      'evidence',
      evOk ? 'pass' : 'fail',
      `requirements=${STAGING_EVIDENCE_REQUIREMENTS.length}`,
      'STAGING_EVIDENCE_REQUIREMENTS',
      'local',
    ),
  );
  pushEv('evidence_requirements', 'contract', 'evidence', evOk ? 'pass' : 'fail', 'plan requirements only');

  // 12. Regression baseline
  const reg = options.regression || null;
  if (!reg) {
    checks.push(
      chk(
        'regression_baseline',
        'regression',
        'manual-required',
        'regressão deve ser registrada via npm test (evidência externa)',
        'vitest',
        'none',
        'executar regressão completa e injetar evidência',
      ),
    );
    pushEv('regression_baseline', 'manual-required', 'vitest', 'manual-required', 'not injected');
  } else if (reg.failed > 0) {
    checks.push(
      chk(
        'regression_baseline',
        'regression',
        'fail',
        `failed=${reg.failed}; passed=${reg.passed}`,
        'vitest',
        'local',
        'corrigir regressão',
        true,
      ),
    );
    pushEv('regression_baseline', 'test', 'vitest', 'fail', `failed=${reg.failed}`);
  } else {
    checks.push(
      chk(
        'regression_baseline',
        'regression',
        'pass',
        `files=${reg.testFiles}; passed=${reg.passed}; skipped=${reg.skipped}; delta=${reg.passed - reg.previousPassed}`,
        'vitest',
        'local',
      ),
    );
    pushEv(
      'regression_baseline',
      'test',
      'vitest',
      'pass',
      `passed=${reg.passed}; skip=${reg.skipped}`,
    );
  }

  // Read-only staging: never executed without real auth
  if (executionMode !== 'authorized-staging-readonly') {
    checks.push(
      chk(
        'readonly_staging_check',
        'staging-readonly',
        'manual-required',
        'inspeção remota não executada — sem autorização real / read-only não garantido',
        'policy',
        'none',
        'autorizar staging + ferramenta read-only antes de inspecionar remoto',
      ),
    );
    pushEv('readonly_staging_check', 'manual-required', 'policy', 'manual-required', 'skipped remote');
  }

  const authPending = plan.authorization.status === 'pending' || !authUsable;
  const envBlocked = plan.environment.status === 'blocked' || plan.environment.isProduction;
  const tenantsInvalid = !plan.tenants.valid;
  const result = deriveResult({
    checks,
    authPending,
    envBlocked,
    tenantsInvalid,
    production: plan.environment.isProduction,
  });
  const recommendation = deriveRecommendation({
    result,
    authPending,
    envBlocked: !envAuthorized && !plan.environment.isProduction,
    tenantsInvalid,
  });

  const blockers = Object.freeze([
    ...new Set(
      checks
        .filter((c) => c.result === 'fail' || (c.blocking && c.result !== 'pass'))
        .map((c) => `${c.checkId}: ${c.message}`),
    ),
  ]);
  const warnings = Object.freeze([
    ...new Set(
      checks
        .filter((c) => c.result === 'warning' || c.result === 'manual-required')
        .map((c) => `${c.checkId}: ${c.message}`),
    ),
  ]);

  const finishedAt = new Date().toISOString();

  return Object.freeze({
    executionId,
    planId: plan.planId,
    architectureVersion: LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION,
    environmentId: plan.environment.environmentId,
    executionMode,
    startedAt,
    finishedAt,
    operator,
    authorizationStatus: plan.authorization.status,
    environmentStatus: plan.environment.status,
    tenantSelectionStatus: plan.tenants.valid ? 'valid' : 'invalid_or_absent',
    checks: Object.freeze([...checks]),
    evidence: Object.freeze([...evidence]),
    blockers,
    warnings,
    result,
    recommendation,
    remoteActionsExecuted: false,
    flagsChanged: false,
  });
}

export function __resetStagingPreflightExecSeqForTest(): void {
  execSeq = 0;
}

export { BASELINE_FLAGS };
