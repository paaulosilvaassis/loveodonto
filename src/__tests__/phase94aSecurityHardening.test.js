/**
 * Phase 9.4A Security Hardening — testes estáticos (sem Docker/rede).
 * Riscos: JWT stale membership, RLS 020–023, budgets quarantine, app_metadata.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_MIGRATIONS,
  ISOLATED_CLI_MIGRATIONS,
  STAGING_REF,
} from '../../scripts/supabase/constants.mjs';
import {
  ensureIsolatedMigrationsLayout,
  sha256File,
} from '../../scripts/supabase/isolation.mjs';
import { guardCommand } from '../../scripts/supabase/remoteGuard.mjs';
import {
  BUDGETS_SERVICE_QUARANTINED,
  createBudget,
  listBudgets,
  updateBudgetTotal,
} from '../services/budgetsService.js';
import {
  BUDGET_ITEMS_SERVICE_QUARANTINED,
  createBudgetItems,
  listBudgetItemsByBudgetIds,
} from '../services/budgetItemsService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const MIG_NAME = '026_app_security_hardening_membership_jwt_rls.sql';
const APP_026 = path.join(APP_MIGRATIONS, MIG_NAME);
const CLI_026 = path.join(ISOLATED_CLI_MIGRATIONS, MIG_NAME);

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function listJsImportsOf(moduleBaseName) {
  const hits = [];
  const roots = [
    path.join(REPO_ROOT, 'src'),
    path.join(REPO_ROOT, 'console', 'src'),
  ];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'quarantine') continue;
        walk(full);
        continue;
      }
      if (!/\.(js|jsx|ts|tsx|mjs)$/.test(entry.name)) continue;
      if (entry.name === `${moduleBaseName}.js`) continue;
      const src = fs.readFileSync(full, 'utf8');
      if (
        src.includes(`services/${moduleBaseName}`) ||
        src.includes(`/${moduleBaseName}.js`) ||
        src.includes(`'../services/${moduleBaseName}`) ||
        src.includes(`"./${moduleBaseName}`)
      ) {
        hits.push(path.relative(REPO_ROOT, full));
      }
    }
  };
  for (const root of roots) walk(root);
  return hits;
}

describe('Phase 9.4A Security — Migration 026 (STATIC)', () => {
  it('026 existe na canônica e no espelho CLI com mesmo SHA-256', () => {
    expect(fs.existsSync(APP_026)).toBe(true);
    const layout = ensureIsolatedMigrationsLayout();
    expect(layout.checksum.status).toBe('ISOLATED_MIGRATION_CHECKSUM_OK');
    expect(fs.existsSync(CLI_026)).toBe(true);
    expect(sha256File(CLI_026)).toBe(sha256File(APP_026));
  });

  it('026 define helpers canônicos fail-closed (membership + app_metadata)', () => {
    const sql = read(`supabase/migrations/${MIG_NAME}`);
    expect(sql).toContain('app_user_can_read_tenant');
    expect(sql).toContain('app_user_has_active_tenant_membership');
    expect(sql).toContain('app_current_tenant_id');
    expect(sql).toContain("auth.jwt() -> 'app_metadata' ->> 'tenant_id'");
    expect(sql).toMatch(/user_metadata/i);
    expect(sql).toContain("tu.is_active is true");
    expect(sql).toContain("tu.has_system_access is true");
    expect(sql).toContain("lower(coalesce(tu.status, '')) = 'active'");
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = public');
    expect(sql).toContain('CRITICAL_TABLE_RLS_EXPOSED');
    expect(sql).toContain('app_assert_critical_tenant_tables_rls');
    expect(sql).toContain('force row level security');
    expect(sql).toContain('appointments');
    expect(sql).toContain('financial_accounts_receivable');
    expect(sql).toContain('crm_leads');
    expect(sql).toContain('patients');

    const noComments = sql.replace(/--[^\n]*/g, '');
    expect(noComments).not.toMatch(/--linked|--db-url|db push|supabase link/i);
    expect(noComments).not.toMatch(/create table if not exists public\.patients/i);
  });

  it('026 reutiliza app_user_can_access_tenant como wrapper fail-closed', () => {
    const sql = read(`supabase/migrations/${MIG_NAME}`);
    expect(sql).toMatch(
      /create or replace function public\.app_user_can_access_tenant\(row_tenant_id text\)[\s\S]*app_user_can_read_tenant/i,
    );
  });
});

