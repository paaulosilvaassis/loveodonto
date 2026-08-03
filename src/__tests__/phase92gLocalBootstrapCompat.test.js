/**
 * Phase 9.2G — compatibilidade bootstrap local + migration 005 defensiva.
 * Testes estáticos (sem Docker/CLI/rede). Simulam contratos:
 *   - banco vazio (só bootstrap local)
 *   - banco legado (tenant_users sem is_active)
 *   - banco já migrado (colunas já presentes; IF NOT EXISTS)
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const BOOTSTRAP = path.join(
  REPO_ROOT,
  'supabase-local/migrations/000_local_bootstrap_tenants.sql',
);
const MIGRATION_005 = path.join(
  REPO_ROOT,
  'supabase/migrations/005_app_collaborator_access_invites.sql',
);

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

/** Extrai o bloco CREATE TABLE de tenant_users do bootstrap. */
function extractTenantUsersCreate(sql) {
  const match = sql.match(
    /create table if not exists public\.tenant_users\s*\(([\s\S]*?)\)\s*;/i,
  );
  return match ? match[1] : '';
}

/** Posição do primeiro ADD COLUMN IF NOT EXISTS para uma coluna. */
function addColumnIndex(sql, column) {
  const re = new RegExp(
    `add column if not exists\\s+${column}\\b`,
    'i',
  );
  return sql.search(re);
}

describe('Phase 9.2G — bootstrap local tenant_users', () => {
  it('bootstrap cria tenant_users com colunas mínimas exigidas pela 005', () => {
    expect(fs.existsSync(BOOTSTRAP)).toBe(true);
    const sql = read(BOOTSTRAP);
    const body = extractTenantUsersCreate(sql);
    expect(body).toBeTruthy();
    for (const col of [
      'id',
      'tenant_id',
      'user_id',
      'status',
      'is_active',
      'has_system_access',
    ]) {
      expect(body).toMatch(new RegExp(`\\b${col}\\b`, 'i'));
    }
    expect(sql).toMatch(/create table if not exists public\.tenants/i);
    expect(sql).toMatch(/create table if not exists public\.tenant_users/i);
  });

  it('banco vazio → PASS: bootstrap é idempotente (IF NOT EXISTS)', () => {
    const sql = read(BOOTSTRAP);
    expect(sql.match(/create table if not exists public\.tenant_users/gi)?.length).toBe(1);
    expect(sql).not.toMatch(/drop table\s+public\.tenant_users/i);
    expect(sql).not.toMatch(/alter table\s+public\.tenant_users\s+drop column/i);
  });
});

describe('Phase 9.2G — migration 005 defensiva', () => {
  it('garante status, is_active e has_system_access antes do UPDATE de backfill', () => {
    const sql = read(MIGRATION_005);
    const updateIdx = sql.search(
      /update\s+public\.tenant_users\s+set\s+has_system_access\s*=\s*coalesce/i,
    );
    expect(updateIdx).toBeGreaterThan(-1);

    const statusIdx = addColumnIndex(sql, 'status');
    const isActiveIdx = addColumnIndex(sql, 'is_active');
    const hasAccessIdx = addColumnIndex(sql, 'has_system_access');

    expect(statusIdx).toBeGreaterThan(-1);
    expect(isActiveIdx).toBeGreaterThan(-1);
    expect(hasAccessIdx).toBeGreaterThan(-1);
    expect(statusIdx).toBeLessThan(updateIdx);
    expect(isActiveIdx).toBeLessThan(updateIdx);
    expect(hasAccessIdx).toBeLessThan(updateIdx);
  });

  it('banco legado → PASS: ADD COLUMN IF NOT EXISTS para colunas faltantes', () => {
    const sql = read(MIGRATION_005);
    // Legado console 001 tem status, mas não is_active — 005 deve adicionar is_active.
    expect(sql).toMatch(/add column if not exists\s+is_active\s+boolean/i);
    expect(sql).toMatch(/add column if not exists\s+status\s+text/i);
    expect(sql).toMatch(/add column if not exists\s+has_system_access\s+boolean/i);
    // Não remove colunas existentes.
    expect(sql).not.toMatch(/drop column/i);
  });

  it('banco já migrado → PASS: statements aditivos e condicionais', () => {
    const sql = read(MIGRATION_005);
    expect(sql).toMatch(/alter table if exists public\.tenant_users/i);
    expect(sql).toMatch(/add column if not exists/i);
    // Backfill só preenche NULLs — não sobrescreve valores já migrados.
    expect(sql).toMatch(
      /where\s+has_system_access\s+is\s+null/i,
    );
  });

  it('não enfraquece RLS: policies de invitations permanecem tenant-scoped', () => {
    const sql = read(MIGRATION_005);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/app_user_can_access_tenant/i);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });
});

describe('Phase 9.2G — contrato conjunto vazio / legado / migrado', () => {
  it('cadeia local 000→005 cobre CREATE + colunas defensivas', () => {
    const boot = read(BOOTSTRAP);
    const m005 = read(MIGRATION_005);
    // Vazio: bootstrap cria a tabela.
    expect(boot).toMatch(/create table if not exists public\.tenant_users/i);
    // Legado/migrado: 005 só adiciona o que faltar.
    expect(m005).toMatch(/add column if not exists\s+is_active/i);
    expect(m005).toMatch(/add column if not exists\s+has_system_access/i);
  });
});
