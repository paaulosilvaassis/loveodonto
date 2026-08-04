/**
 * contracts-v2:staging-preflight — dry-run only (Phase 10.12 / 10.13D).
 *
 * NÃO aplica migrations, NÃO cria bucket, NÃO faz deploy, NÃO toca staging remoto.
 * Validação remota real: npm run contracts-v2:staging-validate
 *
 *   node scripts/contracts-v2-staging-preflight.mjs
 *   npm run contracts-v2:staging-preflight
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  STAGING_CONTRACTS_V2_MIGRATIONS,
  LOCAL_ONLY_CONTRACTS_V2_MIGRATION,
  LOCAL_MIRROR_CONTRACTS_V2_MIGRATIONS,
  STAGING_PRIVATE_BUCKET,
} from './supabase/contractsV2StagingMigrations.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const FLAGS = [
  'VITE_CONTRACTS_DOMAIN_V2_ENABLED',
  'VITE_CONTRACTS_MODULE_V2_ENABLED',
  'VITE_CONTRACT_TEMPLATES_V2_ENABLED',
  'VITE_CONTRACT_PACKAGES_ENABLED',
  'VITE_CONTRACT_VERSIONING_ENABLED',
  'VITE_CONTRACT_PDF_V2_ENABLED',
  'VITE_CONTRACT_INTERNAL_SIGNATURE_V2_ENABLED',
  'VITE_CONTRACT_EXTERNAL_SIGNATURE_ENABLED',
  'VITE_CONTRACT_STORAGE_V2_ENABLED',
  'VITE_CONTRACT_BUDGET_INTEGRATION_V2_ENABLED',
  'VITE_CONTRACT_FINANCIAL_ACTIVATION_ON_SIGNED_ENABLED',
  'VITE_CONTRACT_ODONTOGRAM_SNAPSHOT_ENABLED',
  'VITE_CONTRACT_PATIENT_PORTAL_ENABLED',
  'VITE_CONTRACT_AUDIT_LEDGER_ENABLED',
  'VITE_CONTRACT_PUBLIC_VERIFICATION_ENABLED',
];

function isTruthy(v) {
  return ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function failClosed(checks) {
  return checks.every((c) => c.ok);
}

export function runStagingPreflightDryRun(env = process.env) {
  const checks = [];
  const push = (name, ok, detail) => checks.push({ name, ok, detail });

  const marker = String(env.CONTRACTS_V2_ENVIRONMENT_MARKER || env.LOVE_ODONTO_ENV_MARKER || '').trim();
  push('environment_marker', marker === 'staging-candidate' || marker === '', marker || '(empty — expected for dry-run)');

  const projectRef = String(env.CONTRACTS_V2_STAGING_PROJECT_REF || '').trim();
  push('project_ref_not_inferred', !projectRef || !/supabase\.co/i.test(projectRef), 'must be explicit later; not applied now');

  const dbHost = String(env.CONTRACTS_V2_STAGING_DATABASE_HOST || '').trim();
  push('database_host_absent_or_marked', !dbHost || dbHost.includes('staging'), 'no remote apply');

  const migDir = path.join(ROOT, 'supabase/migrations');
  const mirrorDir = path.join(ROOT, 'supabase-local/supabase/migrations');

  let stagingFilesOk = true;
  for (const m of STAGING_CONTRACTS_V2_MIGRATIONS) {
    if (!fs.existsSync(path.join(migDir, m))) {
      stagingFilesOk = false;
      break;
    }
  }
  push(
    'staging_expected_migrations_present',
    stagingFilesOk,
    STAGING_CONTRACTS_V2_MIGRATIONS.join(','),
  );

  const localOnlyPath = path.join(migDir, LOCAL_ONLY_CONTRACTS_V2_MIGRATION);
  push(
    'local_only_033',
    fs.existsSync(localOnlyPath) && !STAGING_CONTRACTS_V2_MIGRATIONS.includes(LOCAL_ONLY_CONTRACTS_V2_MIGRATION),
    'SKIP_LOCAL_ONLY',
  );

  let mirrorsOk = true;
  for (const m of LOCAL_MIRROR_CONTRACTS_V2_MIGRATIONS) {
    const a = path.join(migDir, m);
    const b = path.join(mirrorDir, m);
    if (!fs.existsSync(a) || !fs.existsSync(b)) {
      mirrorsOk = false;
      break;
    }
    if (sha256File(a) !== sha256File(b)) mirrorsOk = false;
  }
  push('local_mirror_migrations_ok', mirrorsOk, LOCAL_MIRROR_CONTRACTS_V2_MIGRATIONS.join(','));

  const baseUrl = String(env.CONTRACTS_V2_PUBLIC_BASE_URL || '').trim();
  const baseOk = !baseUrl
    || (baseUrl.startsWith('https://')
      && !baseUrl.includes('localhost')
      && !baseUrl.includes('127.0.0.1')
      && !baseUrl.includes('?')
      && !baseUrl.includes('#'));
  push('public_base_url', baseOk, baseUrl ? 'configured' : 'absent (ok for dry-run)');

  const origins = String(env.CONTRACTS_V2_PUBLIC_ALLOWED_ORIGINS || '').trim();
  push(
    'origins',
    !origins || (!origins.includes('*') && !origins.includes('localhost')),
    origins ? 'explicit' : 'empty (staging must set before enable)',
  );

  const bucket = String(env.CONTRACTS_V2_PRIVATE_BUCKET || '').trim();
  push(
    'bucket_config',
    !bucket || bucket === STAGING_PRIVATE_BUCKET,
    bucket
      ? `configured: ${bucket}`
      : `expected remote: ${STAGING_PRIVATE_BUCKET} (existence via contracts-v2:staging-validate)`,
  );

  const delivery = String(env.CONTRACTS_V2_DELIVERY_MODE || 'disabled').trim().toLowerCase();
  push('delivery_disabled', delivery === 'disabled', delivery);

  let flagsOff = true;
  for (const f of FLAGS) {
    if (isTruthy(env[f])) flagsOff = false;
  }
  push('flags_off', flagsOff, flagsOff ? '15/15_false' : 'SOME_TRUE');

  const secret = String(env.CONTRACTS_V2_SIGNING_TOKEN_SECRET || '');
  const secretStrong = secret.length >= 32
    && !['secret', 'changeme', 'password', 'test'].includes(secret.toLowerCase());
  push(
    'secrets_strong_or_absent',
    !secret || secretStrong,
    secret ? (secretStrong ? 'present_strong' : 'WEAK') : 'absent (must set before staging enable)',
  );

  const rateMode = String(env.CONTRACTS_V2_RATE_LIMIT_MODE || '').trim().toLowerCase();
  push(
    'rate_limit_not_memory_for_staging',
    rateMode !== 'memory-test',
    rateMode || 'unset',
  );

  const trust = env.CONTRACTS_V2_TRUST_PROXY;
  push(
    'trust_proxy_numeric_or_unset',
    trust == null || trust === '' || /^\d+$/.test(String(trust)),
    String(trust ?? 'unset'),
  );

  const legacyAlt = fs.readdirSync(path.join(ROOT, 'supabase/migrations'))
    .find((f) => f.startsWith('006_'));
  push('legacy_006_present', Boolean(legacyAlt), legacyAlt || '006');

  const roleDefaults = fs.readFileSync(path.join(ROOT, 'src/permissions/roleDefaults.js'), 'utf8');
  push(
    'role_defaults_untouched_for_new_perms',
    !roleDefaults.includes('runtime_readiness')
      && !roleDefaults.includes('staging_preflight')
      && !roleDefaults.includes('view_security_diagnostics'),
    'catalog-only permissions',
  );

  push('dry_run_only', true, 'no remote mutation performed');
  push('remote_apply_blocked', true, 'this command never applies migrations');
  push('remote_validate_separate', true, 'use contracts-v2:staging-validate for remote schema/RLS/smoke');

  const ok = failClosed(checks) && flagsOff && delivery === 'disabled' && stagingFilesOk && mirrorsOk;
  return {
    command: 'contracts-v2:staging-preflight',
    mode: 'dry-run',
    ok,
    status: ok ? 'STAGING_PREFLIGHT_DRY_RUN_PASS' : 'STAGING_PREFLIGHT_DRY_RUN_FAIL',
    appliedMigrations: false,
    createdRemoteBucket: false,
    deployed: false,
    stagingExpectedMigrations: [...STAGING_CONTRACTS_V2_MIGRATIONS],
    localOnlyMigration: {
      file: LOCAL_ONLY_CONTRACTS_V2_MIGRATION,
      status: 'SKIP_LOCAL_ONLY',
    },
    checks,
    nextGate: 'READY_FOR_STAGING_REMOTE_VALIDATION',
    readyForProduction: false,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const report = runStagingPreflightDryRun(process.env);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.ok ? 0 : 1);
}
