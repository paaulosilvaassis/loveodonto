/**
 * Phase 9.2H — sync determinístico do espelho CLI + checksum gate.
 * Testes FS locais (sem Docker/rede/remoto).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ISOLATED_CLI_MIGRATIONS,
  LOCAL_BOOTSTRAP_MIGRATION,
  LINKED_PROJECT_PATH,
  readLinkedProjectMeta,
} from '../../scripts/supabase/constants.mjs';
import {
  ensureIsolatedMigrationsLayout,
  sha256File,
  verifyIsolatedMigrationChecksums,
  wipeCliMigrationsMirror,
} from '../../scripts/supabase/isolation.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const CLI_005 = path.join(ISOLATED_CLI_MIGRATIONS, '005_app_collaborator_access_invites.sql');
const APP_005 = path.join(REPO_ROOT, 'supabase/migrations/005_app_collaborator_access_invites.sql');

const STALE_005 = `-- stale CLI copy (intentionally missing status ADD)
alter table if exists public.tenant_users
  add column if not exists has_system_access boolean;

update public.tenant_users
set has_system_access = coalesce(has_system_access, is_active, status = 'active', true)
where has_system_access is null;
`;

describe('Phase 9.2H — CLI migration sync', () => {
  beforeEach(() => {
    // Start from a clean deterministic sync.
    ensureIsolatedMigrationsLayout();
  });

  afterEach(() => {
    // Always leave the workspace mirror healthy for subsequent suites.
    ensureIsolatedMigrationsLayout();
  });

  it('espelho inexistente: sync recria e checksum OK', () => {
    wipeCliMigrationsMirror();
    expect(fs.readdirSync(ISOLATED_CLI_MIGRATIONS).filter((f) => f.endsWith('.sql'))).toEqual([]);
    const layout = ensureIsolatedMigrationsLayout();
    expect(layout.errors).toEqual([]);
    expect(layout.checksum.status).toBe('ISOLATED_MIGRATION_CHECKSUM_OK');
    expect(layout.cliMigrationCount).toBeGreaterThanOrEqual(26);
    expect(fs.existsSync(path.join(ISOLATED_CLI_MIGRATIONS, LOCAL_BOOTSTRAP_MIGRATION))).toBe(true);
  });

  it('espelho desatualizado: sobrescrita determinística corrige 005', () => {
    fs.writeFileSync(CLI_005, STALE_005, 'utf8');
    expect(fs.readFileSync(CLI_005, 'utf8')).not.toMatch(/add column if not exists\s+status/i);
    const before = verifyIsolatedMigrationChecksums();
    expect(before.status).toBe('ISOLATED_MIGRATION_CHECKSUM_MISMATCH');

    const layout = ensureIsolatedMigrationsLayout();
    expect(layout.checksum.status).toBe('ISOLATED_MIGRATION_CHECKSUM_OK');
    const text = fs.readFileSync(CLI_005, 'utf8');
    expect(text).toMatch(/add column if not exists\s+status/i);
    expect(text).toMatch(/add column if not exists\s+is_active/i);
    expect(text).toMatch(/add column if not exists\s+has_system_access/i);
    const updateIdx = text.search(/update\s+public\.tenant_users\s+set\s+has_system_access/i);
    expect(text.search(/add column if not exists\s+status/i)).toBeLessThan(updateIdx);
    expect(sha256File(CLI_005)).toBe(sha256File(APP_005));
  });

  it('espelho com migration faltando: detecta e reconstrói', () => {
    fs.unlinkSync(CLI_005);
    expect(verifyIsolatedMigrationChecksums().status).toBe('ISOLATED_MIGRATION_CHECKSUM_MISMATCH');
    expect(verifyIsolatedMigrationChecksums().missing).toContain('005_app_collaborator_access_invites.sql');
    const layout = ensureIsolatedMigrationsLayout();
    expect(layout.checksum.status).toBe('ISOLATED_MIGRATION_CHECKSUM_OK');
    expect(fs.existsSync(CLI_005)).toBe(true);
  });

  it('espelho com conteúdo divergente: mismatch até sync', () => {
    fs.writeFileSync(CLI_005, `${STALE_005}\n-- extra\n`, 'utf8');
    const bad = verifyIsolatedMigrationChecksums();
    expect(bad.status).toBe('ISOLATED_MIGRATION_CHECKSUM_MISMATCH');
    expect(bad.mismatches.some((m) => m.name.includes('005_'))).toBe(true);
    ensureIsolatedMigrationsLayout();
    expect(verifyIsolatedMigrationChecksums().status).toBe('ISOLATED_MIGRATION_CHECKSUM_OK');
  });

  it('checksums iguais após sincronização', () => {
    const layout = ensureIsolatedMigrationsLayout();
    expect(layout.checksum.status).toBe('ISOLATED_MIGRATION_CHECKSUM_OK');
    expect(layout.checksum.canonicalCount).toBe(layout.checksum.cliCount);
    expect(layout.checksum.missing).toEqual([]);
    expect(layout.checksum.mismatches).toEqual([]);
    expect(layout.checksum.unexpected).toEqual([]);
  });

  it('Windows/Mac: cópias reais sem symlink', () => {
    ensureIsolatedMigrationsLayout();
    const sample = path.join(ISOLATED_CLI_MIGRATIONS, '020_app_appointments.sql');
    expect(fs.existsSync(sample)).toBe(true);
    expect(fs.lstatSync(sample).isSymbolicLink()).toBe(false);
    expect(fs.lstatSync(CLI_005).isSymbolicLink()).toBe(false);
  });

  it('linkedRef preservado (metadata app intocada)', () => {
    const before = readLinkedProjectMeta();
    ensureIsolatedMigrationsLayout();
    const after = readLinkedProjectMeta();
    expect(after.present).toBe(before.present);
    expect(after.data?.ref).toBe(before.data?.ref);
    if (fs.existsSync(LINKED_PROJECT_PATH)) {
      expect(fs.readFileSync(LINKED_PROJECT_PATH, 'utf8')).toContain('tckdjyunwmdpqmewrwvt');
    }
  });

  it('zero ação remota nos módulos de sync', () => {
    const isolationSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts/supabase/isolation.mjs'),
      'utf8',
    );
    expect(isolationSrc).not.toMatch(/db push|--linked|supabase link/i);
    expect(isolationSrc).toMatch(/wipeCliMigrationsMirror|verifyIsolatedMigrationChecksums/);
  });
});
