/**
 * Phase 10.13D — preflight alignment + staging remote validate guards (static).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runStagingPreflightDryRun } from '../../scripts/contracts-v2-staging-preflight.mjs';
import {
  STAGING_CONTRACTS_V2_MIGRATIONS,
  LOCAL_ONLY_CONTRACTS_V2_MIGRATION,
  STAGING_PRIVATE_BUCKET,
  STAGING_EXPECTED_VERSIONS,
} from '../../scripts/supabase/contractsV2StagingMigrations.mjs';
import { assertStagingValidateGuardShape } from './phase1013dValidateGuardHelper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

describe('Phase 10.13D — preflight dry-run alignment', () => {
  it('lista staging 028–032/034/035 e marca 033 SKIP_LOCAL_ONLY', () => {
    const report = runStagingPreflightDryRun({
      CONTRACTS_V2_DELIVERY_MODE: 'disabled',
      CONTRACTS_V2_RATE_LIMIT_MODE: 'persisted',
    });
    expect(report.ok).toBe(true);
    expect(report.mode).toBe('dry-run');
    expect(report.appliedMigrations).toBe(false);
    expect(report.stagingExpectedMigrations).toEqual([...STAGING_CONTRACTS_V2_MIGRATIONS]);
    expect(report.localOnlyMigration).toEqual({
      file: LOCAL_ONLY_CONTRACTS_V2_MIGRATION,
      status: 'SKIP_LOCAL_ONLY',
    });
    expect(report.stagingExpectedMigrations.join(',')).not.toContain('033_');
    expect(report.stagingExpectedMigrations.some((m) => m.startsWith('035_'))).toBe(true);

    const localOnly = report.checks.find((c) => c.name === 'local_only_033');
    expect(localOnly?.ok).toBe(true);
    expect(localOnly?.detail).toBe('SKIP_LOCAL_ONLY');

    const bucket = report.checks.find((c) => c.name === 'bucket_config');
    expect(bucket?.detail).toContain(STAGING_PRIVATE_BUCKET);
    expect(bucket?.detail).not.toMatch(/NOT created/i);

    expect(report.nextGate).toBe('READY_FOR_STAGING_REMOTE_VALIDATION');
    expect(report.readyForProduction).toBe(false);
  });

  it('falha se flag ligada', () => {
    const report = runStagingPreflightDryRun({
      VITE_CONTRACTS_DOMAIN_V2_ENABLED: 'true',
    });
    expect(report.ok).toBe(false);
  });
});

describe('Phase 10.13D — remote validate script contract', () => {
  it('script e npm script existem; não aplica migrations', () => {
    const script = path.join(ROOT, 'scripts/supabase/runStagingContractsV2Validate.mjs');
    expect(fs.existsSync(script)).toBe(true);
    const src = fs.readFileSync(script, 'utf8');
    expect(src).toContain('CONTRACTS_V2_STAGING_VALIDATE');
    expect(src).toContain('STAGING_VALIDATE_ONLY');
    expect(src).not.toMatch(/action:\s*'APPLY'/);
    expect(src).toContain('NÃO aplica migrations');
    expect(src).not.toContain('CONTRACTS_V2_STAGING_APPLY');
    expect(src).toContain('STAGING_PRIVATE_BUCKET');
    expect(src).toContain('PRODUCTION_REF');
    expect(src).toContain('STAGING_REF');
    expect(STAGING_PRIVATE_BUCKET).toBe('contracts-v2-private-staging');

    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['contracts-v2:staging-validate']).toContain('runStagingContractsV2Validate');
  });

  it('guard fail-closed sem confirmação/token', () => {
    expect(() => assertStagingValidateGuardShape({})).toThrow(/STAGING_VALIDATE/);
    expect(() => assertStagingValidateGuardShape({
      CONTRACTS_V2_STAGING_VALIDATE: 'true',
      LOVE_ODONTO_STAGING_CONFIRMATION: 'STAGING_VALIDATE_ONLY',
      STAGING_SUPABASE_URL: 'https://tckdjyunwmdpqmewrwvt.supabase.co',
    })).toThrow(/SUPABASE_ACCESS_TOKEN/);
    expect(() => assertStagingValidateGuardShape({
      CONTRACTS_V2_STAGING_VALIDATE: 'true',
      LOVE_ODONTO_STAGING_CONFIRMATION: 'STAGING_VALIDATE_ONLY',
      STAGING_SUPABASE_URL: 'https://uoepkwhqztmsjnzirpev.supabase.co',
      SUPABASE_ACCESS_TOKEN: 'sbp_test_not_real',
    })).toThrow(/PRODUCTION|staging/i);
  });

  it('SSOT de versões staging não inclui 033', () => {
    expect(STAGING_EXPECTED_VERSIONS).toEqual(['028', '029', '030', '031', '032', '034', '035']);
    expect(STAGING_CONTRACTS_V2_MIGRATIONS.some((m) => m.includes('033'))).toBe(false);
    for (const m of STAGING_CONTRACTS_V2_MIGRATIONS) {
      expect(fs.existsSync(path.join(ROOT, 'supabase/migrations', m))).toBe(true);
    }
  });
});
