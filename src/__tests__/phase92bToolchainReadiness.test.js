/**
 * Phase 9.2B — testes estáticos de toolchain readiness (sem start/reset).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LOCAL_PROJECT_ID,
  PRODUCTION_REF,
  STAGING_REF,
  auditRemoteLinkArtifacts,
} from '../../scripts/supabase/constants.mjs';
import { evaluateIsolation } from '../../scripts/supabase/isolation.mjs';
import { evaluateOptInContract } from '../../scripts/supabase/optInContract.mjs';
import { evaluateLocalSupabaseDryRunReadiness } from '../../scripts/supabase/readinessEvaluator.mjs';
import { guardCommand } from '../../scripts/supabase/remoteGuard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

describe('Phase 9.2B — Opt-in Contract (STATIC)', () => {
  it('nenhum nível', () => {
    const c = evaluateOptInContract({});
    expect(c.status).toBe('OPT_IN_NONE');
    expect(c.level3Authorized).toBe(false);
    expect(c.dryRunExecutionAllowed).toBe(false);
  });

  it('apenas Nível 1', () => {
    const c = evaluateOptInContract({ RUN_SUPABASE_LOCAL_INTEGRATION: 'true' });
    expect(c.status).toBe('OPT_IN_LEVEL_1_ONLY');
    expect(c.dryRunExecutionAllowed).toBe(false);
  });

  it('Níveis 1 e 2 sem reset', () => {
    const c = evaluateOptInContract({
      RUN_SUPABASE_LOCAL_INTEGRATION: 'true',
      LOVE_ODONTO_LOCAL_DB_CONFIRMATION: 'LOCAL_DISPOSABLE_ONLY',
    });
    expect(c.status).toBe('OPT_IN_LEVELS_1_2');
    expect(c.level3Authorized).toBe(false);
    expect(c.dryRunExecutionAllowed).toBe(false);
  });

  it('três níveis permitem dry-run futuro, mas 9.2B não autoriza execução', () => {
    const c = evaluateOptInContract({
      RUN_SUPABASE_LOCAL_INTEGRATION: 'true',
      LOVE_ODONTO_LOCAL_DB_CONFIRMATION: 'LOCAL_DISPOSABLE_ONLY',
      APPLY_LOCAL_DB_RESET: 'true',
    });
    expect(c.status).toBe('OPT_IN_ALL_THREE');
    expect(c.dryRunExecutionAllowed).toBe(true);
    expect(c.phase92bAllowsLevel3Execution).toBe(false);
  });
});

describe('Phase 9.2B — Guards / allowlist (STATIC)', () => {
  it('denylist bloqueia push/link/token env', () => {
    expect(guardCommand('supabase', ['db', 'push'], {}).status).toBe('BLOCKED_REMOTE_COMMAND');
    expect(guardCommand('supabase', ['link'], {}).status).toBe('BLOCKED_REMOTE_COMMAND');
    expect(guardCommand('supabase', ['migration', 'repair'], {}).status).toBe('BLOCKED_REMOTE_COMMAND');
    expect(
      guardCommand('supabase', ['status'], { SUPABASE_ACCESS_TOKEN: 'x' }).status,
    ).toBe('BLOCKED_REMOTE_DATABASE_URL');
    expect(
      guardCommand('supabase', ['status'], { SUPABASE_SERVICE_ROLE_KEY: 'x' }).status,
    ).toBe('BLOCKED_REMOTE_DATABASE_URL');
  });

  it('allowlist --version/status/reset permitidos estruturalmente', () => {
    expect(guardCommand('supabase', ['--version'], {}).status).toBe('SAFE_LOCAL_ENVIRONMENT');
    expect(guardCommand('supabase', ['status'], {}).status).toBe('SAFE_LOCAL_ENVIRONMENT');
    expect(guardCommand('supabase', ['db', 'reset', '--yes'], {}).status).toBe('SAFE_LOCAL_ENVIRONMENT');
  });
});

describe('Phase 9.2B — Config / metadata (STATIC)', () => {
  it('config local válida sem remote ref', () => {
    const isolation = evaluateIsolation({});
    expect(isolation.config.status).toBe('CONFIG_LOCAL_OK');
    expect(isolation.config.projectId).toBe(LOCAL_PROJECT_ID);
    expect(isolation.config.remoteRefs).toEqual([]);
  });

  it('metadata remota detectada e preservada', () => {
    const audit = auditRemoteLinkArtifacts();
    expect(audit.linkedPreserved).toBe(true);
    expect(audit.isolationStrategy).toBe('OPTION_1_ISOLATED_WORKDIR');
    if (audit.linkedPresent) {
      expect(audit.linkedRef).toBe(STAGING_REF);
      const raw = fs.readFileSync(path.join(REPO_ROOT, 'supabase/.temp/linked-project.json'), 'utf8');
      expect(raw).toContain(STAGING_REF);
    }
  });
});

describe('Phase 9.2B — Readiness Evaluator (STATIC, sem probe)', () => {
  it('sem probe não retorna READY nem PASS de migration', async () => {
    const r = await evaluateLocalSupabaseDryRunReadiness({
      probeToolchain: false,
      env: {},
    });
    expect(r.status).not.toBe('READY_AWAITING_LOCAL_RESET_AUTHORIZATION');
    expect(r.neverStates.LOCAL_DRY_RUN_PASS).toBe(false);
    expect(r.neverStates.READY_FOR_PHASE_9_3).toBe(false);
    expect(r.migrationsExecuted).toBe(false);
    expect(r.resetExecuted).toBe(false);
    expect(r.remoteActionsExecuted).toBe(false);
    expect(r.actionsForbiddenInThisPhase).toContain('supabase start');
  });

  it('nível 3 presente marca blocker de fase mesmo com probe off', async () => {
    const r = await evaluateLocalSupabaseDryRunReadiness({
      probeToolchain: false,
      env: {
        APPLY_LOCAL_DB_RESET: 'true',
      },
    });
    expect(r.blockers).toContain('LEVEL3_PRESENT_BUT_PHASE_FORBIDS_EXECUTION');
    expect(r.status).not.toMatch(/LOCAL_DRY_RUN_PASS|READY_FOR_PHASE_9_3|MIGRATIONS_APPLIED/);
  });
});

describe('Phase 9.2B — Safety / scripts (STATIC)', () => {
  it('toolchain-check script existe e não contém start/reset/npx', () => {
    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts/supabase/toolchainCheck.mjs'),
      'utf8',
    );
    expect(src).toMatch(/evaluateLocalSupabaseDryRunReadiness/);
    expect(src).not.toMatch(/\['start'\]/);
    expect(src).not.toMatch(/db',\s*'reset/);
    expect(src.includes(['npx', 'supabase'].join(' '))).toBe(false);
  });

  it('package scripts expõem toolchain-check sem npx/refs remotos', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['supabase:local:toolchain-check']).toContain('toolchainCheck');
    expect(pkg.scripts.test).toBe('vitest run');
    const blob = JSON.stringify(pkg.scripts);
    expect(blob.includes(STAGING_REF)).toBe(false);
    expect(blob.includes(PRODUCTION_REF)).toBe(false);
    expect(blob).not.toMatch(/npx\s+supabase/);
  });

  it('readiness evaluator e opt-in contract existem', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'scripts/supabase/readinessEvaluator.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'scripts/supabase/optInContract.mjs'))).toBe(true);
  });
});
