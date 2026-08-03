/**
 * Phase 9.2L — contrato storage.foldername (3 dirs) + storage.filename (avatar.webp).
 * Testes FS locais (sem Docker/rede/remoto).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  APP_MIGRATIONS,
  ISOLATED_CLI_MIGRATIONS,
  ISOLATED_DIR,
} from '../../scripts/supabase/constants.mjs';
import {
  ensureIsolatedMigrationsLayout,
  sha256File,
} from '../../scripts/supabase/isolation.mjs';

const APP_024 = path.join(APP_MIGRATIONS, '024_collaborator_photos_storage.sql');
const CLI_024 = path.join(ISOLATED_CLI_MIGRATIONS, '024_collaborator_photos_storage.sql');
const FIXTURE = path.join(ISOLATED_DIR, 'fixtures', 'rls_runtime_validation.sql');

function extractPathValidBody(sql) {
  const m = sql.match(
    /create or replace function public\.collaborator_photos_storage_path_valid\([\s\S]*?\$\$([\s\S]*?)\$\$;/i,
  );
  return m ? m[1] : '';
}

describe('Phase 9.2L — storage path helper contract', () => {
  beforeEach(() => {
    ensureIsolatedMigrationsLayout();
  });

  afterEach(() => {
    ensureIsolatedMigrationsLayout();
  });

  it('024 usa foldername length=3 e storage.filename=avatar.webp', () => {
    const body = extractPathValidBody(fs.readFileSync(APP_024, 'utf8'));
    expect(body).toMatch(/array_length\(\s*storage\.foldername\(object_name\)\s*,\s*1\s*\)\s*,\s*0\s*\)\s*=\s*3/);
    expect(body).toMatch(/lower\(\s*storage\.filename\(object_name\)\s*\)\s*=\s*'avatar\.webp'/);
    expect(body).not.toMatch(/array_length\([^)]*\)\s*,\s*0\s*\)\s*=\s*4/);
    expect(body).not.toMatch(/foldername\(object_name\)\)\[4\]/);
  });

  it('024 ainda valida tenant UUID + collaborators + collaborator UUID', () => {
    const body = extractPathValidBody(fs.readFileSync(APP_024, 'utf8'));
    expect(body).toMatch(/foldername\(object_name\)\)\[1\].*~\*/s);
    expect(body).toMatch(/lower\(\(storage\.foldername\(object_name\)\)\[2\]\)\s*=\s*'collaborators'/);
    expect(body).toMatch(/foldername\(object_name\)\)\[3\].*~\*/s);
  });

  it('espelho CLI 024 tem o mesmo SHA-256 da canônica', () => {
    const layout = ensureIsolatedMigrationsLayout();
    expect(layout.checksum.status).toBe('ISOLATED_MIGRATION_CHECKSUM_OK');
    expect(sha256File(CLI_024)).toBe(sha256File(APP_024));
  });

  it('fixture RLS cobre clinic-logos e asserts extras de path 024', () => {
    const fixture = fs.readFileSync(path.resolve(FIXTURE), 'utf8');
    expect(fixture).toContain('storage_013_clinic_logos_policies_present');
    expect(fixture).toContain('storage_013_write_policies_use_foldername_tenant');
    expect(fixture).toContain('storage_024_path_valid_ok');
    expect(fixture).toContain('storage_024_path_valid_rejects_wrong_filename');
    expect(fixture).toContain('storage_024_path_valid_rejects_extra_segment');
    expect(fixture).toContain('storage_024_path_valid_filename_case_insensitive');
  });
});
