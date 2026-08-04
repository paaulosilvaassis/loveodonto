/**
 * Phase 10.13/10.13B — apply Contracts V2 migrations ONLY on staging.
 *
 * Ordem (10.13B):
 *   028 → 029 → 030 → 031 → 032 → 034 → 035
 *   (033 é LOCAL-ONLY — nunca aplicada aqui)
 *
 * Requer:
 *   CONTRACTS_V2_STAGING_APPLY=true
 *   LOVE_ODONTO_STAGING_CONFIRMATION=STAGING_APPLY_ONLY
 *   STAGING_SUPABASE_URL=https://tckdjyunwmdpqmewrwvt.supabase.co
 *   E um dos canais DDL:
 *     STAGING_DATABASE_URL=postgresql://...  (requer psql)
 *     SUPABASE_ACCESS_TOKEN=...              (Management API SQL)
 *
 * Nunca: produção (uoep…), force, bucket público, flags ON.
 * Nunca imprimir token / Authorization header.
 *
 *   node scripts/supabase/runStagingContractsV2Apply.mjs --dry-run
 *   node scripts/supabase/runStagingContractsV2Apply.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import {
  APP_MIGRATIONS,
  PRODUCTION_REF,
  STAGING_REF,
} from './constants.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

/** Ordem autorizada Phase 10.13B — 033 excluída. */
const STAGING_ORDER = [
  '028_app_contracts_v2_foundation.sql',
  '029_app_contracts_v2_rls.sql',
  '030_app_contract_ledger.sql',
  '031_app_contract_number_sequences.sql',
  '032_app_signature_sessions_and_challenges.sql',
  '034_app_signature_delivery_attempts.sql',
  '035_app_contract_private_storage_staging.sql',
];

const LOCAL_ONLY = '033_app_contract_private_storage_local.sql';

function isTruthy(v) {
  return ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());
}

function sanitizeText(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]')
    .replace(/postgres:\/\/[^@]+@/g, 'postgres://***@')
    .replace(/sbp_[A-Za-z0-9]+/g, 'sbp_[REDACTED]')
    .slice(0, 4000);
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

function migrationVersion(fileName) {
  return String(fileName).split('_')[0];
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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
  const accessToken = String(env.SUPABASE_ACCESS_TOKEN || '').trim();
  if (!url.includes(STAGING_REF) || !url.includes('supabase.co')) {
    errors.push('STAGING_SUPABASE_URL must target staging project ref');
  }
  if (url.includes(PRODUCTION_REF) || dbUrl.includes(PRODUCTION_REF)) {
    errors.push('PRODUCTION_REF detected — blocked');
  }
  if (!dbUrl && !accessToken) {
    errors.push('STAGING_DATABASE_URL (psql) ou SUPABASE_ACCESS_TOKEN (Management API) é obrigatório para DDL');
  }
  if (dbUrl && !dbUrl.includes(STAGING_REF) && !/staging/i.test(dbUrl)) {
    if (!isTruthy(env.CONTRACTS_V2_STAGING_DB_HOST_CONFIRMED)) {
      errors.push('STAGING_DATABASE_URL host must include staging ref or set CONTRACTS_V2_STAGING_DB_HOST_CONFIRMED=true after manual review');
    }
  }
  if (dbUrl) {
    const psql = spawnSync('psql', ['--version'], { encoding: 'utf8' });
    if (psql.status !== 0 && !accessToken) {
      errors.push('psql não encontrado no PATH; instale libpq ou use SUPABASE_ACCESS_TOKEN');
    }
  }
  if (errors.length) {
    const err = new Error(`CONTRACTS_V2_STAGING_ENVIRONMENT_REQUIRED: ${errors.join('; ')}`);
    err.code = 'CONTRACTS_V2_STAGING_ENVIRONMENT_REQUIRED';
    err.details = errors;
    throw err;
  }
  return {
    url,
    dbUrl: dbUrl || null,
    accessToken: accessToken || null,
    channel: accessToken ? 'management-api' : 'psql',
    ref: STAGING_REF,
  };
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
        stdoutSanitized: sanitizeText(stdout),
        stderrSanitized: sanitizeText(stderr),
      });
    });
  });
}

