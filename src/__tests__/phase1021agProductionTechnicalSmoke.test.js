/**
 * PHASE_10.21AG — production technical smoke static guards.
 * No network. Does not apply migrations.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const MIG_040 = path.join(ROOT, 'supabase/migrations/040_app_contract_private_storage_production.sql');
const MIG_033 = path.join(ROOT, 'supabase/migrations/033_app_contract_private_storage_local.sql');
const MIG_035 = path.join(ROOT, 'supabase/migrations/035_app_contract_private_storage_staging.sql');

describe('PHASE_10.21AG production technical smoke (STATIC)', () => {
  it('040 is the next free production storage migration and is not 033/035', () => {
    expect(fs.existsSync(MIG_040)).toBe(true);
    expect(fs.existsSync(MIG_033)).toBe(true);
    expect(fs.existsSync(MIG_035)).toBe(true);
    const sql = fs.readFileSync(MIG_040, 'utf8');
    expect(sql).toMatch(/DO NOT APPLY/i);
    expect(sql).toContain('contracts-v2-private-production');
    expect(sql).not.toMatch(/insert into storage\.buckets[\s\S]*contracts-v2-private-local/i);
    expect(sql).not.toMatch(/insert into storage\.buckets[\s\S]*contracts-v2-private-staging/i);
    expect(sql).toMatch(/bucket_id = 'contracts-v2-private-production'/);
    expect(sql).toMatch(/app_contract_files/);
    expect(sql).toMatch(/app_contract_storage_ops/);
  });

  it('033 remains local-only and 035 remains staging-only', () => {
    const s033 = fs.readFileSync(MIG_033, 'utf8');
    const s035 = fs.readFileSync(MIG_035, 'utf8');
    expect(s033).toMatch(/NÃO criar remotamente|SOMENTE stack local/i);
    expect(s035).toMatch(/NÃO criar em produção/i);
  });
});
