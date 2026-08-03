/**
 * Phase 9.2J — contrato text de app_user_can_access_tenant vs storage 013.
 * Testes FS locais (sem Docker/rede/remoto).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_MIGRATIONS,
  ISOLATED_CLI_MIGRATIONS,
} from '../../scripts/supabase/constants.mjs';
import {
  ensureIsolatedMigrationsLayout,
  sha256File,
} from '../../scripts/supabase/isolation.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const APP_002 = path.join(APP_MIGRATIONS, '002_app_multi_tenant_rls.sql');
const APP_012 = path.join(APP_MIGRATIONS, '012_fix_tenant_users_rls_recursion.sql');
const APP_013 = path.join(APP_MIGRATIONS, '013_clinic_logos_storage.sql');
const APP_024 = path.join(APP_MIGRATIONS, '024_collaborator_photos_storage.sql');
const CLI_013 = path.join(ISOLATED_CLI_MIGRATIONS, '013_clinic_logos_storage.sql');

const ACCESS_CALL_RE =
  /public\.app_user_can_access_tenant\(\s*\(storage\.foldername\(name\)\)\[1\]\s*\)/g;
const UUID_CAST_CALL_RE =
  /app_user_can_access_tenant\s*\(\s*\(storage\.foldername\(name\)\)\[1\]\s*::\s*uuid\s*\)/i;

describe('Phase 9.2J — clinic logos storage contract', () => {
  beforeEach(() => {
    ensureIsolatedMigrationsLayout();
  });

  afterEach(() => {
    ensureIsolatedMigrationsLayout();
  });

  it('002 define app_user_can_access_tenant(row_tenant_id text)', () => {
    const text = fs.readFileSync(APP_002, 'utf8');
    expect(text).toMatch(
      /create or replace function public\.app_user_can_access_tenant\(\s*row_tenant_id\s+text\s*\)/i,
    );
    expect(text).not.toMatch(
      /create or replace function public\.app_user_can_access_tenant\(\s*row_tenant_id\s+uuid\s*\)/i,
    );
  });

  it('013 não passa uuid para app_user_can_access_tenant', () => {
    const text = fs.readFileSync(APP_013, 'utf8');
    expect(text).not.toMatch(UUID_CAST_CALL_RE);
    expect(text).not.toMatch(/app_user_can_access_tenant\([^)]*::uuid/i);
  });

  it('013 tem exatamente 4 calls corrigidas com foldername[1] text', () => {
    const text = fs.readFileSync(APP_013, 'utf8');
    const matches = text.match(ACCESS_CALL_RE) || [];
    expect(matches).toHaveLength(4);
    expect(text).toMatch(/clinic_logos_storage_insert/);
    expect(text).toMatch(/clinic_logos_storage_update/);
    expect(text).toMatch(/clinic_logos_storage_delete/);
  });

  it('013 continua validando o primeiro segmento do path', () => {
    const text = fs.readFileSync(APP_013, 'utf8');
    const pathSegmentChecks = (
      text.match(/\(storage\.foldername\(name\)\)\[1\]/g) || []
    ).length;
    expect(pathSegmentChecks).toBe(4);
  });

  it('assinaturas admin/member uuid permanecem intactas', () => {
    const adminSrc = fs.readFileSync(APP_012, 'utf8');
    expect(adminSrc).toMatch(
      /create or replace function public\.app_user_is_tenant_admin\(\s*p_tenant_id\s+uuid\s*\)/i,
    );
    const memberSrc = fs.readFileSync(APP_024, 'utf8');
    expect(memberSrc).toMatch(
      /create or replace function public\.app_user_is_tenant_member\(\s*p_tenant_id\s+uuid\s*\)/i,
    );
  });

  it('espelho CLI 013 tem o mesmo SHA-256 da canônica', () => {
    const layout = ensureIsolatedMigrationsLayout();
    expect(layout.checksum.status).toBe('ISOLATED_MIGRATION_CHECKSUM_OK');
    expect(fs.existsSync(CLI_013)).toBe(true);
    expect(sha256File(CLI_013)).toBe(sha256File(APP_013));
    expect(fs.readFileSync(CLI_013, 'utf8')).not.toMatch(UUID_CAST_CALL_RE);
  });

  it('zero alteração de assinatura text→uuid na 002 via regressão', () => {
    // Guard: Opção A não cria overload uuid em lugar nenhum da cadeia app.
    const files = fs.readdirSync(APP_MIGRATIONS).filter((f) => f.endsWith('.sql'));
    for (const name of files) {
      const body = fs.readFileSync(path.join(APP_MIGRATIONS, name), 'utf8');
      expect(body).not.toMatch(
        /create or replace function public\.app_user_can_access_tenant\(\s*[^)]*uuid/i,
      );
    }
    expect(REPO_ROOT).toBeTruthy();
  });

  it('024 não usa COMMENT ON POLICY em storage.objects', () => {
    const text = fs.readFileSync(APP_024, 'utf8');
    expect(text).not.toMatch(/comment\s+on\s+policy\s+\w+\s+on\s+storage\.objects/i);
    // Policies RLS de storage permanecem.
    expect(text).toMatch(/create policy collaborator_photos_storage_select on storage\.objects/i);
    expect(text).toMatch(/create policy collaborator_photos_storage_insert on storage\.objects/i);
    expect(text).toMatch(/create policy collaborator_photos_storage_update on storage\.objects/i);
    expect(text).toMatch(/create policy collaborator_photos_storage_delete on storage\.objects/i);
  });
});
