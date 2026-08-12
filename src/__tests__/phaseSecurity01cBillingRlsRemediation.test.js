/**
 * PHASE_SECURITY_01C — pre-apply regression for billing RLS remediation.
 * Não aplica migration; valida o SQL proposto e invariantes do repo.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const MIGRATION_037 = resolve(ROOT, 'supabase/migrations/037_platform_billing_rls_security_fix.sql');
const MIGRATION_036 = resolve(ROOT, 'supabase/migrations/036_app_package_manifest_foundation.sql');
const MIGRATION_015 = resolve(ROOT, 'console/supabase/migrations/015_platform_billing_saas.sql');
const MIGRATION_016 = resolve(ROOT, 'console/supabase/migrations/016_platform_billing_tenant_columns_and_backfill.sql');
const CONSOLE_017 = resolve(ROOT, 'console/supabase/migrations/017_platform_billing_rls_security_fix.sql');

const TABLES = [
  'platform_subscriptions',
  'platform_invoices',
  'platform_billing_events',
  'platform_billing_alerts',
];

function read(path) {
  return readFileSync(path, 'utf8');
}

describe('PHASE_SECURITY_01C — critical billing RLS remediation (pre-apply)', () => {
  it('migration 037 existe e NÃO deve ser considerada aplicada', () => {
    expect(existsSync(MIGRATION_037)).toBe(true);
    const sql = read(MIGRATION_037);
    expect(sql).toMatch(/NÃO APLICAR|DO NOT APPLY/i);
    expect(sql).toContain('PHASE_SECURITY_01C');
  });

  it('1 ENABLE RLS para todas as tabelas afetadas', () => {
    const sql = read(MIGRATION_037);
    for (const t of TABLES) {
      expect(sql).toMatch(new RegExp(`alter table if exists public\\.${t} enable row level security`, 'i'));
    }
  });

  it('FORCE RLS documentado e aplicado', () => {
    const sql = read(MIGRATION_037);
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/i);
    for (const t of TABLES) {
      expect(sql).toMatch(new RegExp(`alter table if exists public\\.${t} force row level security`, 'i'));
    }
  });

  it('2–5 anon não recebe SELECT/INSERT/UPDATE/DELETE', () => {
    const sql = read(MIGRATION_037);
    for (const t of TABLES) {
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${t} from anon`, 'i'));
    }
    expect(sql).not.toMatch(/grant\s+select\s+on\s+table\s+public\.platform_invoices\s+to\s+anon/i);
    expect(sql).not.toMatch(/grant\s+.*\s+to\s+anon/i);
  });

  it('6–7 nenhuma policy USING(true) / WITH CHECK(true)', () => {
    const sql = read(MIGRATION_037);
    const policyBlocks = sql.match(/create policy[\s\S]*?;/gi) || [];
    expect(policyBlocks.length).toBeGreaterThanOrEqual(4);
    for (const block of policyBlocks) {
      expect(block).not.toMatch(/using\s*\(\s*true\s*\)/i);
      expect(block).not.toMatch(/with\s+check\s*\(\s*true\s*\)/i);
    }
  });

  it('8 authenticated exige autorização adequada (TO authenticated + helpers)', () => {
    const sql = read(MIGRATION_037);
    expect(sql).toMatch(/to authenticated/i);
    expect(sql).toContain("has_platform_permission('billing.read')");
    expect(sql).toContain('app_current_tenant_id()');
    expect(sql).toMatch(/grant select on table public\.platform_invoices to authenticated/i);
    expect(sql).toMatch(/revoke insert, update, delete/i);
  });

  it('9 service-role/backend continua arquiteturalmente suportado', () => {
    const sql = read(MIGRATION_037);
    expect(sql).toMatch(/service_role/i);
    expect(sql).toMatch(/BYPASSRLS|Admin API/i);
    const server = read(resolve(ROOT, 'server/platformBillingService.js'));
    expect(server).toContain("from('platform_invoices')");
    expect(server).toContain("from('platform_subscriptions')");
    const serverIndex = read(resolve(ROOT, 'server/index.js'));
    expect(serverIndex).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('console billing não faz BROWSER_DIRECT nas tabelas platform_*', () => {
    const consoleSvc = read(resolve(ROOT, 'console/src/services/platformConsoleService.js'));
    expect(consoleSvc).toContain('/internal/platform/billing');
    expect(consoleSvc).not.toMatch(/\.from\(['"]platform_invoices['"]\)/);
    expect(consoleSvc).not.toMatch(/\.from\(['"]platform_subscriptions['"]\)/);
  });

  it('10 nenhuma alteração em contracts rollout nesta fase', () => {
    // Arquivos de rollout não devem ter sido modificados por 01C (só migration/test/report).
    const flags = read(resolve(ROOT, 'src/domain/contracts/rollout/contracts-operational-rollout-flags.ts'));
    expect(flags).toContain('contracts_operational_ux_global_enabled');
    expect(flags).toContain('contracts_operational_ux_enabled');
    expect(flags).toContain('ATIVAR_PRODUCAO_OPERATIONAL_UX');
  });

  it('11 migration 036 intacta (não tocada / não aplicada)', () => {
    expect(existsSync(MIGRATION_036)).toBe(true);
    const sql036 = read(MIGRATION_036);
    expect(sql036).toContain('app_package_manifests');
    expect(sql036).toMatch(/NÃO APLICAR|DO NOT APPLY/i);
    const sql037 = read(MIGRATION_037);
    expect(sql037).not.toContain('app_package_manifests');
    expect(sql037).not.toMatch(/036_app_package_manifest/);
  });

  it('root cause: 016 cria tabelas sem RLS; 015 tinha RLS', () => {
    const m015 = read(MIGRATION_015);
    const m016 = read(MIGRATION_016);
    expect(m015).toMatch(/enable row level security/i);
    expect(m015).toContain("has_platform_permission('billing.read')");
    expect(m016).toContain('create table if not exists public.platform_invoices');
    expect(m016).not.toMatch(/enable row level security/i);
    expect(m016).not.toMatch(/create policy/i);
    expect(m016).not.toMatch(/revoke/i);
  });

  it('espelho console/017 existe para cadeia 015/016', () => {
    expect(existsSync(CONSOLE_017)).toBe(true);
    expect(read(CONSOLE_017)).toContain('PHASE_SECURITY_01C');
  });

  it('PACKAGE_MANIFEST_SECURITY_CLEARANCE permanece BLOCKED (documentado no SQL)', () => {
    const sql = read(MIGRATION_037);
    expect(sql).toMatch(/não toca contracts \/ 036/i);
  });
});
