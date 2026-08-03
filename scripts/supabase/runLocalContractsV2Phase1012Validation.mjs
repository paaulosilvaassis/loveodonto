/**
 * Phase 10.12 — reset completo local 028–034 (duas vezes) + asserts.
 *
 * Requer:
 *   RUN_SUPABASE_LOCAL_INTEGRATION=true
 *   LOVE_ODONTO_LOCAL_DB_CONFIRMATION=LOCAL_DISPOSABLE_ONLY
 *   APPLY_LOCAL_DB_RESET=true
 *   CONTRACTS_V2_LOCAL_DATABASE=true
 *   CONTRACTS_V2_LOCAL_STORAGE=true
 *
 * Nunca: remoto, npx, link, db push, workdir supabase/ remoto.
 *
 *   node scripts/supabase/runLocalContractsV2Phase1012Validation.mjs
 *   node scripts/supabase/runLocalContractsV2Phase1012Validation.mjs --json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../phase92/processRunner.mjs';
import {
  ISOLATED_DIR,
  LOCAL_PROJECT_ID,
} from './constants.mjs';
import {
  ensureIsolatedMigrationsLayout,
  verifyIsolatedMigrationChecksums,
} from './isolation.mjs';
import { evaluateRemoteGuard, guardCommand } from './remoteGuard.mjs';
import { checkCli, checkDocker, resolveSupabaseBinary } from './toolchainPreflight.mjs';

const FIXTURE_REL = path.join('fixtures', 'contracts_v2_phase1012_validation.sql');
const FIXTURE_ABS = path.join(ISOLATED_DIR, FIXTURE_REL);
const DEFAULT_DB_CONTAINER = 'supabase_db_supabase-local';
const REQUIRED_MIGS = [
  '028_app_contracts_v2_foundation.sql',
  '029_app_contracts_v2_rls.sql',
  '030_app_contract_ledger.sql',
  '031_app_contract_number_sequences.sql',
  '032_app_signature_sessions_and_challenges.sql',
  '033_app_contract_private_storage_local.sql',
  '034_app_signature_delivery_attempts.sql',
];

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

async function runGuarded(binary, args, env, commandsExecuted, timeoutMs) {
  const gated = guardCommand(binary, args, env);
  if (gated.status !== 'SAFE_LOCAL_ENVIRONMENT') {
    commandsExecuted.push({ blocked: true, ...gated, durationMs: 0 });
    return { blocked: true, gate: gated, result: null };
  }
  const result = await runProcess(binary, args, {
    cwd: ISOLATED_DIR,
    env,
    timeoutMs,
  });
  commandsExecuted.push({
    blocked: false,
    command: binary,
    argsSanitized: result.argsSanitized,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    stdoutSanitized: result.stdoutSanitized,
    stderrSanitized: result.stderrSanitized,
  });
  return { blocked: false, gate: gated, result };
}

async function resolveLocalDbContainer(env, commandsExecuted) {
  const explicit = String(env.SUPABASE_LOCAL_DB_CONTAINER || '').trim();
  if (explicit) return { container: explicit, source: 'env' };
  const listed = await runProcess('docker', ['ps', '--format', '{{.Names}}'], {
    cwd: ISOLATED_DIR,
    env,
    timeoutMs: 10_000,
  });
  commandsExecuted.push({
    blocked: false,
    command: 'docker',
    argsSanitized: ['ps', '--format', '{{.Names}}'],
    exitCode: listed.exitCode,
    timedOut: listed.timedOut,
    durationMs: listed.durationMs,
    stdoutSanitized: listed.stdoutSanitized,
    stderrSanitized: listed.stderrSanitized,
  });
  const names = String(listed.stdoutSanitized || '').split(/\r?\n/).map((n) => n.trim()).filter(Boolean);
  const preferred = [
    DEFAULT_DB_CONTAINER,
    `supabase_db_${LOCAL_PROJECT_ID}`,
    ...names.filter((n) => n.startsWith('supabase_db_') && n.includes('local')),
    ...names.filter((n) => n.startsWith('supabase_db_')),
  ];
  for (const candidate of preferred) {
    if (names.includes(candidate)) return { container: candidate, source: 'docker_ps' };
  }
  return { container: null, source: 'not_found', names };
}

export async function runLocalContractsV2Phase1012Validation(options = {}) {
  const env = options.env || process.env;
  const asJson = Boolean(options.json);
  const commandsExecuted = [];
  const startedAt = new Date().toISOString();

  const guard = evaluateRemoteGuard(env);
  if (!isTruthy(env.CONTRACTS_V2_LOCAL_DATABASE) || !isTruthy(env.CONTRACTS_V2_LOCAL_STORAGE)) {
    return {
      status: 'CONTRACTS_V2_LOCAL_STORAGE_REQUIRED',
      startedAt,
      finishedAt: new Date().toISOString(),
      migrationsAppliedLocally: false,
      migrationsAppliedRemotely: false,
    };
  }
  if (guard.status !== 'SAFE_LOCAL_ENVIRONMENT' && guard.status !== 'LOCAL_INTEGRATION_SKIPPED') {
    return {
      status: 'BLOCKED',
      guard,
      startedAt,
      finishedAt: new Date().toISOString(),
      migrationsAppliedRemotely: false,
    };
  }
  if (!isTruthy(env.RUN_SUPABASE_LOCAL_INTEGRATION)
    || String(env.LOVE_ODONTO_LOCAL_DB_CONFIRMATION || '') !== 'LOCAL_DISPOSABLE_ONLY'
    || !isTruthy(env.APPLY_LOCAL_DB_RESET)) {
    return {
      status: 'LOCAL_INTEGRATION_SKIPPED',
      startedAt,
      finishedAt: new Date().toISOString(),
      migrationsAppliedLocally: false,
      migrationsAppliedRemotely: false,
    };
  }

  const docker = await checkDocker({ probe: true, env });
  const cli = await checkCli({ probe: true, env });
  if (docker.status !== 'DOCKER_AVAILABLE_AND_RUNNING' || cli.status !== 'CLI_AVAILABLE') {
    return {
      status: 'TOOLCHAIN_NOT_READY',
      docker,
      cli,
      startedAt,
      finishedAt: new Date().toISOString(),
      migrationsAppliedRemotely: false,
    };
  }

  const layout = ensureIsolatedMigrationsLayout();
  const checksums = verifyIsolatedMigrationChecksums();
  const missing = REQUIRED_MIGS.filter(
    (m) => !fs.existsSync(path.join(ISOLATED_DIR, 'supabase/migrations', m)),
  );
  const checksumOk = checksums.status === 'ISOLATED_MIGRATION_CHECKSUM_OK';
  if (missing.length || !checksumOk || !fs.existsSync(FIXTURE_ABS)) {
    return {
      status: 'MIRROR_CHECK_FAILED',
      missing,
      checksums,
      fixturePresent: fs.existsSync(FIXTURE_ABS),
      layoutStatus: layout.checksum?.status,
      startedAt,
      finishedAt: new Date().toISOString(),
      migrationsAppliedRemotely: false,
    };
  }

  const binary = resolveSupabaseBinary(env).binary;
  await runGuarded(binary, ['start'], env, commandsExecuted, 300_000);

  async function resetAndValidate() {
    const reset = await runGuarded(binary, ['db', 'reset', '--yes'], env, commandsExecuted, 600_000);
    if (reset.blocked || reset.result?.exitCode !== 0) {
      return { ok: false, stage: 'RESET_FAILED', reset };
    }
    const resolved = await resolveLocalDbContainer(env, commandsExecuted);
    if (!resolved.container) {
      return { ok: false, stage: 'LOCAL_DB_CONTAINER_NOT_FOUND', resolved };
    }
    const containerPath = '/tmp/contracts_v2_phase1012_validation.sql';
    await runGuarded(
      'docker',
      ['cp', FIXTURE_ABS, `${resolved.container}:${containerPath}`],
      env,
      commandsExecuted,
      30_000,
    );
    const run = await runGuarded(
      'docker',
      ['exec', resolved.container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', containerPath],
      env,
      commandsExecuted,
      120_000,
    );
    const out = String(run.result?.stdoutSanitized || '') + String(run.result?.stderrSanitized || '');
    const pass = out.includes('CONTRACTS_V2_PHASE1012_PASS') && run.result?.exitCode === 0;
    return { ok: pass, stage: pass ? 'PASS' : 'FAIL', resolved, out, run };
  }

  const first = await resetAndValidate();
  const second = await resetAndValidate();

  const migProbe = first.resolved?.container
    ? await runGuarded(
      'docker',
      [
        'exec', first.resolved.container, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c',
        "select version from supabase_migrations.schema_migrations where version ~ '^(028|029|030|031|032|033|034)' order by version;",
      ],
      env,
      commandsExecuted,
      20_000,
    )
    : null;

  const status = first.ok && second.ok ? 'CONTRACTS_V2_PHASE1012_PASS' : 'CONTRACTS_V2_PHASE1012_FAILED';
  const report = {
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    environment: 'love-odonto-local-disposable',
    container: first.resolved?.container || null,
    migrationsAppliedLocally: Boolean(first.resolved?.container),
    migrationsAppliedRemotely: false,
    remoteBucketsCreated: false,
    stagingBucketCreated: false,
    localBucket: 'contracts-v2-private-local',
    migrations: REQUIRED_MIGS,
    firstPass: first.ok,
    secondPass: second.ok,
    reproducibility: first.ok && second.ok,
    migrationVersionsProbe: String(migProbe?.result?.stdoutSanitized || '').trim(),
    checksumsOk: checksumOk,
    commandsExecuted: commandsExecuted.map((c) => ({
      command: c.command,
      exitCode: c.exitCode,
      blocked: c.blocked,
      durationMs: c.durationMs,
    })),
  };

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(`[phase1012] status=${report.status} pass1=${first.ok} pass2=${second.ok}`);
    console.log(`[phase1012] migrations local=true remote=false stagingBucket=false`);
    console.log(`[phase1012] versions:\n${report.migrationVersionsProbe}`);
  }
  return report;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runLocalContractsV2Phase1012Validation({ json: process.argv.includes('--json') })
    .then((r) => {
      process.exit(r.status === 'CONTRACTS_V2_PHASE1012_PASS' ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
