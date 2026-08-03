/**
 * Phase 8.6 — Controlled Staging Activation Plan.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOMAIN_EVENT_FLAG_DEFAULTS,
  DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../domain-events/domainEventFlags.ts';
import {
  buildStagingEnvironmentContract,
  buildDefaultBlockedStagingEnvironment,
  buildStagingHumanAuthorization,
  buildPendingStagingAuthorization,
  buildStagingTenantSelection,
  STAGING_FLAG_MATRIX,
  STAGING_ACTIVATION_STAGES,
  RECOMMENDED_READ_MODEL_FLAG_ORDER,
  validateFlagEnablementOrder,
  assertSequentialReadModelsOnly,
  STAGING_ROLLBACK_FLAG_ORDER,
  buildStagingRollbackPlan,
  buildStagingSoakPlan,
  STAGING_SUCCESS_CRITERIA,
  STAGING_FAILURE_CRITERIA,
  STAGING_EVIDENCE_REQUIREMENTS,
  runStagingPreflightChecks,
  evaluateStagingActivationGuards,
  buildControlledStagingActivationPlan,
  buildControlledStagingActivationPlanReport,
  inspectControlledStagingActivationPlan,
  __clearStagingPlanHistoryForTest,
  __resetStagingPlanSeqForTest,
  __resetStagingEvidenceSeqForTest,
} from '../domain-events/staging-activation/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function clearAll() {
  __clearStagingPlanHistoryForTest();
  __resetStagingPlanSeqForTest();
  __resetStagingEvidenceSeqForTest();
}

describe('controlledStagingActivation — environment', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('staging válido quando autorizado explicitamente', () => {
    const env = buildStagingEnvironmentContract({
      environmentId: 'stg-1',
      environmentName: 'sim',
      environmentType: 'local-simulated',
      authorized: true,
      authorizedBy: 'operator-test',
      authorizedAt: new Date().toISOString(),
      allowedTenantIds: ['tenant-a'],
    });
    expect(env.status).toBe('ok');
    expect(env.isStaging).toBe(true);
    expect(env.isProduction).toBe(false);
  });

  it('produção rejeitada por type', () => {
    const env = buildStagingEnvironmentContract({
      environmentType: 'production',
      authorized: true,
      authorizedBy: 'x',
    });
    expect(env.status).toBe('blocked');
    expect(env.isProduction).toBe(true);
  });

  it('host/projectRef de produção rejeitado', () => {
    const env = buildStagingEnvironmentContract({
      environmentType: 'staging',
      projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
      host: `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      authorized: true,
      authorizedBy: 'x',
    });
    expect(env.isProduction).toBe(true);
    expect(env.status).toBe('blocked');
  });

  it('ambiente não autorizado = blocked', () => {
    expect(buildDefaultBlockedStagingEnvironment().status).toBe('blocked');
    const env = buildStagingEnvironmentContract({
      environmentType: 'staging',
      authorized: false,
    });
    expect(env.status).toBe('blocked');
  });

  it('ambiente expirado = blocked', () => {
    const env = buildStagingEnvironmentContract({
      environmentType: 'staging',
      authorized: true,
      authorizedBy: 'op',
      authorizedAt: '2020-01-01T00:00:00.000Z',
      expiresAt: '2020-01-02T00:00:00.000Z',
    });
    expect(env.status).toBe('blocked');
  });

  it('NODE_ENV sozinho não autoriza', () => {
    const env = buildStagingEnvironmentContract({
      nodeEnv: 'staging',
      authorized: false,
    });
    expect(env.status).toBe('blocked');
  });
});

describe('controlledStagingActivation — authorization', () => {
  beforeEach(clearAll);

  it('default pending; autoaprovação proibida', () => {
    expect(buildPendingStagingAuthorization().status).toBe('pending');
    const forced = buildStagingHumanAuthorization({
      autoApprove: true,
      status: 'approved',
      approvedBy: 'nobody',
      approvedAt: new Date().toISOString(),
    });
    expect(forced.status).toBe('pending');
  });

  it('approved exige approvedBy/At', () => {
    const incomplete = buildStagingHumanAuthorization({
      status: 'approved',
      approvedBy: null,
      approvedAt: null,
    });
    expect(incomplete.status).toBe('pending');

    const ok = buildStagingHumanAuthorization({
      status: 'approved',
      approvedBy: 'human-approver',
      approvedAt: new Date().toISOString(),
    });
    expect(ok.status).toBe('approved');
  });

  it('rejected / expired / revoked', () => {
    expect(buildStagingHumanAuthorization({ status: 'rejected' }).status).toBe('rejected');
    expect(buildStagingHumanAuthorization({ status: 'revoked' }).status).toBe('revoked');
    expect(
      buildStagingHumanAuthorization({
        status: 'approved',
        approvedBy: 'h',
        approvedAt: '2020-01-01T00:00:00.000Z',
        expiresAt: '2020-01-02T00:00:00.000Z',
      }).status,
    ).toBe('expired');
  });
});

describe('controlledStagingActivation — tenants', () => {
  it('lista vazia inválida', () => {
    const t = buildStagingTenantSelection({});
    expect(t.valid).toBe(false);
  });

  it('duplicado / piloto+controle / não autorizado', () => {
    expect(
      buildStagingTenantSelection({
        pilotTenantIds: ['a', 'a'],
      }).valid,
    ).toBe(false);
    expect(
      buildStagingTenantSelection({
        pilotTenantIds: ['a'],
        controlTenantIds: ['a'],
      }).valid,
    ).toBe(false);
    expect(
      buildStagingTenantSelection({
        pilotTenantIds: ['a'],
        allowedTenantIds: ['b'],
      }).valid,
    ).toBe(false);
  });

  it('piloto vs controle válidos', () => {
    const t = buildStagingTenantSelection({
      pilotTenantIds: ['pilot-1', 'pilot-2'],
      controlTenantIds: ['control-1'],
      excludedTenantIds: ['excluded-1'],
    });
    expect(t.valid).toBe(true);
    expect(t.pilotTenantIds).toHaveLength(2);
  });

  it('marcador production proibido', () => {
    expect(
      buildStagingTenantSelection({
        pilotTenantIds: ['tenant-production-1'],
      }).valid,
    ).toBe(false);
  });
});

describe('controlledStagingActivation — flag order', () => {
  it('matriz cobre flags de ativação', () => {
    expect(STAGING_FLAG_MATRIX.length).toBeGreaterThanOrEqual(12);
    expect(RECOMMENDED_READ_MODEL_FLAG_ORDER).toEqual([
      'LEAD_ANALYTICS_READ_MODEL',
      'APPOINTMENT_ANALYTICS_READ_MODEL',
      'FINANCIAL_ANALYTICS_READ_MODEL',
    ]);
  });

  it('ordem correta passa', () => {
    const order = [
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
    ];
    expect(validateFlagEnablementOrder(order).ok).toBe(true);
  });

  it('analytics/consumers/RM antes de deps falha', () => {
    expect(
      validateFlagEnablementOrder(['DOMAIN_EVENT_ANALYTICS']).ok,
    ).toBe(false);
    expect(
      validateFlagEnablementOrder(['DOMAIN_EVENT_CONSUMERS']).ok,
    ).toBe(false);
    expect(
      validateFlagEnablementOrder([
        'DOMAIN_EVENTS',
        'LEAD_ANALYTICS_READ_MODEL',
      ]).ok,
    ).toBe(false);
  });

  it('ativação simultânea de RMs proibida', () => {
    expect(
      assertSequentialReadModelsOnly([
        'LEAD_ANALYTICS_READ_MODEL',
        'APPOINTMENT_ANALYTICS_READ_MODEL',
      ]).ok,
    ).toBe(false);
  });

  it('stages sequenciais', () => {
    expect(STAGING_ACTIVATION_STAGES[0].stageId).toBe('preflight');
    expect(STAGING_ACTIVATION_STAGES.map((s) => s.order)).toEqual(
      [...STAGING_ACTIVATION_STAGES].map((s) => s.order).sort((a, b) => a - b),
    );
  });
});

describe('controlledStagingActivation — preflight / criteria / soak / rollback', () => {
  beforeEach(clearAll);

  it('preflight retorna checks obrigatórios', () => {
    const plan = buildControlledStagingActivationPlan();
    const checks = runStagingPreflightChecks(plan);
    const ids = checks.map((c) => c.checkId);
    expect(ids).toContain('architecture_certified');
    expect(ids).toContain('human_approval');
    expect(ids).toContain('flags_initially_false');
    expect(ids).toContain('rollback_prepared');
    expect(ids).toContain('evidence_requirements');
    expect(checks.find((c) => c.checkId === 'human_approval')?.result).toBe(
      'manual-required',
    );
  });

  it('success e failure criteria definidos', () => {
    expect(STAGING_SUCCESS_CRITERIA.length).toBeGreaterThanOrEqual(15);
    expect(STAGING_FAILURE_CRITERIA.every((f) => f.requiresRollback)).toBe(true);
  });

  it('soak 48–72h sem scheduler', () => {
    const soak = buildStagingSoakPlan();
    expect(soak.recommendedDurationHoursMin).toBe(48);
    expect(soak.recommendedDurationHoursMax).toBe(72);
    expect(soak.schedulerAllowed).toBe(false);
    expect(soak.backgroundWorkerAllowed).toBe(false);
    expect(soak.multiTenant.inventRealTenantIds).toBe(false);
    expect(soak.windows.length).toBeGreaterThanOrEqual(8);
  });

  it('rollback ordem reversa completa', () => {
    const rb = buildStagingRollbackPlan();
    expect(rb.steps[0].flag).toBe('FINANCIAL_ANALYTICS_READ_MODEL');
    expect(rb.steps[rb.steps.length - 1].flag).toBe('DOMAIN_EVENTS');
    expect(rb.requiresMigration).toBe(false);
    expect(rb.drill.remoteExecutionAllowed).toBe(false);
    expect(rb.drill.status).toBe('planned_not_executed');
    expect([...STAGING_ROLLBACK_FLAG_ORDER]).toContain('DOMAIN_EVENTS');
  });

  it('evidence requirements cobrem tipos', () => {
    expect(STAGING_EVIDENCE_REQUIREMENTS.map((e) => e.type)).toContain('soak');
    expect(STAGING_EVIDENCE_REQUIREMENTS.map((e) => e.type)).toContain('rollback');
  });
});

describe('controlledStagingActivation — plan / report / inspector / guards', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('plano default pending_authorization + regras', () => {
    const plan = buildControlledStagingActivationPlan();
    expect(plan.status).toBe('pending_authorization');
    expect(plan.humanApprovalRequired).toBe(true);
    expect(plan.autoPromotionAllowed).toBe(false);
    expect(plan.authorization.status).toBe('pending');
  });

  it('teste estrutural local-simulated pode atingir ready', () => {
    const plan = buildControlledStagingActivationPlan({
      allowReadyForStructuralTest: true,
      forcedStatus: 'ready',
      environment: {
        environmentType: 'local-simulated',
        authorized: true,
        authorizedBy: 'test-op',
        authorizedAt: new Date().toISOString(),
        allowedTenantIds: ['t1'],
      },
      authorization: {
        status: 'approved',
        approvedBy: 'human-approver',
        approvedAt: new Date().toISOString(),
        tenantIds: ['t1'],
      },
      tenants: { pilotTenantIds: ['t1'] },
    });
    expect(plan.status).toBe('ready');
    expect(plan.environment.environmentType).toBe('local-simulated');
  });

  it('builder não avança para running', () => {
    const plan = buildControlledStagingActivationPlan({
      forcedStatus: 'running',
      environment: {
        environmentType: 'local-simulated',
        authorized: true,
        authorizedBy: 'x',
        authorizedAt: new Date().toISOString(),
      },
    });
    expect(plan.status).toBe('pending_authorization');
  });

  it('report recommendation segura', () => {
    const report = buildControlledStagingActivationPlanReport();
    expect(report.recommendation).toBe(
      'staging_plan_ready_awaiting_explicit_authorization',
    );
    expect(report.recommendation).not.toMatch(/activate|promote|enable/i);
    expect(report.plan.autoPromotionAllowed).toBe(false);
    expect(report.humanApprovalStatus).toBe('pending');
  });

  it('produção no input → recommendation blocked', () => {
    const report = buildControlledStagingActivationPlanReport(
      {},
      { environment: { environmentType: 'production' } },
    );
    expect(report.recommendation).toBe('blocked_production_or_unauthorized_host');
  });

  it('guards bloqueiam pending/unauthorized', () => {
    const plan = buildControlledStagingActivationPlan();
    const g = evaluateStagingActivationGuards(plan);
    expect(g.ok).toBe(false);
    expect(g.blockers.some((b) => /autorização humana pending/i.test(b))).toBe(true);
  });

  it('inspector histórico in-memory', () => {
    const snap = inspectControlledStagingActivationPlan();
    expect(snap.remoteActivationAllowed).toBe(false);
    expect(snap.autoPromotionAllowed).toBe(false);
    expect(snap.history.length).toBeGreaterThan(0);
    expect(snap.planStatus).toBe('pending_authorization');
  });
});

describe('controlledStagingActivation — safety', () => {
  it('flags defaults OFF + locks preservados', () => {
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.DOMAIN_EVENTS).toBe(false);
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.CQRS_READ_MODEL).toBe(false);
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.LEAD_ANALYTICS_READ_MODEL).toBe(false);
    expect(DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS).toContain('DOMAIN_EVENTS');
    expect(DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS).toContain('CQRS_READ_MODEL');
  });

  it('camada sem HTTP / persistência / remote client', () => {
    const dir = path.join(__dirname, '../domain-events/staging-activation');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(src).not.toMatch(/createClient\(/);
      expect(src).not.toMatch(/\bapp\.(get|post|use)\(/);
      expect(src).not.toMatch(/from ['"][^'"]*Repository[^'"]*['"]/);
    }
  });

  it('playbook existe', () => {
    const p = path.join(
      __dirname,
      '../../docs/playbooks/CQRS_CONTROLLED_STAGING_ACTIVATION_PLAYBOOK.md',
    );
    expect(fs.existsSync(p)).toBe(true);
  });
});
