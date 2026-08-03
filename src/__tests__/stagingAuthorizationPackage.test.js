/**
 * Phase 8.8 — Staging Authorization Package + Stage 1 Readiness Gate.
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
  buildStagingAuthorizationPackage,
  buildStagingAuthorizationPackageReport,
  inspectStagingAuthorizationPackage,
  evaluateStageOneReadiness,
  executeControlledStagingStageOne,
  buildStagingEnvironmentDeclaration,
  buildStagingHumanApprovalForm,
  buildStagingTenantSelectionForm,
  buildStagingReadonlyAccessDeclaration,
  buildStageOneAuthorization,
  STAGE_ONE_AUTHORIZED_FLAGS,
  STAGE_ONE_FORBIDDEN_FLAGS,
  __resetAuthPackageSeqForTest,
  __clearStagingAuthorizationHistoryForTest,
  __resetStageOneCmdSeqForTest,
} from '../domain-events/staging-activation/authorization/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function clearAll() {
  __resetAuthPackageSeqForTest();
  __clearStagingAuthorizationHistoryForTest();
  __resetStageOneCmdSeqForTest();
}

describe('stagingAuthorizationPackage — package', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('default incomplete + imutável + human pending', () => {
    const pkg = buildStagingAuthorizationPackage();
    expect(['incomplete', 'pending_review']).toContain(pkg.status);
    expect(pkg.status).not.toBe('approved_for_stage_one');
    expect(pkg.humanApproval.status).toBe('pending');
    expect(pkg.stageOneAuthorization.status).toBe('pending');
    expect(Object.isFrozen(pkg)).toBe(true);
  });

  it('forced approved_for_stage_one rejeitado automaticamente', () => {
    const pkg = buildStagingAuthorizationPackage({
      forcedStatus: 'approved_for_stage_one',
    });
    expect(pkg.status).not.toBe('approved_for_stage_one');
  });

  it('rejected / expired / revoked', () => {
    expect(buildStagingAuthorizationPackage({ forcedStatus: 'rejected' }).status).toBe(
      'rejected',
    );
    expect(buildStagingAuthorizationPackage({ forcedStatus: 'expired' }).status).toBe(
      'expired',
    );
    expect(buildStagingAuthorizationPackage({ forcedStatus: 'revoked' }).status).toBe(
      'revoked',
    );
  });
});

describe('stagingAuthorizationPackage — environment / approval / tenants', () => {
  it('staging estrutural completo vs produção', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const ok = buildStagingEnvironmentDeclaration({
      environmentId: 'stg',
      environmentName: 'staging',
      environmentType: 'staging',
      host: 'example.supabase.co',
      projectRef: 'stagingref123',
      owner: 'owner',
      declaredBy: 'declarant',
      declaredAt: new Date().toISOString(),
      expiresAt: future,
    });
    expect(ok.complete).toBe(true);
    expect(ok.isStaging).toBe(true);

    const prod = buildStagingEnvironmentDeclaration({
      environmentType: 'staging',
      host: `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
      owner: 'x',
      declaredBy: 'y',
      declaredAt: new Date().toISOString(),
      expiresAt: future,
    });
    expect(prod.isProduction).toBe(true);
    expect(prod.complete).toBe(false);

    expect(buildStagingEnvironmentDeclaration({}).complete).toBe(false);
  });

  it('autoaprovação proibida; aprovador ausente', () => {
    expect(
      buildStagingHumanApprovalForm({
        autoApprove: true,
        status: 'approved',
        approvedBy: 'nobody',
        approvedAt: new Date().toISOString(),
      }).status,
    ).toBe('pending');
    expect(
      buildStagingHumanApprovalForm({
        status: 'approved',
        approvedBy: null,
        approvedAt: null,
      }).status,
    ).toBe('pending');
  });

  it('tenants: vazio, all, conflito', () => {
    expect(buildStagingTenantSelectionForm({}).valid).toBe(false);
    expect(
      buildStagingTenantSelectionForm({ pilotTenantIds: ['all'] }).valid,
    ).toBe(false);
    expect(
      buildStagingTenantSelectionForm({
        pilotTenantIds: ['a'],
        controlTenantIds: ['a'],
      }).valid,
    ).toBe(false);
  });
});

describe('stagingAuthorizationPackage — readonly / stage1 / readiness / dry-run', () => {
  beforeEach(clearAll);

  it('unverified bloqueia; mutation/write rejeitam verified', () => {
    expect(buildStagingReadonlyAccessDeclaration({}).status).toBe('unverified');
    expect(
      buildStagingReadonlyAccessDeclaration({
        claimVerified: true,
        mutationBlocked: false,
        verifiedBy: 'x',
        verifiedAt: new Date().toISOString(),
        verificationMethod: 'manual',
        connectionId: 'c1',
      }).status,
    ).toBe('rejected');
  });

  it('Stage 1 só 3 flags; extras rejeitados', () => {
    expect([...STAGE_ONE_AUTHORIZED_FLAGS]).toEqual([
      'DOMAIN_EVENTS',
      'DOMAIN_EVENT_AUDIT',
      'DOMAIN_EVENT_OBSERVABILITY',
    ]);
    expect(STAGE_ONE_FORBIDDEN_FLAGS).toContain('DOMAIN_EVENT_CONSUMERS');
    expect(STAGE_ONE_FORBIDDEN_FLAGS).toContain('CQRS_READ_MODEL');
    expect(
      buildStageOneAuthorization({
        status: 'approved',
        authorizedBy: 'x',
        authorizedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 1e8).toISOString(),
        extraAuthorizedFlags: ['DOMAIN_EVENT_CONSUMERS'],
      }).status,
    ).toBe('rejected');
  });

  it('readiness default blocked; nunca flags/remote', () => {
    const pkg = buildStagingAuthorizationPackage();
    const gate = evaluateStageOneReadiness(pkg);
    expect(gate.status).toBe('blocked');
    expect(gate.flagsChanged).toBe(false);
    expect(gate.remoteActionsExecuted).toBe(false);
    expect(['blocked', 'manual_required', 'ready_for_explicit_stage_one_execution']).toContain(
      gate.status,
    );
    expect(gate.status).not.toMatch(/running|activated|enabled|promoted/);
  });

  it('dry-run ok; dryRun false rejeitado', () => {
    const ok = executeControlledStagingStageOne({
      authorizationPackageId: 'pkg',
      dryRun: true,
    });
    expect(ok.code).toBe('dry_run_ok');
    expect(ok.flagsChanged).toBe(false);
    expect(ok.mutations).toBe(false);

    const bad = executeControlledStagingStageOne({
      authorizationPackageId: 'pkg',
      dryRun: false,
    });
    expect(bad.code).toBe('not_authorized_in_phase_8_8');
  });

  it('report recommendation segura', () => {
    const report = buildStagingAuthorizationPackageReport();
    expect(report.recommendation).toBe('authorization_package_incomplete');
    expect(report.recommendation).not.toMatch(/activate|enable|execute_stage|promote/i);
    expect(report.humanApproval.status).toBe('pending');
    expect(report.flagsChanged).toBe(false);
    expect(report.remoteActionsExecuted).toBe(false);
  });

  it('inspector histórico', () => {
    const snap = inspectStagingAuthorizationPackage();
    expect(snap.history.length).toBeGreaterThan(0);
    expect(snap.flagsChanged).toBe(false);
  });
});

describe('stagingAuthorizationPackage — safety / flags / templates', () => {
  it('flags defaults OFF', () => {
    for (const f of STAGE_ONE_AUTHORIZED_FLAGS) {
      expect(DOMAIN_EVENT_FLAG_DEFAULTS[f]).toBe(false);
    }
    for (const f of STAGE_ONE_FORBIDDEN_FLAGS) {
      expect(DOMAIN_EVENT_FLAG_DEFAULTS[f]).toBe(false);
    }
  });

  it('templates humanos existem e vazios de dados fictícios críticos', () => {
    const dir = path.join(__dirname, '../../docs/playbooks/templates');
    const files = [
      'CQRS_STAGING_ENVIRONMENT_DECLARATION_TEMPLATE.md',
      'CQRS_STAGE_ONE_HUMAN_APPROVAL_TEMPLATE.md',
      'CQRS_STAGING_TENANT_SELECTION_TEMPLATE.md',
      'CQRS_READONLY_ACCESS_VERIFICATION_TEMPLATE.md',
      'CQRS_STAGE_ONE_ROLLBACK_ACKNOWLEDGEMENT_TEMPLATE.md',
      'CQRS_STAGE_ONE_RISK_ACKNOWLEDGEMENT_TEMPLATE.md',
    ];
    for (const f of files) {
      expect(fs.existsSync(path.join(dir, f))).toBe(true);
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(src).not.toMatch(/uoepkwhqztmsjnzirpev/);
    }
  });

  it('camada authorization sem HTTP/client', () => {
    const dir = path.join(
      __dirname,
      '../domain-events/staging-activation/authorization',
    );
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(src).not.toMatch(/createClient\(/);
      expect(src).not.toMatch(/\bapp\.(get|post|use)\(/);
    }
  });
});
