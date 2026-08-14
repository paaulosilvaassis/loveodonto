/**
 * OD-1B — testes estáticos do schema clínico canônico.
 * Não executa SQL, não sobe Supabase, não acessa rede e não aplica migration.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHART_STATUSES,
  CONDITION_CODES,
  DENTITION_STAGES,
  MIXED_FDI_TOOTH_IDS,
  ODONTOGRAM_CORRECTION_EVENT_TYPES,
  ODONTOGRAM_EVENT_TYPES,
  ODONTOGRAM_MIGRATION_FILE,
  ODONTOGRAM_TABLES,
  SURFACE_CODES,
} from '../domain/odontogram/schemaContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase/migrations');
const BASE_HEAD = '745ed5f6e3255954f4ec6a26f4bc8fe27f786b44';
const MIGRATION_PATH = path.join(MIGRATIONS_DIR, ODONTOGRAM_MIGRATION_FILE);
const TABLES = Object.values(ODONTOGRAM_TABLES);

function readMigration() {
  return readFileSync(MIGRATION_PATH, 'utf8');
}

function extractCreateTable(sql, table) {
  const marker = `create table if not exists public.${table}`;
  const start = sql.toLowerCase().indexOf(marker);
  expect(start, table).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf('(', start);
  let depth = 0;
  for (let index = open; index < sql.length; index += 1) {
    if (sql[index] === '(') depth += 1;
    if (sql[index] === ')') {
      depth -= 1;
      if (depth === 0) return sql.slice(start, index + 1);
    }
  }
  throw new Error(`DDL não fechado: ${table}`);
}

function extractSqlTextArray(sql, functionName) {
  const match = sql.match(
    new RegExp(`create or replace function public\\.${functionName}\\(\\)[\\s\\S]*?array\\[([\\s\\S]*?)\\]::text\\[\\]`, 'i'),
  );
  expect(match, functionName).toBeTruthy();
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

function listBaseMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^0(?:0[1-9]|[1-3]\d|40)_.*\.sql$/.test(name))
    .sort();
}

describe('OD-1B schema clínico canônico (estático)', () => {
  it('cria somente a migration 041 reservada', () => {
    expect(readdirSync(MIGRATIONS_DIR)).toContain(ODONTOGRAM_MIGRATION_FILE);
    expect(ODONTOGRAM_MIGRATION_FILE).toBe('041_app_odontogram_clinical_foundation.sql');
    const numbered = readdirSync(MIGRATIONS_DIR).filter((name) => name.startsWith('041') || name.startsWith('042'));
    expect(numbered).toEqual([ODONTOGRAM_MIGRATION_FILE]);
  });

  it('mantém migrations 001–040 byte-idênticas ao HEAD-base', () => {
    for (const name of listBaseMigrations()) {
      const relative = `supabase/migrations/${name}`;
      const current = readFileSync(path.join(MIGRATIONS_DIR, name));
      const baseline = execFileSync('git', ['show', `${BASE_HEAD}:${relative}`]);
      expect(current.equals(baseline), name).toBe(true);
    }
  });

  it('declara as quatro tabelas com tenant_id e patient_id obrigatórios', () => {
    const sql = readMigration();
    expect(TABLES).toEqual([
      'app_odontogram_charts',
      'app_odontogram_tooth_states',
      'app_odontogram_events',
      'app_odontogram_chart_versions',
    ]);
    for (const table of TABLES) {
      const ddl = extractCreateTable(sql, table);
      expect(ddl).toMatch(/tenant_id uuid not null/i);
      expect(ddl).toMatch(/patient_id text not null/i);
      expect(ddl).toMatch(/constraint \w+_patient_nonempty_chk/i);
    }
  });

  it('garante um gráfico ativo por tenant+patient e constraints de chart', () => {
    const sql = readMigration();
    const ddl = extractCreateTable(sql, 'app_odontogram_charts');
    expect(sql).toMatch(
      /create unique index if not exists app_odontogram_charts_tenant_patient_active_uq\s+on public\.app_odontogram_charts \(tenant_id, patient_id\)\s+where deleted_at is null/i,
    );
    expect(ddl).not.toMatch(/unique \(patient_id\)/i);
    expect(ddl).toMatch(/dentition_stage in \('permanent', 'primary', 'mixed'\)/);
    expect(ddl).toMatch(/status in \('draft', 'in_review', 'finalized'\)/);
    expect(ddl).toMatch(/row_version bigint not null default 1/);
    expect(ddl).toMatch(/row_version >= 1/);
    expect(ddl).toMatch(/status = 'finalized' and finalized_at is not null/);
    expect(ddl).toMatch(/status <> 'finalized' and finalized_at is null/);
    expect(extractSqlTextArray(sql, 'app_odontogram_event_types')).toEqual([...ODONTOGRAM_EVENT_TYPES]);
    expect([...DENTITION_STAGES]).toEqual(['permanent', 'primary', 'mixed']);
    expect([...CHART_STATUSES]).toEqual(['draft', 'in_review', 'finalized']);
  });

  it('valida FDI permanente/decíduo no SQL e na projeção vigente', () => {
    const sql = readMigration();
    expect(extractSqlTextArray(sql, 'app_odontogram_fdi_ids')).toEqual([...MIXED_FDI_TOOTH_IDS]);
    expect(sql).toMatch(/p_fdi ~ '\^\[0-9\]\{2\}\$'/);
    expect(sql).toMatch(/p_fdi = any \(public\.app_odontogram_fdi_ids\(\)\)/);
    const states = extractCreateTable(sql, 'app_odontogram_tooth_states');
    expect(states).toMatch(/app_odontogram_is_valid_fdi\(tooth_fdi\)/);
    expect(states).toMatch(/jsonb_typeof\(state\) = 'object'/);
    expect(states).toMatch(/row_version >= 1/);
    expect(states).toMatch(/foreign key \(tenant_id, chart_id, patient_id\)/);
    expect(states).toMatch(/on delete restrict/);
    expect(sql).toMatch(
      /create unique index if not exists app_odontogram_tooth_states_active_tooth_uq\s+on public\.app_odontogram_tooth_states \(tenant_id, chart_id, tooth_fdi\)\s+where deleted_at is null/i,
    );
  });

  it('torna eventos append-only e versões imutáveis, bloqueando UPDATE/DELETE', () => {
    const sql = readMigration();
    expect(sql).toMatch(/APP_ODONTOGRAM_APPEND_ONLY/);
    expect(sql).toMatch(/trg_app_odontogram_events_no_update/);
    expect(sql).toMatch(/trg_app_odontogram_events_no_delete/);
    expect(sql).toMatch(/trg_app_odontogram_chart_versions_no_update/);
    expect(sql).toMatch(/trg_app_odontogram_chart_versions_no_delete/);
    expect(sql).toMatch(/before update on public\.app_odontogram_events/);
    expect(sql).toMatch(/before delete on public\.app_odontogram_events/);
    expect(sql).toMatch(/before update on public\.app_odontogram_chart_versions/);
    expect(sql).toMatch(/before delete on public\.app_odontogram_chart_versions/);
    expect(sql).toMatch(/execute function public\.app_odontogram_reject_mutation\(\)/);
    const versions = extractCreateTable(sql, 'app_odontogram_chart_versions');
    expect(versions).toMatch(/unique \(tenant_id, chart_id, version_number\)/);
    expect(versions).not.toMatch(/unique \(tenant_id, chart_id, snapshot_hash\)/);
    expect(versions).not.toMatch(/chart_versions_hash_uq/);
    expect(sql).toMatch(
      /create index if not exists app_odontogram_chart_versions_tenant_chart_hash_idx\s+on public\.app_odontogram_chart_versions \(tenant_id, chart_id, snapshot_hash\)/i,
    );
    expect(versions).toMatch(/version_number >= 1/);
    expect(versions).toMatch(/source_row_version >= 1/);
    expect(versions).toMatch(/jsonb_typeof\(snapshot\) = 'object'/);
    expect(versions).toMatch(/snapshot_hash text not null/);
    expect(versions).toMatch(/length\(trim\(snapshot_hash\)\) > 0/);
    expect(sql).toMatch(/Hash de conteúdo, não identidade da versão/i);
  });

  it('valida superfícies canônicas sem duplicidade e correções com justificativa', () => {
    const sql = readMigration();
    expect(extractSqlTextArray(sql, 'app_odontogram_surface_codes')).toEqual([...SURFACE_CODES]);
    expect(sql).toMatch(/cardinality\(p_surfaces\) = \(/);
    expect(sql).toMatch(/count\(distinct s\)/);
    const events = extractCreateTable(sql, 'app_odontogram_events');
    expect(events).toMatch(/app_odontogram_surfaces_are_valid\(surfaces\)/);
    expect(events).toMatch(/event_type not in \('condition_corrected', 'condition_removed', 'correction_recorded'\)/);
    expect(events).toMatch(/length\(trim\(coalesce\(reason, ''\)\)\) > 0/);
    expect([...ODONTOGRAM_CORRECTION_EVENT_TYPES]).toEqual([
      'condition_corrected',
      'condition_removed',
      'correction_recorded',
    ]);
    expect(events).toMatch(/length\(trim\(event_hash\)\) > 0/);
    expect(events).toMatch(/jsonb_typeof\(payload\) = 'object'/);
    expect(events).toMatch(/appointment_id text null/);
    expect(events).toMatch(/planned_procedure_id text null/);
    expect(events).toMatch(/budget_item_id text null/);
    expect(events).toMatch(/executed_procedure_id text null/);
  });

  it('documenta procedure_completed como conclusão clínica e impede identidade financeira', () => {
    const sql = readMigration();
    expect(sql).toMatch(/procedure_completed é conclusão clínica, nunca pagamento/i);
    expect(sql).toMatch(/Financeiro NUNCA determina conclusão clínica/i);
    expect(sql).toMatch(/budget_item_id sozinho não conclui procedimento/i);
    const events = extractCreateTable(sql, 'app_odontogram_events');
    expect(events).toMatch(/event_type <> 'procedure_completed'/);
    expect(events).toMatch(/executed_procedure_id/);
    expect(events).toMatch(/receivable_id/);
    expect(events).toMatch(/payment_id/);
    expect(events).not.toMatch(/receivable_id uuid/i);
    expect(events).not.toMatch(/payment_id uuid/i);
    expect(sql).not.toMatch(/references public\.(appointments|financial_accounts_receivable|patients)\b/i);
  });

  it('habilita RLS fail-closed sem policy permissiva e com índices tenant-first', () => {
    const sql = readMigration();
    for (const table of TABLES) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} force row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
    }
    expect(sql).toMatch(/SEM create policy/i);
    expect(sql).toMatch(/Runtime permanece DESLIGADO até OD-1D/i);
    expect(sql.match(/^\s*create policy\b/gim) || []).toEqual([]);
    expect(sql).not.toMatch(/grant (select|insert|update|delete|all) on table public\.app_odontogram_\w+ to (anon|authenticated)/i);
    expect(sql).toMatch(/on public\.app_odontogram_charts \(tenant_id, patient_id\)/i);
    expect(sql).toMatch(/on public\.app_odontogram_tooth_states \(tenant_id, chart_id\)/i);
    expect(sql).toMatch(/on public\.app_odontogram_events \(tenant_id, chart_id, occurred_at\)/i);
    expect(sql).toMatch(/on public\.app_odontogram_events \(tenant_id, patient_id\)/i);
    expect(sql).toMatch(/on public\.app_odontogram_events \(tenant_id, appointment_id\)\s+where appointment_id is not null/i);
    expect(sql).toMatch(/unique \(tenant_id, chart_id, version_number\)/);
  });

  it('não cria storage, 3D/DICOM, seed, dual-write nem dados reais', () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/storage\.buckets/i);
    expect(sql).not.toMatch(/insert into storage/i);
    expect(sql).not.toMatch(/create bucket/i);
    expect(sql).not.toMatch(/\bbytea\b/i);
    expect(sql).not.toMatch(/^\s*insert into\b/im);
    expect(sql).not.toMatch(/\bEXCEPTION WHEN OTHERS\b/i);
    expect(sql).not.toMatch(/\bindexedDB\./);
    expect(sql).not.toMatch(/\blocalStorage\./);
    expect(sql).toMatch(/Renderizadores 2D\/3D NÃO são fonte de verdade/i);
    expect(sql).toMatch(/Modelo anatômico educativo NÃO é scan do paciente/i);
    expect(sql).toMatch(/odontograma clínico vivo NÃO é snapshot contratual/i);
    expect(sql).not.toMatch(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
  });

  it('mantém paridade dos catálogos SQL com OD-1A e schemaContract', () => {
    const sql = readMigration();
    expect(extractSqlTextArray(sql, 'app_odontogram_condition_codes')).toEqual([...CONDITION_CODES]);
    expect(extractSqlTextArray(sql, 'app_odontogram_event_types')).toEqual([...ODONTOGRAM_EVENT_TYPES]);
    expect(extractSqlTextArray(sql, 'app_odontogram_surface_codes')).toEqual([...SURFACE_CODES]);
    expect(sql).toMatch(/set search_path = public/);
    expect(sql).not.toMatch(/security definer/i);
    expect(sql).toMatch(/Não preenche created_by\/updated_by a partir de auth\.uid\(\)/i);
    expect(sql).toMatch(/foreign key \(tenant_id, chart_id, patient_id\)/);
    expect(sql).toMatch(/app_odontogram_protect_mutable_row/);
    expect(sql).toMatch(/new\.row_version := old\.row_version \+ 1/);
    expect(sql).toMatch(/Não substitui a checagem otimista do service futuro/i);
    expect(sql).toMatch(/touch_updated_at\(\)/);
  });

  it('impede exclusão em cascata e fortalece last_event_id sem torná-lo obrigatório', () => {
    const sql = readMigration();
    const fkCascades = sql.match(/references[\s\S]{0,200}?on delete cascade/gi) || [];
    expect(fkCascades).toEqual([]);
    const states = extractCreateTable(sql, 'app_odontogram_tooth_states');
    const events = extractCreateTable(sql, 'app_odontogram_events');
    const versions = extractCreateTable(sql, 'app_odontogram_chart_versions');
    expect(states).toMatch(/last_event_id uuid null/);
    expect(states).not.toMatch(/last_event_id uuid not null/);
    expect(events).toMatch(/unique \(tenant_id, chart_id, patient_id, id\)/);
    expect(sql).toMatch(
      /foreign key \(tenant_id, chart_id, patient_id, last_event_id\)\s+references public\.app_odontogram_events \(tenant_id, chart_id, patient_id, id\)\s+on delete restrict/i,
    );
    expect(sql).toMatch(/deferrable initially deferred/);
    expect(states).toMatch(/on delete restrict/);
    expect(events).toMatch(/on delete restrict/);
    expect(versions).toMatch(/on delete restrict/);
    expect(sql).toMatch(/Ponteiro opcional da projeção vigente para o evento histórico/i);
    expect(sql).toMatch(/Serviço transacional virá em fase posterior/i);
  });

  it('prova identidade de versão, append-only e RLS fail-closed do hardening', () => {
    const sql = readMigration();
    const versions = extractCreateTable(sql, 'app_odontogram_chart_versions');
    expect(versions).toMatch(/unique \(tenant_id, chart_id, version_number\)/);
    expect(sql).not.toMatch(/unique \(tenant_id, chart_id, snapshot_hash\)/);
    expect(sql).toMatch(/Versões distintas do mesmo chart podem repetir o hash/i);
    expect(sql).toMatch(/trg_app_odontogram_events_no_update/);
    expect(sql).toMatch(/trg_app_odontogram_events_no_delete/);
    expect(sql).toMatch(/trg_app_odontogram_chart_versions_no_update/);
    expect(sql).toMatch(/trg_app_odontogram_chart_versions_no_delete/);
    expect(sql.match(/^\s*create policy\b/gim) || []).toEqual([]);
    for (const table of TABLES) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} force row level security`, 'i'));
    }
    expect(sql).toMatch(/Não substitui a checagem otimista do service futuro/i);
  });
});
