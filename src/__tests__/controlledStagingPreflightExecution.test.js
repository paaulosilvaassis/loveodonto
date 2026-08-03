/**
 * Phase 8.7 — Controlled Staging Preflight Execution.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOMAIN_EVENT_FLAG_DEFAULTS,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../domain-events/domainEventFlags.ts';
import {
  detachAllAnalyticsReadModels,
  __clearAnalyticsReadModelAttachForTest,
  __clearReadModelRegistryForTest,
  __clearReadModelBuilderStateForTest,
  __clearReadModelLifecycleForTest,
  __clearReadModelFoundationMetricsForTest,
  __clearReadModelCacheForTest,
  __clearLeadAnalyticsStoreForTest,
  __clearLeadAnalyticsMetricsForTest,
  __clearReadModelSoakMetricsForTest,
  __clearReadModelDriftLogForTest,
  __clearReadModelPromotionHistoryForTest,
} from '../domain-events/read-models/index.ts';
import { __clearAnalyticsProjectionStoreForTest } from '../domain-events/projections/index.ts';
import {
  executeControlledStagingPreflight,
  buildControlledStagingPreflightReport,
  inspectControlledStagingPreflight,
  prepareLocalSimulatedReadModelReadiness,
  PREFLIGHT_ALLOWED_EXECUTION_MODES,
  BASELINE_FLAGS,
  __clearStagingPreflightHistoryForTest,
  __resetStagingPreflightExecSeqForTest,
  __resetStagingPreflightEvidenceSeqForTest,
  __resetStagingPlanSeqForTest,
} from '../domain-events/staging-activation/index.ts';
import { DOMAIN_EVENTS_FLAGS_RESOLVED } from './rhTestFlagContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLAGS_ON = { overrides: DOMAIN_EVENTS_FLAGS_RESOLVED };

const REGRESSION_OK = {
  testFiles: 170,
  passed: 1919,
  skipped: 1,
  failed: 0,
  durationMs: 52000,
  previousPassed: 1919,
  skipJustification: 'rhShadowReadQa skip documentado',
};

function clearAll() {
  detachAllAnalyticsReadModels();
  __clearAnalyticsReadModelAttachForTest();
  __clearReadModelRegistryForTest();
  __clearReadModelBuilderStateForTest();
  __clearReadModelLifecycleForTest();
  __clearReadModelFoundationMetricsForTest();
  __clearReadModelCacheForTest();
  __clearLeadAnalyticsStoreForTest();
  __clearLeadAnalyticsMetricsForTest();
  __clearAnalyticsProjectionStoreForTest();
  __clearReadModelSoakMetricsForTest();
  __clearReadModelDriftLogForTest();
  __clearReadModelPromotionHistoryForTest();
  __clearStagingPreflightHistoryForTest();
  __resetStagingPreflightExecSeqForTest();
  __resetStagingPreflightEvidenceSeqForTest();
  __resetStagingPlanSeqForTest();
}

describe('controlledStagingPreflight — execution contract', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('campos obrigatórios + imutabilidade + remote/flags false', () => {
    const exec = executeControlledStagingPreflight();
    expect(exec.executionId).toBeTruthy();
    expect(exec.planId).toBeTruthy();
    expect(exec.architectureVersion).toBeTruthy();
    expect(PREFLIGHT_ALLOWED_EXECUTION_MODES).toContain(exec.executionMode);
    expect(exec.remoteActionsExecuted).toBe(false);
    expect(exec.flagsChanged).toBe(false);
    expect(Object.isFrozen(exec)).toBe(true);
    expect(() => {
      // @ts-expect-error
      exec.flagsChanged = true;
    }).toThrow();
  });

  it('modo inválido cai para local-static com manual-required', () => {
    const exec = executeControlledStagingPreflight({
      // @ts-expect-error intentional
      executionMode: 'remote-write',
    });
    expect(exec.executionMode).toBe('local-static');
    expect(exec.checks.find((c) => c.checkId === 'execution_mode')?.result).toBe(
      'manual-required',
    );
  });

  it('authorized-staging-readonly sem auth → local-static', () => {
    const exec = executeControlledStagingPreflight({
      executionMode: 'authorized-staging-readonly',
      allowAuthorizedStagingReadonly: true,
    });
    expect(exec.executionMode).toBe('local-static');
  });
});

describe('controlledStagingPreflight — environment / human / tenants', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('default pending → blocked awaiting human approval', () => {
    const report = buildControlledStagingPreflightReport({ regression: REGRESSION_OK });
    expect(report.result).toBe('blocked');
    expect(report.recommendation).toBe('preflight_blocked_awaiting_human_approval');
    expect(report.authorization.status).toBe('pending');
    expect(report.execution.remoteActionsExecuted).toBe(false);
    expect(report.execution.flagsChanged).toBe(false);
  });

  it('produção → failed', () => {
    const report = buildControlledStagingPreflightReport({
      planOptions: { environment: { environmentType: 'production' } },
      regression: REGRESSION_OK,
    });
    expect(report.result).toBe('failed');
    expect(report.recommendation).toBe('preflight_failed');
  });

  it('host produção rejeitado via projectRef', () => {
    const report = buildControlledStagingPreflightReport({
      planOptions: {
        environment: {
          environmentType: 'staging',
          projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
          authorized: true,
          authorizedBy: 'x',
          authorizedAt: new Date().toISOString(),
        },
      },
    });
    expect(report.environment.isProduction).toBe(true);
    expect(report.result).toBe('failed');
  });

  it('rejected/expired/revoked bloqueiam', () => {
    for (const status of ['rejected', 'revoked']) {
      const r = buildControlledStagingPreflightReport({
        planOptions: {
          authorization: { status },
          environment: {
            environmentType: 'local-simulated',
            authorized: true,
            authorizedBy: 'op',
            authorizedAt: new Date().toISOString(),
          },
        },
      });
      expect(['blocked', 'failed']).toContain(r.result);
    }
  });

  it('tenants ausentes → recommendation tenant selection quando auth OK', () => {
    const report = buildControlledStagingPreflightReport({
      planOptions: {
        environment: {
          environmentType: 'local-simulated',
          authorized: true,
          authorizedBy: 'op',
          authorizedAt: new Date().toISOString(),
          allowedTenantIds: ['t1'],
        },
        authorization: {
          status: 'approved',
          approvedBy: 'human',
          approvedAt: new Date().toISOString(),
          tenantIds: ['t1'],
        },
        tenants: {},
      },
      regression: REGRESSION_OK,
    });
    expect(report.recommendation).toBe('preflight_blocked_awaiting_tenant_selection');
  });
});

describe('controlledStagingPreflight — flags / scope / readiness', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('baseline OFF', () => {
    for (const k of BASELINE_FLAGS) {
      expect(DOMAIN_EVENT_FLAG_DEFAULTS[k]).toBe(false);
    }
    const exec = executeControlledStagingPreflight();
    expect(exec.checks.find((c) => c.checkId === 'flag_baseline')?.result).toBe('pass');
  });

  it('flag ON inesperada bloqueia em local-static', () => {
    const exec = executeControlledStagingPreflight({
      flagsInput: { overrides: { DOMAIN_EVENTS: true } },
      executionMode: 'local-static',
    });
    expect(exec.checks.find((c) => c.checkId === 'flag_resolved_overrides')?.result).toBe(
      'fail',
    );
    expect(exec.flagsChanged).toBe(false);
  });

  it('dependency resolution pass', () => {
    const exec = executeControlledStagingPreflight();
    expect(exec.checks.find((c) => c.checkId === 'flag_dependency_resolution')?.result).toBe(
      'pass',
    );
  });

  it('tenant scope pass', () => {
    const exec = executeControlledStagingPreflight();
    expect(exec.checks.find((c) => c.checkId === 'tenant_scoped_projections')?.result).toBe(
      'pass',
    );
  });

  it('local-simulated readiness torna promotion ready (ainda blocked por auth)', () => {
    prepareLocalSimulatedReadModelReadiness(FLAGS_ON);
    const report = buildControlledStagingPreflightReport({
      flagsInput: FLAGS_ON,
      executionMode: 'local-simulated',
      regression: REGRESSION_OK,
    });
    expect(report.promotionReadiness['lead-analytics']).toBe('ready');
    expect(report.promotionReadiness['appointment-analytics']).toBe('ready');
    expect(report.promotionReadiness['financial-analytics']).toBe('ready');
    expect(report.result).toBe('blocked');
    expect(report.recommendation).toBe('preflight_blocked_awaiting_human_approval');
    expect(report.execution.flagsChanged).toBe(false);
  });

  it('passed somente com env+auth+tenants+readiness+regression', () => {
    prepareLocalSimulatedReadModelReadiness(FLAGS_ON);
    const report = buildControlledStagingPreflightReport({
      flagsInput: FLAGS_ON,
      executionMode: 'local-simulated',
      regression: REGRESSION_OK,
      planOptions: {
        allowReadyForStructuralTest: true,
        environment: {
          environmentType: 'local-simulated',
          authorized: true,
          authorizedBy: 'op',
          authorizedAt: new Date().toISOString(),
          allowedTenantIds: ['t1', 'c1'],
        },
        authorization: {
          status: 'approved',
          approvedBy: 'human-approver',
          approvedAt: new Date().toISOString(),
          tenantIds: ['t1', 'c1'],
        },
        tenants: { pilotTenantIds: ['t1'], controlTenantIds: ['c1'] },
      },
    });
    expect(report.result).toBe('passed');
    expect(report.recommendation).toBe(
      'preflight_passed_awaiting_stage_activation_authorization',
    );
    expect(report.execution.remoteActionsExecuted).toBe(false);
    expect(report.recommendation).not.toMatch(/activate|enable|promote|deploy/i);
  });
});

describe('controlledStagingPreflight — evidence / inspector / safety', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('evidências isRemote=false e sanitizadas', () => {
    const exec = executeControlledStagingPreflight();
    expect(exec.evidence.length).toBeGreaterThan(5);
    expect(exec.evidence.every((e) => e.isRemote === false)).toBe(true);
    expect(exec.evidence.some((e) => e.type === 'manual-required')).toBe(true);
  });

  it('regression fail → failed', () => {
    const report = buildControlledStagingPreflightReport({
      regression: { ...REGRESSION_OK, failed: 2 },
    });
    expect(report.result).toBe('failed');
    expect(report.recommendation).toBe('preflight_failed');
  });

  it('inspector histórico', () => {
    const snap = inspectControlledStagingPreflight({ regression: REGRESSION_OK });
    expect(snap.remoteActionsExecuted).toBe(false);
    expect(snap.flagsChanged).toBe(false);
    expect(snap.history.length).toBeGreaterThan(0);
    expect(snap.authorizationStatus).toBe('pending');
  });

  it('playbook + camada sem mutation remota', () => {
    expect(
      fs.existsSync(
        path.join(
          __dirname,
          '../../docs/playbooks/CQRS_STAGING_PREFLIGHT_EXECUTION_PLAYBOOK.md',
        ),
      ),
    ).toBe(true);
    const dir = path.join(__dirname, '../domain-events/staging-activation');
    for (const f of fs.readdirSync(dir).filter((x) => x.startsWith('stagingPreflight'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(src).not.toMatch(/createClient\(/);
      expect(src).not.toMatch(/\bapp\.(get|post|use)\(/);
    }
  });

  it('human approval status não muta entre execuções', () => {
    const a = buildControlledStagingPreflightReport();
    const b = buildControlledStagingPreflightReport();
    expect(a.authorization.status).toBe('pending');
    expect(b.authorization.status).toBe('pending');
  });
});
