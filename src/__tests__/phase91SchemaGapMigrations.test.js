/**
 * Phase 9.1 — Static structural tests for schema gap migrations.
 * Não executa SQL contra banco; apenas inspeciona arquivos versionados.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APPOINTMENTS_LIST_SELECT,
  PRODUCTION_PROJECT_REF as APPT_PROD_REF,
} from '../../server/lib/appointmentsApiList.js';
import { APPOINTMENT_WRITE_SELECT } from '../../server/lib/appointmentsApiWrite.js';
import {
  CRM_LEADS_LIST_SELECT,
  CRM_PIPELINE_STAGES_LIST_SELECT,
  PRODUCTION_PROJECT_REF as CRM_PROD_REF,
} from '../../server/lib/crmApiList.js';
import {
  FINANCINGS_LIST_SELECT,
  PAYABLES_LIST_SELECT,
  PRODUCTION_PROJECT_REF as FIN_PROD_REF,
  RECEIVABLES_LIST_SELECT,
} from '../../server/lib/financialApiList.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase/migrations');

const PHASE_91_FILES = {
  appointments: '020_app_appointments.sql',
  financial: '021_app_financial_core.sql',
  crm: '022_app_crm_kanban_core.sql',
  rls: '023_app_appointments_financial_crm_rls.sql',
};

const EXPECTED_TABLES = [
  'appointments',
  'financial_accounts_receivable',
  'financial_payables',
  'financial_financings',
  'crm_leads',
  'crm_pipeline_stages',
];

function readMigration(name) {
  const full = path.join(MIGRATIONS_DIR, name);
  expect(fs.existsSync(full), `migration missing: ${name}`).toBe(true);
  return fs.readFileSync(full, 'utf8');
}

function splitSelect(selectCsv) {
  return String(selectCsv)
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

function assertColumnsPresent(sql, columns, label) {
  for (const col of columns) {
    const pattern = new RegExp(`\\b${col.replace(/"/g, '')}\\b`, 'i');
    expect(sql, `${label} missing column ${col}`).toMatch(pattern);
  }
}

describe('Phase 9.1 — schema gap migrations (static)', () => {
  it('cria os quatro arquivos versionados 020–023 na pasta supabase/migrations', () => {
    for (const file of Object.values(PHASE_91_FILES)) {
      expect(fs.existsSync(path.join(MIGRATIONS_DIR, file))).toBe(true);
    }
  });

  it('cobre tabelas gap críticas documentadas na Reality Audit', () => {
    const combined = Object.values(PHASE_91_FILES)
      .map((f) => readMigration(f))
      .join('\n');
    for (const table of EXPECTED_TABLES) {
      expect(combined).toMatch(new RegExp(`create table if not exists public\\.${table}`, 'i'));
    }
  });

  it('020 appointments: tenant_id, timestamps, soft delete, índices e trigger', () => {
    const sql = readMigration(PHASE_91_FILES.appointments);
    expect(sql).toMatch(/tenant_id uuid not null references public\.tenants/i);
    expect(sql).toMatch(/created_at timestamptz not null default now\(\)/i);
    expect(sql).toMatch(/updated_at timestamptz not null default now\(\)/i);
    expect(sql).toMatch(/deleted_at timestamptz null/i);
    expect(sql).toMatch(/legacy_id text not null/i);
    expect(sql).toMatch(/appointments_tenant_date_idx/i);
    expect(sql).toMatch(/appointments_tenant_professional_date_idx/i);
    expect(sql).toMatch(/touch_updated_at\(\)/i);
    assertColumnsPresent(sql, splitSelect(APPOINTMENT_WRITE_SELECT), 'appointments write');
    assertColumnsPresent(sql, splitSelect(APPOINTMENTS_LIST_SELECT), 'appointments list');
  });

  it('021 financial: três tabelas com legacy_id + amounts compatíveis com Admin API', () => {
    const sql = readMigration(PHASE_91_FILES.financial);
    for (const table of [
      'financial_accounts_receivable',
      'financial_payables',
      'financial_financings',
    ]) {
      expect(sql).toMatch(new RegExp(`create table if not exists public\\.${table}`, 'i'));
      expect(sql).toMatch(new RegExp(`${table}[\\s\\S]*?tenant_id uuid not null`, 'i'));
    }
    assertColumnsPresent(sql, splitSelect(RECEIVABLES_LIST_SELECT), 'receivables');
    assertColumnsPresent(sql, splitSelect(PAYABLES_LIST_SELECT), 'payables');
    assertColumnsPresent(sql, splitSelect(FINANCINGS_LIST_SELECT), 'financings');
  });

  it('022 crm: leads + pipeline_stages com order quoted e stage_key', () => {
    const sql = readMigration(PHASE_91_FILES.crm);
    expect(sql).toMatch(/"order" integer not null/i);
    expect(sql).toMatch(/stage_key text not null/i);
    assertColumnsPresent(sql, splitSelect(CRM_LEADS_LIST_SELECT), 'crm_leads');
    // "order" in SELECT is unquoted identifier name
    for (const col of splitSelect(CRM_PIPELINE_STAGES_LIST_SELECT)) {
      if (col === 'order') {
        expect(sql).toMatch(/"order"/);
      } else {
        expect(sql).toMatch(new RegExp(`\\b${col}\\b`, 'i'));
      }
    }
  });

  it('023 habilita RLS e policies SELECT + modify para todas as tabelas gap', () => {
    const sql = readMigration(PHASE_91_FILES.rls);
    for (const table of EXPECTED_TABLES) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    }
    expect(sql).toMatch(/app_user_can_access_tenant/i);
    expect(sql).toMatch(/app_user_is_tenant_admin/i);
    expect(sql.match(/create policy/gi)?.length || 0).toBeGreaterThanOrEqual(12);
  });

  it('não contém DROP destrutivo sem IF EXISTS nem truncate/seed de produção', () => {
    const combined = Object.values(PHASE_91_FILES)
      .map((f) => readMigration(f))
      .join('\n');
    expect(combined).not.toMatch(/\bdrop table\b(?![^;]*\bif exists\b)/i);
    // Allow "drop trigger if exists" / "drop policy if exists" only
    const bareDrops = combined.match(/^\s*drop\s+(?!trigger|policy|function)\b/gim) || [];
    expect(bareDrops).toEqual([]);
    expect(combined).not.toMatch(/\btruncate\b/i);
    expect(combined).not.toMatch(/insert into[\s\S]{0,80}uoepkwhqztmsjnzirpev/i);
    expect(combined).not.toMatch(/values\s*\(\s*'tenant-1'/i);
  });

  it('não embute production project ref proibido nos artefatos de migration', () => {
    const combined = Object.values(PHASE_91_FILES)
      .map((f) => readMigration(f))
      .join('\n');
    expect(combined).not.toContain(APPT_PROD_REF);
    expect(combined).not.toContain(CRM_PROD_REF);
    expect(combined).not.toContain(FIN_PROD_REF);
  });

  it('usa snake_case em nomes de tabela/coluna criados (sem camelCase em DDL)', () => {
    const combined = Object.values(PHASE_91_FILES)
      .map((f) => readMigration(f))
      .join('\n');
    const createBlocks = combined.match(/create table if not exists public\.[a-z0-9_]+[\s\S]*?\);/gi) || [];
    expect(createBlocks.length).toBeGreaterThanOrEqual(6);
    for (const block of createBlocks) {
      expect(block).not.toMatch(/\b[a-z]+[A-Z][a-zA-Z]*\s+(uuid|text|timestamptz|integer|numeric|boolean|date)/);
    }
  });

  it('documenta rollback manual e proibição de execução automática', () => {
    for (const file of Object.values(PHASE_91_FILES)) {
      const sql = readMigration(file);
      expect(sql.toLowerCase()).toMatch(/rollback/);
      expect(sql).toMatch(/NÃO EXECUTAR|nao executar/i);
    }
  });

  it('preenche o gap de numeração entre 019 e 024 sem duplicar 024', () => {
    const names = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(names).toContain('019_collaborators_rls.sql');
    expect(names).toContain('020_app_appointments.sql');
    expect(names).toContain('021_app_financial_core.sql');
    expect(names).toContain('022_app_crm_kanban_core.sql');
    expect(names).toContain('023_app_appointments_financial_crm_rls.sql');
    expect(names).toContain('024_collaborator_photos_storage.sql');
    const prefixCounts = {};
    for (const name of names) {
      const prefix = name.slice(0, 3);
      if (/^\d{3}$/.test(prefix)) {
        prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
      }
    }
    expect(prefixCounts['020']).toBe(1);
    expect(prefixCounts['021']).toBe(1);
    expect(prefixCounts['022']).toBe(1);
    expect(prefixCounts['023']).toBe(1);
  });
});