describe('Phase 9.4A Security — budgets quarantine (STATIC)', () => {
  it('budgetsService e budgetItemsService estão quarantined e bloqueiam operações', async () => {
    expect(BUDGETS_SERVICE_QUARANTINED).toBe(true);
    expect(BUDGET_ITEMS_SERVICE_QUARANTINED).toBe(true);

    await expect(createBudget({})).rejects.toThrow(/BUDGETS_SERVICE_QUARANTINED/);
    await expect(listBudgets()).rejects.toThrow(/BUDGETS_SERVICE_QUARANTINED/);
    await expect(updateBudgetTotal('x', 1)).rejects.toThrow(/BUDGETS_SERVICE_QUARANTINED/);
    await expect(createBudgetItems('x', [])).rejects.toThrow(/BUDGET_ITEMS_SERVICE_QUARANTINED/);
    await expect(listBudgetItemsByBudgetIds(['x'])).rejects.toThrow(
      /BUDGET_ITEMS_SERVICE_QUARANTINED/,
    );
  });

  it('nenhuma migration app cria public.budgets', () => {
    const files = fs.readdirSync(APP_MIGRATIONS).filter((f) => f.endsWith('.sql'));
    for (const file of files) {
      const sql = fs.readFileSync(path.join(APP_MIGRATIONS, file), 'utf8');
      const body = sql.replace(/--[^\n]*/g, '');
      expect(body).not.toMatch(/create table if not exists public\.budgets\b/i);
      expect(body).not.toMatch(/create table public\.budgets\b/i);
    }
  });

  it('consumidores de budgetsService são apenas ClinicalAppointmentPage (+ testes)', () => {
    const consumers = listJsImportsOf('budgetsService').filter(
      (p) => !p.includes('__tests__') && !p.includes('quarantine'),
    );
    expect(consumers).toEqual(['src/pages/ClinicalAppointmentPage.jsx']);

    const itemConsumers = listJsImportsOf('budgetItemsService').filter(
      (p) => !p.includes('__tests__') && !p.includes('quarantine'),
    );
    expect(itemConsumers).toEqual(['src/pages/ClinicalAppointmentPage.jsx']);

    const page = read('src/pages/ClinicalAppointmentPage.jsx');
    expect(page).not.toMatch(/createBudget\s*\(/);
    expect(page).not.toMatch(/updateBudgetTotal\s*\(/);
    expect(page).not.toMatch(/createBudgetItems\s*\(/);
    expect(page).toContain('listBudgets');
  });

  it('cópia deprecated existe em quarantine/', () => {
    expect(
      fs.existsSync(
        path.join(REPO_ROOT, 'src/services/quarantine/budgetsService.deprecated.js'),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(REPO_ROOT, 'src/services/quarantine/budgetItemsService.deprecated.js'),
      ),
    ).toBe(true);
  });
});

describe('Phase 9.4A Security — fixtures e package scripts (STATIC)', () => {
  it('fixture RLS geral cobre membership stale + app_metadata + critical RLS', () => {
    const sql = read('supabase-local/fixtures/rls_runtime_validation.sql');
    expect(sql).toContain('stale_jwt_without_membership_cannot_read');
    expect(sql).toContain('inactive_membership_cannot_read');
    expect(sql).toContain('no_system_access_cannot_read');
    expect(sql).toContain('inactive_status_cannot_read');
    expect(sql).toContain('app_metadata_only_can_read_own');
    expect(sql).toContain('user_metadata_cannot_authorize_other_tenant');
    expect(sql).toContain('divergent_claims_prefer_app_metadata');
    expect(sql).toContain('critical_tables_rls_assert_pass');
    expect(sql).toContain('critical_020_022_force_rls_and_policies');
  });

  it('package.json expõe test:supabase:phase94a-security', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['test:supabase:phase94a-security']).toContain(
      'phase94aSecurityHardening',
    );
  });

  it('guards remotos e linkedRef estáveis', () => {
    expect(guardCommand('supabase', ['db', 'query', '--linked', 'select 1'], {}).status).not.toBe(
      'SAFE_LOCAL_ENVIRONMENT',
    );
    expect(STAGING_REF).toBe('tckdjyunwmdpqmewrwvt');
  });
});
