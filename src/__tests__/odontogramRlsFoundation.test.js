import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ODONTOGRAM_MIGRATION_FILE, ODONTOGRAM_TABLES } from '../domain/odontogram/schemaContract.js';
import { SQL_GRANULAR_PERMISSION_PRIMITIVE } from '../domain/odontogram/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MIGRATION_PATH = path.join(REPO_ROOT, 'supabase/migrations', ODONTOGRAM_MIGRATION_FILE);
const TABLES = Object.values(ODONTOGRAM_TABLES);

function readMigration() {
  return readFileSync(MIGRATION_PATH, 'utf8');
}

function tableGrantStatements(sql) {
  return [...sql.matchAll(/^\s*grant\s+([a-z,\s]+)\s+on table public\.(app_odontogram_\w+)\s+to\s+([^;]+);/gim)]
    .map((match) => ({
      privileges: match[1].replace(/\s+/g, ' ').trim().toLowerCase(),
      table: match[2],
      roles: match[3].split(',').map((role) => role.trim().toLowerCase()),
    }));
}

describe('OD-1D RLS fail-closed do odontograma', () => {
  it('mantém ENABLE+FORCE e revoga public/anon/authenticated em todas as tabelas', () => {
    const sql = readMigration();
    expect(SQL_GRANULAR_PERMISSION_PRIMITIVE).toBe('MISSING');
    expect(sql).toMatch(/SQL_GRANULAR_PERMISSION_PRIMITIVE: MISSING/);
    for (const table of TABLES) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} force row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
    }
  });

  it('não concede escrita nem SELECT autenticado; zero policies authenticated', () => {
    const sql = readMigration();
    expect(sql.match(/^\s*create policy\b/gim) || []).toEqual([]);
    expect(sql).not.toMatch(/for insert/i);
    expect(sql).not.toMatch(/for update/i);
    expect(sql).not.toMatch(/for delete/i);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/with check\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/user_metadata/);
    expect(sql).not.toMatch(/raw_user_meta_data/);
    expect(sql).not.toMatch(/app_metadata/);
    expect(sql).not.toMatch(/request\.jwt/i);
    expect(sql).not.toMatch(/auth\.jwt\s*\(/i);
    const tableGrants = tableGrantStatements(sql);
    for (const grant of tableGrants) {
      expect(grant.roles.some((role) => role === 'authenticated' || role === 'anon' || role === 'public')).toBe(false);
      expect(grant.privileges).not.toMatch(/\bdelete\b/);
      expect(grant.privileges).not.toMatch(/\ball\b/);
    }
    expect(sql).not.toMatch(/grant (select|insert|update|delete|all) on table public\.app_odontogram_\w+ to (anon|authenticated)/i);
    expect(sql).toMatch(/ZERO policies authenticated/);
    expect(sql).toMatch(/SELECT direto authenticated permanece negado/);
  });

  it('não embute segredo de service_role e limita grants de tabela', () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/service_role[_-]key/i);
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(sql).not.toMatch(/SUPABASE_SERVICE_ROLE/);
    const tableGrants = tableGrantStatements(sql);
    const byTable = Object.fromEntries(tableGrants.map((item) => [item.table, item]));
    expect(byTable.app_odontogram_charts.privileges).toBe('select, insert, update');
    expect(byTable.app_odontogram_tooth_states.privileges).toBe('select, insert, update');
    expect(byTable.app_odontogram_events.privileges).toBe('select, insert');
    expect(byTable.app_odontogram_chart_versions.privileges).toBe('select, insert');
    for (const grant of tableGrants) {
      expect(grant.roles).toEqual(['service_role']);
    }
  });

  it('preserva append-only, sequence, FK de correção e imutabilidade de versão', () => {
    const sql = readMigration();
    expect(sql).toMatch(/trg_app_odontogram_events_no_update/);
    expect(sql).toMatch(/trg_app_odontogram_events_no_delete/);
    expect(sql).toMatch(/trg_app_odontogram_chart_versions_no_update/);
    expect(sql).toMatch(/trg_app_odontogram_chart_versions_no_delete/);
    expect(sql).toMatch(/event_sequence bigint not null/i);
    expect(sql).toMatch(/unique \(tenant_id, chart_id, event_sequence\)/);
    expect(sql).toMatch(/foreign key \(tenant_id, chart_id, patient_id, referenced_event_id\)/);
    expect(sql).toMatch(/on delete restrict/);
    expect(sql).toMatch(/APP_ODONTOGRAM_APPEND_ONLY/);
    expect(sql).toMatch(/new\.row_version := old\.row_version \+ 1/);
    expect(readdirSync(path.join(REPO_ROOT, 'supabase/migrations')).filter((name) => name.startsWith('042')))
      .toEqual([]);
  });
});