async function runManagementSql(accessToken, projectRef, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  return {
    exitCode: res.ok ? 0 : res.status,
    body,
    stdoutSanitized: res.ok ? sanitizeText(JSON.stringify(body)).slice(0, 2000) : '',
    stderrSanitized: res.ok ? '' : sanitizeText(JSON.stringify(body)).slice(0, 2000),
  };
}

function extractVersions(body) {
  if (!body) return [];
  if (Array.isArray(body)) {
    return body.map((row) => row.version || row[0]).filter(Boolean).map(String);
  }
  if (Array.isArray(body?.data)) {
    return body.data.map((row) => row.version || row[0]).filter(Boolean).map(String);
  }
  return [];
}

async function listRemoteMigrationVersions(guard) {
  const sql = `
    select version
    from supabase_migrations.schema_migrations
    order by version;
  `;
  if (guard.channel === 'management-api') {
    const result = await runManagementSql(guard.accessToken, guard.ref, sql);
    if (result.exitCode !== 0) {
      // schema_migrations pode não existir ainda — tratar como vazio se erro de relação
      const msg = String(result.stderrSanitized || '');
      if (/does not exist|undefined_table|42P01/i.test(msg)) {
        return { ok: true, versions: [], note: 'schema_migrations_absent' };
      }
      return { ok: false, versions: [], error: result.stderrSanitized };
    }
    return { ok: true, versions: extractVersions(result.body), note: null };
  }
  // psql path: write temp query
  const tmp = path.join(REPO_ROOT, '.tmp-staging-mig-list.sql');
  fs.writeFileSync(tmp, sql);
  const result = await runPsql(guard.dbUrl, tmp);
  try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  if (result.exitCode !== 0) {
    if (/does not exist|42P01/i.test(result.stderrSanitized)) {
      return { ok: true, versions: [], note: 'schema_migrations_absent' };
    }
    return { ok: false, versions: [], error: result.stderrSanitized };
  }
  const versions = String(result.stdoutSanitized || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^\d{3,}/.test(l));
  return { ok: true, versions, note: null };
}

