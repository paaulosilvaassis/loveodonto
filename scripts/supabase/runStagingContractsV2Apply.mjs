/**
 * Phase 10.13 — apply Contracts V2 migrations ONLY on staging.
 *
 * Ordem:
 *   028 → 029 → 030 → 031 → 032 → 035 → 034
 *   (033 é LOCAL-ONLY — nunca aplicada aqui)
 *
 * Requer:
 *   CONTRACTS_V2_STAGING_APPLY=true
 *   LOVE_ODONTO_STAGING_CONFIRMATION=STAGING_APPLY_ONLY
 *   STAGING_SUPABASE_URL=https://tckdjyunwmdpqmewrwvt.supabase.co
 *   STAGING_DATABASE_URL=postgresql://... (host deve conter staging ref)
 *
 * Nunca: produção (uoep…), force, bucket público, flags ON.
 *
 *   node scripts/supabase/runStagingContractsV2Apply.mjs --dry-run
 *   node scripts/supabase/runStagingContractsV2Apply.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  APP_MIGRATIONS,
  PRODUCTION_REF,
  STAGING_REF,
} from './constants.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const STAGING_ORDER = [
  '028_app_contracts_v2_foundation.sql',
  '029_app_contracts_v2_rls.sql',
  '030_app_contract_ledger.sql',
  '031_app_contract_number_sequences.sql',
  '032_app_signature_sessions_and_challenges.sql',
  '035_app_contract_private_storage_staging.sql',
  '034_app_signature_delivery_attempts.sql',
];

const LOCAL_ONLY = '033_app_contract_private_storage_local.sql';

function isTruthy(v) {
  return ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function loadEnv() {
  return {
    ...parseEnvFile(path.join(REPO_ROOT, '.env.local')),
    ...process.env,
  };
}

function assertStagingGuard(env) {
  const errors = [];
  if (!isTruthy(env.CONTRACTS_V2_STAGING_APPLY)) {
    errors.push('CONTRACTS_V2_STAGING_APPLY must be true');
  }
  if (String(env.LOVE_ODONTO_STAGING_CONFIRMATION || '') !== 'STAGING_APPLY_ONLY') {
    errors.push('LOVE_ODONTO_STAGING_CONFIRMATION must be STAGING_APPLY_ONLY');
  }
  const url = String(env.STAGING_SUPABASE_URL || '').trim();
  const dbUrl = String(env.STAGING_DATABASE_URL || env.CONTRACTS_V2_STAGING_DATABASE_URL || '').trim();
  if (!url.includes(STAGING_REF) || !url.includes('supabase.co')) {
    errors.push('STAGING_SUPABASE_URL must target staging project ref');
  }
  if (url.includes(PRODUCTION_REF) || dbUrl.includes(PRODUCTION_REF)) {
    errors.push('PRODUCTION_REF detected — blocked');
  }
  if (!dbUrl) {
    errors.push('STAGING_DATABASE_URL required for DDL apply (psql)');
  }
  if (dbUrl && !dbUrl.includes(STAGING_REF) && !/staging/i.test(dbUrl)) {
    // pooler hosts sometimes use different naming; require explicit marker
    if (!isTruthy(env.CONTRACTS_V2_STAGING_DB_HOST_CONFIRMED)) {
      errors.push('STAGING_DATABASE_URL host must include staging ref or set CONTRACTS_V2_STAGING_DB_HOST_CONFIRMED=true after manual review');
    }
  }
  if (errors.length) {
    const err = new Error(`CONTRACTS_V2_STAGING_ENVIRONMENT_REQUIRED: ${errors.join('; ')}`);
    err.code = 'CONTRACTS_V2_STAGING_ENVIRONMENT_REQUIRED';
    err.details = errors;
    throw err;
  }
  return { url, dbUrl, ref: STAGING_REF };
}

function runPsql(dbUrl, sqlFile) {
  return new Promise((resolve) => {
    const child = spawn(
      'psql',
      [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', sqlFile],
      { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      resolve({
        exitCode: code,
        stdoutSanitized: stdout.slice(0, 4000),
        stderrSanitized: stderr.slice(0, 4000).replace(/postgres:\/\/[^@]+@/g, 'postgres://***@'),
      });
    });
  });
}

export async function runStagingContractsV2Apply(options = {}) {
  const env = options.env || loadEnv();
  const dryRun = options.dryRun !== false && !options.apply;
  const startedAt = new Date().toISOString();
  const report = {
    command: 'contracts-v2:staging-apply',
    startedAt,
    dryRun,
    stagingRef: STAGING_REF,
    productionRef: PRODUCTION_REF,
    productionTouched: false,
    localOnlySkipped: LOCAL_ONLY,
    order: STAGING_ORDER,
    steps: [],
    status: 'PENDING',
  };

  try {
    const guard = assertStagingGuard(env);
    report.guard = { ok: true, ref: guard.ref, urlHost: new URL(guard.url).hostname };

    for (const file of STAGING_ORDER) {
      const abs = path.join(APP_MIGRATIONS, file);
      if (!fs.existsSync(abs)) {
        report.status = 'MIGRATION_FILE_MISSING';
        report.missing = file;
        return report;
      }
      if (dryRun) {
        report.steps.push({ file, action: 'DRY_RUN_SKIP_APPLY', bytes: fs.statSync(abs).size });
        continue;
      }
      const result = await runPsql(guard.dbUrl, abs);
      report.steps.push({
        file,
        action: 'APPLY',
        exitCode: result.exitCode,
        ok: result.exitCode === 0,
        stderrSanitized: result.stderrSanitized,
      });
      if (result.exitCode !== 0) {
        report.status = 'APPLY_FAILED';
        report.failedAt = file;
        report.finishedAt = new Date().toISOString();
        return report;
      }
    }

    report.status = dryRun ? 'STAGING_APPLY_DRY_RUN_PASS' : 'STAGING_APPLY_PASS';
  } catch (error) {
    report.status = 'BLOCKED';
    report.error = {
      code: error.code || 'UNKNOWN',
      message: error.message,
      details: error.details || null,
    };
  }

  report.finishedAt = new Date().toISOString();
  return report;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const apply = process.argv.includes('--apply');
  runStagingContractsV2Apply({ dryRun: !apply, apply })
    .then((r) => {
      process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
      const ok = r.status === 'STAGING_APPLY_PASS' || r.status === 'STAGING_APPLY_DRY_RUN_PASS';
      process.exit(ok ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
