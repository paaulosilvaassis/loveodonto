/**
 * Phase 9.2C — testes estáticos (sem Docker/CLI/npx/rede).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateOptIn } from '../../scripts/supabase/optInContract.mjs';
import { guardCommand } from '../../scripts/supabase/remoteGuard.mjs';
import { runLocalRlsRuntimeValidation } from '../../scripts/supabase/runLocalRlsRuntimeValidation.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

describe('Phase 9.2C — Artefatos (STATIC)', () => {
  it('fixture SQL e runner existem no workdir isolado', () => {
    expect(
      fs.existsSync(path.join(REPO_ROOT, 'supabase-local/fixtures/rls_runtime_validation.sql')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(REPO_ROOT, 'scripts/supabase/runLocalRlsRuntimeValidation.mjs')),
    ).toBe(true);
  });

  it('fixture cobre migrations 020–024 e cenários cross-tenant', () => {
    const sql = fs.readFileSync(
      path.join(REPO_ROOT, 'supabase-local/fixtures/rls_runtime_validation.sql'),
      'utf8',
    );
    expect(sql).toContain('appointments');
    expect(sql).toContain('financial_accounts_receivable');
    expect(sql).toContain('financial_payables');
    expect(sql).toContain('financial_financings');
    expect(sql).toContain('crm_leads');
    expect(sql).toContain('crm_pipeline_stages');
    expect(sql).toContain('collaborator_photos_storage');
    expect(sql).toContain('clinic_logos_storage');
    expect(sql).toContain('storage_013_clinic_logos_policies_present');
    expect(sql).toContain('RLS_RUNTIME_PASS');
    expect(sql).toContain('RLS_RUNTIME_FAILED');
    expect(sql).toContain('user_a_cannot_read_tenant_b_appointments');
    expect(sql).toContain('user_b_cannot_read_tenant_a_appointments');
    expect(sql).toContain('orphan_cannot_update_without_admin_membership');
    expect(sql).toContain('stale_jwt_without_membership_cannot_read');
    expect(sql).toContain('app_metadata_only_can_read_own');
    expect(sql).toContain('user_metadata_cannot_authorize_other_tenant');
    expect(sql).toContain('critical_tables_rls_assert_pass');
    expect(sql).toContain('set_config');
    expect(sql).toContain('set local role authenticated');
    expect(sql).toMatch(
      /grant\s+select,\s*insert,\s*update\s+on\s+table\s+rls_runtime_results\s+to\s+authenticated/i,
    );
    // Comentário de proibição pode citar tokens; código SQL não deve invocá-los.
    const sqlNoComments = sql.replace(/--[^\n]*/g, '');
    expect(sqlNoComments).not.toMatch(/--linked|--db-url|db push|supabase link/i);
  });

  it('runner nunca sugere comandos remotos', () => {
    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts/supabase/runLocalRlsRuntimeValidation.mjs'),
      'utf8',
    );
    expect(src).toContain('remoteActionsExecuted: false');
    expect(src).toContain('docker_exec_psql_local');
    expect(src).toContain('ON_ERROR_STOP=1');
    expect(src).toContain('supabase_db_supabase-local');
    expect(src).not.toMatch(/spawn\([^)]*npx|exec\([^)]*npx|runProcess\(\s*['"]npx/i);
    expect(src).not.toContain("'--linked'");
    expect(src).not.toContain("'db', 'push'");
    expect(src).not.toContain("['link']");
  });

  it('package.json expõe rls-runtime sem misturar no npm test', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.test).toBe('vitest run');
    expect(pkg.scripts['supabase:local:rls-runtime']).toContain('runLocalRlsRuntimeValidation');
    expect(pkg.scripts['test:supabase:phase92c']).toContain('phase92cRlsRuntimeValidation');
  });
});

describe('Phase 9.2C — Guards (STATIC)', () => {
  it('bloqueia query remota e permite query local', () => {
    expect(guardCommand('supabase', ['db', 'query', '--linked', 'select 1'], {}).status)
      .toBe('BLOCKED_REMOTE_COMMAND');
    expect(guardCommand('supabase', ['db', 'query', '--db-url', 'postgres://x', 'select 1'], {}).status)
      .toBe('BLOCKED_REMOTE_COMMAND');
    expect(
      guardCommand('supabase', ['db', 'query', '--local', '--file', 'fixtures/rls_runtime_validation.sql'], {})
        .status,
    ).toBe('SAFE_LOCAL_ENVIRONMENT');
  });

  it('opt-in ausente → skipped sem spawn de query', async () => {
    const report = await runLocalRlsRuntimeValidation({ env: {} });
    expect(report.status).toBe('RLS_RUNTIME_SKIPPED_OPT_IN');
    expect(report.remoteActionsExecuted).toBe(false);
    expect(report.commandsExecuted).toEqual([]);
    expect(evaluateOptIn({}).status).toBe('LOCAL_INTEGRATION_SKIPPED');
  });

  it('dry-run não declara mais RLS_RUNTIME_NOT_SIMULATED', () => {
    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts/supabase/runLocalMigrationDryRun.mjs'),
      'utf8',
    );
    expect(src).not.toContain('RLS_RUNTIME_NOT_SIMULATED');
    expect(src).toContain('DEFERRED_TO_9_2C');
    expect(src).toContain('RLS_RUNTIME_USE_SEPARATE_COMMAND');
  });
});
