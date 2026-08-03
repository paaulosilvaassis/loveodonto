/**
 * Phase 9.2A — testes estáticos (sem Docker/CLI/npx/rede).
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
import {
  evaluateOptIn,
  evaluateRemoteGuard,
  guardCommand,
} from '../../scripts/supabase/remoteGuard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

describe('Phase 9.2A — Link Audit (STATIC)', () => {
  it('detecta project ref staging no linked-project quando presente', () => {
    const audit = auditRemoteLinkArtifacts();
    expect(audit.stagingRef).toBe(STAGING_REF);
    expect(audit.productionRef).toBe(PRODUCTION_REF);
    expect(audit.isolationStrategy).toBe('OPTION_1_ISOLATED_WORKDIR');
    expect(audit.linkedPreserved).toBe(true);
    if (audit.linkedPresent) {
      expect(audit.linkedRef).toBe(STAGING_REF);
    }
  });

  it('não remove metadata — path linked permanece', () => {
    const p = path.join(REPO_ROOT, 'supabase/.temp/linked-project.json');
    if (fs.existsSync(p)) {
      const before = fs.readFileSync(p, 'utf8');
      auditRemoteLinkArtifacts();
      expect(fs.readFileSync(p, 'utf8')).toBe(before);
    }
  });
});

describe('Phase 9.2A — Config local (STATIC)', () => {
  it('config.toml isolado sem refs remotos/secrets', () => {
    const isolation = evaluateIsolation({});
    expect(isolation.config.present).toBe(true);
    expect(isolation.config.projectId).toBe(LOCAL_PROJECT_ID);
    expect(isolation.config.remoteRefs).toEqual([]);
    expect(isolation.config.status).toBe('CONFIG_LOCAL_OK');
    const text = fs.readFileSync(path.join(REPO_ROOT, 'supabase-local/config.toml'), 'utf8');
    expect(text).not.toContain(STAGING_REF);
    expect(text).not.toContain(PRODUCTION_REF);
    expect(text).not.toMatch(/service_role|eyJ[a-zA-Z0-9_-]{20,}\./);
    expect(text).not.toMatch(/supabase\.co/);
  });

  it('bootstrap tenants local existe', () => {
    expect(
      fs.existsSync(path.join(REPO_ROOT, 'supabase-local/migrations/000_local_bootstrap_tenants.sql')),
    ).toBe(true);
  });

  it('bootstrap local inclui tenant_users mínimo (Phase 9.2G)', () => {
    const sql = fs.readFileSync(
      path.join(REPO_ROOT, 'supabase-local/migrations/000_local_bootstrap_tenants.sql'),
      'utf8',
    );
    expect(sql).toMatch(/create table if not exists public\.tenant_users/i);
    expect(sql).toMatch(/\bis_active\b/);
    expect(sql).toMatch(/\bhas_system_access\b/);
    expect(sql).toMatch(/\bstatus\b/);
  });

  it('ensureIsolatedMigrationsLayout sincroniza layout CLI 2.x sem symlink', async () => {
    const { ensureIsolatedMigrationsLayout } = await import('../../scripts/supabase/isolation.mjs');
    const {
      ISOLATED_CLI_CONFIG,
      ISOLATED_CLI_MIGRATIONS,
      LOCAL_BOOTSTRAP_MIGRATION,
    } = await import('../../scripts/supabase/constants.mjs');
    const layout = ensureIsolatedMigrationsLayout();
    expect(layout.errors).toEqual([]);
    expect(layout.configSynced).toBe(true);
    expect(fs.existsSync(ISOLATED_CLI_CONFIG)).toBe(true);
    expect(fs.existsSync(path.join(ISOLATED_CLI_MIGRATIONS, LOCAL_BOOTSTRAP_MIGRATION))).toBe(true);
    expect(fs.existsSync(path.join(ISOLATED_CLI_MIGRATIONS, '020_app_appointments.sql'))).toBe(true);
    expect(fs.lstatSync(path.join(ISOLATED_CLI_MIGRATIONS, '020_app_appointments.sql')).isSymbolicLink()).toBe(false);
    expect(layout.cliMigrationCount).toBeGreaterThanOrEqual(26);
  });
});

describe('Phase 9.2A — Guard remoto (STATIC)', () => {
  it('bloqueia db push / link / npx', () => {
    expect(guardCommand('supabase', ['db', 'push'], {}).status).toBe('BLOCKED_REMOTE_COMMAND');
    expect(guardCommand('supabase', ['link'], {}).status).toBe('BLOCKED_REMOTE_COMMAND');
    expect(guardCommand('npx', ['supabase', 'status'], {}).status).toBe('BLOCKED_REMOTE_COMMAND');
  });

  it('bloqueia DATABASE_URL remota e project ref em args', () => {
    expect(
      guardCommand('supabase', ['status'], { DATABASE_URL: 'postgresql://db.example/x' }).status,
    ).toBe('BLOCKED_REMOTE_DATABASE_URL');
    expect(
      guardCommand('supabase', ['status', PRODUCTION_REF], {}).status,
    ).toBe('BLOCKED_PRODUCTION_REFERENCE');
  });

  it('permite comandos locais seguros sem env remoto', () => {
    expect(guardCommand('supabase', ['--version'], {}).status).toBe('SAFE_LOCAL_ENVIRONMENT');
    expect(guardCommand('supabase', ['status'], {}).status).toBe('SAFE_LOCAL_ENVIRONMENT');
    expect(guardCommand('supabase', ['db', 'reset', '--yes'], {}).status).toBe('SAFE_LOCAL_ENVIRONMENT');
  });
});

describe('Phase 9.2A — Opt-in duplo (STATIC)', () => {
  it('ausente → LOCAL_INTEGRATION_SKIPPED', () => {
    const opt = evaluateOptIn({});
    expect(opt.status).toBe('LOCAL_INTEGRATION_SKIPPED');
    const guard = evaluateRemoteGuard({});
    expect(guard.status).toBe('LOCAL_INTEGRATION_SKIPPED');
  });

  it('só integration sem confirmation → skipped', () => {
    const opt = evaluateOptIn({ RUN_SUPABASE_LOCAL_INTEGRATION: 'true' });
    expect(opt.blockers).toContain('LOCAL_CONFIRMATION_REQUIRED');
  });

  it('ambos corretos → OPT_IN_OK', () => {
    const opt = evaluateOptIn({
      RUN_SUPABASE_LOCAL_INTEGRATION: 'true',
      LOVE_ODONTO_LOCAL_DB_CONFIRMATION: 'LOCAL_DISPOSABLE_ONLY',
    });
    expect(opt.status).toBe('OPT_IN_OK');
  });
});

describe('Phase 9.2A — Safety (STATIC)', () => {
  it('scripts supabase não usam launcher npx+CLI', () => {
    const forbidden = ['npx', 'supabase'].join(' ');
    const files = [
      'scripts/supabase/constants.mjs',
      'scripts/supabase/remoteGuard.mjs',
      'scripts/supabase/isolation.mjs',
      'scripts/supabase/toolchainPreflight.mjs',
      'scripts/supabase/runLocalMigrationDryRun.mjs',
      'scripts/supabase/runLocalRlsRuntimeValidation.mjs',
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      expect(src.includes(forbidden)).toBe(false);
    }
  });

  it('runner e playbook existem', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'scripts/supabase/runLocalMigrationDryRun.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'scripts/supabase/runLocalRlsRuntimeValidation.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'docs/playbooks/SUPABASE_LOCAL_DRY_RUN_SETUP.md'))).toBe(true);
  });

  it('package.json expõe scripts locais sem alterar npm test para integração', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.test).toBe('vitest run');
    expect(pkg.scripts['supabase:local:preflight']).toBeTruthy();
    expect(pkg.scripts['supabase:local:dry-run']).toBeTruthy();
    expect(pkg.scripts['supabase:local:rls-runtime']).toContain('runLocalRlsRuntimeValidation');
    expect(pkg.scripts['test:supabase:local']).toContain('runLocalMigrationDryRun');
  });
});