async function recordMigrationVersion(guard, version, name) {
  const sql = `
    insert into supabase_migrations.schema_migrations (version, name)
    values ('${version.replace(/'/g, "''")}', '${String(name || '').replace(/'/g, "''")}')
    on conflict (version) do nothing;
  `;
  // Some schemas only have version column
  const sqlFallback = `
    insert into supabase_migrations.schema_migrations (version)
    values ('${version.replace(/'/g, "''")}')
    on conflict (version) do nothing;
  `;
  if (guard.channel === 'management-api') {
    let result = await runManagementSql(guard.accessToken, guard.ref, sql);
    if (result.exitCode !== 0) {
      result = await runManagementSql(guard.accessToken, guard.ref, sqlFallback);
    }
    return result.exitCode === 0;
  }
  const tmp = path.join(REPO_ROOT, '.tmp-staging-mig-record.sql');
  fs.writeFileSync(tmp, sqlFallback);
  const result = await runPsql(guard.dbUrl, tmp);
  try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  return result.exitCode === 0;
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
    checksums: {},
    remoteVersionsBefore: [],
    steps: [],
    status: 'PENDING',
  };

  try {
    const guard = assertStagingGuard(env);
    report.guard = {
      ok: true,
      ref: guard.ref,
      urlHost: new URL(guard.url).hostname,
      channel: guard.channel,
      tokenPresent: Boolean(guard.accessToken),
    };

    if (guard.ref !== STAGING_REF || guard.url.includes(PRODUCTION_REF)) {
      throw Object.assign(new Error('CONTRACTS_V2_STAGING_ENVIRONMENT_REQUIRED: target mismatch'), {
        code: 'CONTRACTS_V2_STAGING_ENVIRONMENT_REQUIRED',
      });
    }

    for (const file of STAGING_ORDER) {
      const abs = path.join(APP_MIGRATIONS, file);
      if (!fs.existsSync(abs)) {
        report.status = 'MIGRATION_FILE_MISSING';
        report.missing = file;
        return report;
      }
      report.checksums[file] = sha256File(abs).slice(0, 12);
    }
    if (fs.existsSync(path.join(APP_MIGRATIONS, LOCAL_ONLY))) {
      report.localOnlyChecksum = sha256File(path.join(APP_MIGRATIONS, LOCAL_ONLY)).slice(0, 12);
    }

    const remote = await listRemoteMigrationVersions(guard);
    if (!remote.ok) {
      report.status = 'REMOTE_MIGRATION_LIST_FAILED';
      report.error = { code: 'REMOTE_MIGRATION_LIST_FAILED', message: remote.error };
      report.finishedAt = new Date().toISOString();
      return report;
    }
    report.remoteVersionsBefore = remote.versions;
    report.remoteListNote = remote.note;

    const appliedSet = new Set(remote.versions.map(String));
    // Also treat short/long forms: '028' vs full timestamp versions containing 028
    const isApplied = (version) => {
      if (appliedSet.has(version)) return true;
      for (const v of appliedSet) {
        if (String(v).startsWith(version) || String(v).includes(`_${version}_`) || String(v) === version) {
          return true;
        }
      }
      // numeric-only match at start
      return [...appliedSet].some((v) => String(v).replace(/^0+/, '') === version.replace(/^0+/, '') && /^\d+$/.test(v));
    };

    for (const file of STAGING_ORDER) {
      const abs = path.join(APP_MIGRATIONS, file);
      const version = migrationVersion(file);
      const started = new Date().toISOString();

      if (isApplied(version)) {
        report.steps.push({
          file,
          version,
          action: 'SKIP_ALREADY_APPLIED',
          ok: true,
          startedAt: started,
          finishedAt: new Date().toISOString(),
        });
        continue;
      }

      if (dryRun) {
        report.steps.push({
          file,
          version,
          action: 'DRY_RUN_WOULD_APPLY',
          bytes: fs.statSync(abs).size,
          checksum: report.checksums[file],
          ok: true,
          startedAt: started,
          finishedAt: new Date().toISOString(),
        });
        continue;
      }

      let result;
      if (guard.channel === 'psql') {
        result = await runPsql(guard.dbUrl, abs);
      } else {
        const sql = fs.readFileSync(abs, 'utf8');
        result = await runManagementSql(guard.accessToken, guard.ref, sql);
      }

      const step = {
        file,
        version,
        action: 'APPLY',
        channel: guard.channel,
        exitCode: result.exitCode,
        ok: result.exitCode === 0,
        startedAt: started,
        finishedAt: new Date().toISOString(),
        stderrSanitized: result.stderrSanitized,
      };

      if (result.exitCode !== 0) {
        report.steps.push(step);
        report.status = 'APPLY_FAILED';
        report.failedAt = file;
        report.finishedAt = new Date().toISOString();
        return report;
      }

      const recorded = await recordMigrationVersion(guard, version, file);
      step.recordedInSchemaMigrations = recorded;
      report.steps.push(step);
    }

    // Ensure 033 never applied
    if (isApplied('033') || appliedSet.has('033')) {
      report.warning = '033_PRESENT_ON_REMOTE_UNEXPECTED';
    }

    report.status = dryRun ? 'STAGING_APPLY_DRY_RUN_PASS' : 'STAGING_APPLY_PASS';
  } catch (error) {
    report.status = 'BLOCKED';
    report.error = {
      code: error.code || 'UNKNOWN',
      message: sanitizeText(error.message),
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
      console.error(sanitizeText(err?.message || err));
      process.exit(1);
    });
}
