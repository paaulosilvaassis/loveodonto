/**
 * PHASE_10.21AF — static regression for app_user_can_access_tenant(text) overload.
 * No network / no secrets. Does not apply migrations.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MIG = '039_app_user_can_access_tenant_text_overload.sql';
const APP = path.join(REPO_ROOT, 'supabase/migrations', MIG);
const MIG_029 = path.join(
  REPO_ROOT,
  'supabase/migrations/029_app_contracts_v2_rls.sql',
);
const CANONICAL_SHA256 =
  'aae9c13a656811effb117e2024322be0b713c08669a65c6800318f4333672f2b';

function sha256(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

describe('PHASE_10.21AF helper text overload (STATIC)', () => {
  it('039 canonical file exists in supabase/migrations', () => {
    expect(fs.existsSync(APP)).toBe(true);
    expect(sha256(APP)).toBe(CANONICAL_SHA256);
  });

  it('creates text overload that delegates to uuid helper', () => {
    const sql = fs.readFileSync(APP, 'utf8');
    expect(sql).toMatch(/create or replace function public\.app_user_can_access_tenant\s*\(\s*row_tenant_id\s+text\s*\)/i);
    expect(sql).toMatch(/return public\.app_user_can_access_tenant\(\s*parsed\s*\)/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/search_path\s*=\s*public/i);
    expect(sql).toMatch(/stable/i);
  });

  it('rejects null/empty/invalid without reimplementing membership SQL', () => {
    const sql = fs.readFileSync(APP, 'utf8');
    expect(sql).toMatch(/row_tenant_id is null/i);
    expect(sql).toMatch(/length\(btrim\(row_tenant_id\)\) = 0/i);
    expect(sql).toMatch(/invalid_text_representation/i);
    expect(sql).not.toMatch(/from public\.tenant_users/i);
    expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  });

  it('does not alter uuid overload or mutate tables / contracts foundation', () => {
    const sql = fs.readFileSync(APP, 'utf8');
    expect(sql).not.toMatch(/create or replace function public\.app_user_can_access_tenant\s*\(\s*row_tenant_id\s+uuid\s*\)/i);
    expect(sql).not.toMatch(/create table/i);
    expect(sql).not.toMatch(/alter table/i);
    expect(sql).not.toMatch(/028_app_contracts|029_app_contracts|036_app_package/i);
    expect(sql).toMatch(/revoke all on function public\.app_user_can_access_tenant\(text\) from public/i);
    expect(sql).toMatch(/grant execute on function public\.app_user_can_access_tenant\(text\) to authenticated/i);
  });

  it('migration 029 still requires text overload (compatibility contract)', () => {
    const sql029 = fs.readFileSync(MIG_029, 'utf8');
    expect(sql029).toMatch(/app_user_can_access_tenant\(\s*tenant_id\s*::\s*text\s*\)/);
    const sql039 = fs.readFileSync(APP, 'utf8');
    expect(sql039).toMatch(/app_user_can_access_tenant\(row_tenant_id text\)/i);
  });
});
