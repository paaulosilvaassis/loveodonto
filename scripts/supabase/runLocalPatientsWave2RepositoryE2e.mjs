/**
 * Phase 9.4A Wave 2 — Repository structural E2E (SQL) (local disposable only).
 *
 * Requer:
 *   RUN_SUPABASE_LOCAL_INTEGRATION=true
 *   LOVE_ODONTO_LOCAL_DB_CONFIRMATION=LOCAL_DISPOSABLE_ONLY
 *
 * Não reseta o DB. Não toca remoto. Não usa --linked / db push / npx.
 * Pré-requisito: migration 025 aplicada (dry-run local).
 *
 *   node scripts/supabase/runLocalPatientsWave2RepositoryE2e.mjs
 *   node scripts/supabase/runLocalPatientsWave2RepositoryE2e.mjs --json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../phase92/processRunner.mjs';
import {
  ISOLATED_DIR,
  LOCAL_PROJECT_ID,
  readLinkedProjectMeta,
} from './constants.mjs';
import { evaluateIsolation } from './isolation.mjs';
import { evaluateOptIn } from './optInContract.mjs';
import { guardCommand } from './remoteGuard.mjs';
import { checkCli, checkDocker, resolveSupabaseBinary } from './toolchainPreflight.mjs';

const FIXTURE_REL = path.join('fixtures', 'patients_wave2_repository_e2e.sql');
const FIXTURE_ABS = path.join(ISOLATED_DIR, FIXTURE_REL);
const DEFAULT_DB_CONTAINER = 'supabase_db_supabase-local';

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

  const names = String(listed.stdoutSanitized || '')
    .split(/\r?\n/)
    .map((n) => n.trim())
    .filter(Boolean);

  const preferred = [
    DEFAULT_DB_CONTAINER,
    `supabase_db_${LOCAL_PROJECT_ID}`,
    ...names.filter((n) => n.startsWith('supabase_db_') && n.includes('local')),
    ...names.filter((n) => n.startsWith('supabase_db_')),
  ];
  for (const candidate of preferred) {
    if (names.includes(candidate)) {
      return { container: candidate, source: 'docker_ps' };
    }
  }
  return { container: null, source: 'not_found', names };
}

export async function runLocalPatientsWave2RepositoryE2e(options = {}) {
  const env = options.env || process.env;
  const started = Date.now();
  const commandsExecuted = [];
  const linkedBefore = readLinkedProjectMeta();

  const optIn = evaluateOptIn(env);
  const isolation = evaluateIsolation(env);

  const base = {
    phase: '9.4A-Wave2-RepoE2E',
    status: 'PATIENTS_WAVE2_REPO_E2E_BLOCKED',
    isolation: isolation.status,
    config: isolation.config?.status,
    linkedRef: linkedBefore.data?.ref || null,
    linkedMetadataPreserved: true,
    remoteActionsExecuted: false,
    resetExecuted: false,
    migrationsExecuted: false,
    startExecuted: false,
    usedLinked: false,
    usedDbPush: false,
    usedNpx: false,
    workdir: ISOLATED_DIR,
    fixture: FIXTURE_REL,
    executionMode: 'docker_exec_psql_local',
    commandsExecuted,
    blockers: [],
    warnings: [],
    scenarios: [],
    durationMs: 0,
  };

  if (optIn.status !== 'OPT_IN_OK') {
    base.blockers.push(...optIn.blockers);
    base.status = 'PATIENTS_WAVE2_REPO_E2E_SKIPPED_OPT_IN';
    base.durationMs = Date.now() - started;
    return base;
  }

  if (isolation.config?.status !== 'CONFIG_LOCAL_OK') {
    base.blockers.push('CONFIG_NOT_LOCAL_OK');
  }
  if (!fs.existsSync(FIXTURE_ABS)) {
    base.blockers.push('PATIENTS_WAVE2_REPO_E2E_FIXTURE_MISSING');
  }
  if (isTruthy(env.APPLY_LOCAL_DB_RESET)) {
    base.warnings.push('APPLY_LOCAL_DB_RESET is set but Wave1 RLS runner never resets the DB');
  }

  const docker = await checkDocker({ probe: true, env });
  const cli = await checkCli({ probe: true, env });
  base.docker = docker.status;
  base.cli = cli.status;

  if (docker.status !== 'DOCKER_AVAILABLE_AND_RUNNING') {
    base.blockers.push(docker.status);
  }
  if (cli.status !== 'CLI_AVAILABLE') {
    base.blockers.push(cli.status);
  }
  if (base.blockers.length) {
    base.status = 'PATIENTS_WAVE2_REPO_E2E_BLOCKED';
    base.durationMs = Date.now() - started;
    return base;
  }

  const binary = cli.binary || resolveSupabaseBinary(env).binary;

  const statusRun = await runGuarded(
    binary,
    ['status'],
    env,
    commandsExecuted,
    Number(env.SUPABASE_STATUS_TIMEOUT_MS) || 30_000,
  );
  if (statusRun.blocked || statusRun.result?.timedOut || statusRun.result?.exitCode !== 0) {
    base.blockers.push(statusRun.blocked ? statusRun.gate.status : 'LOCAL_STACK_NOT_RUNNING');
    base.status = 'PATIENTS_WAVE2_REPO_E2E_BLOCKED';
    base.durationMs = Date.now() - started;
    return base;
  }

  const resolved = await resolveLocalDbContainer(env, commandsExecuted);
  base.dbContainer = resolved.container;
  if (!resolved.container) {
    base.blockers.push('LOCAL_DB_CONTAINER_NOT_FOUND');
    base.status = 'PATIENTS_WAVE2_REPO_E2E_BLOCKED';
    base.durationMs = Date.now() - started;
    return base;
  }

  const sql = fs.readFileSync(FIXTURE_ABS, 'utf8');
  const psqlArgs = [
    'exec',
    '-i',
    resolved.container,
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-f',
    '-',
  ];
  const psqlGate = guardCommand('docker', psqlArgs, env);
  if (psqlGate.status !== 'SAFE_LOCAL_ENVIRONMENT') {
    base.blockers.push(psqlGate.status);
    base.status = 'PATIENTS_WAVE2_REPO_E2E_BLOCKED';
    base.durationMs = Date.now() - started;
    return base;
  }

  const queryResult = await runProcess('docker', psqlArgs, {
    cwd: ISOLATED_DIR,
    env,
    timeoutMs: Number(env.SUPABASE_PATIENTS_WAVE2_REPO_E2E_TIMEOUT_MS) || 120_000,
    stdin: sql,
  });
  commandsExecuted.push({
    blocked: false,
    command: 'docker',
    argsSanitized: queryResult.argsSanitized,
    exitCode: queryResult.exitCode,
    timedOut: queryResult.timedOut,
    durationMs: queryResult.durationMs,
    stdoutSanitized: queryResult.stdoutSanitized,
    stderrSanitized: queryResult.stderrSanitized,
  });

  const out = `${queryResult.stdoutSanitized}\n${queryResult.stderrSanitized}`;
  const timedOut = Boolean(queryResult.timedOut);
  const exitOk = queryResult.exitCode === 0;
  const hasPass = /PATIENTS_WAVE2_REPO_E2E_PASS/.test(out);
  const hasFail = /PATIENTS_WAVE2_REPO_E2E_FAILED/.test(out);

  if (timedOut) {
    base.blockers.push('PATIENTS_WAVE2_REPO_E2E_QUERY_TIMEOUT');
    base.status = 'PATIENTS_WAVE2_REPO_E2E_FAILED';
  } else if (hasPass && exitOk && !hasFail) {
    base.status = 'PATIENTS_WAVE2_REPO_E2E_PASS';
  } else if (
    /schema_gap_patients_wave1_missing|rode.*dry-run/i.test(out)
    || /precondition_patients_exists\s*\|\s*f\b/i.test(out)
  ) {
    base.blockers.push('SCHEMA_NOT_APPLIED_RUN_LOCAL_DRY_RUN_WITH_027');
    base.status = 'PATIENTS_WAVE2_REPO_E2E_BLOCKED';
  } else if (/connection refused|No such container|does not exist/i.test(out)) {
    base.blockers.push('LOCAL_DB_QUERY_FAILED');
    base.status = 'PATIENTS_WAVE2_REPO_E2E_BLOCKED';
  } else {
    base.blockers.push('PATIENTS_WAVE2_REPO_E2E_ASSERTIONS_FAILED');
    base.status = 'PATIENTS_WAVE2_REPO_E2E_FAILED';
  }

  base.scenarios = out
    .split(/\r?\n/)
    .filter((l) =>
      /precondition_|rls_enabled_|policies_|no_policy_|user_|orphan_|known_contract|unauthenticated_/.test(l))
    .slice(0, 80);

  if (/known_contract_select_is_jwt_claim_scoped/.test(out)) {
    base.warnings.push(
      'SELECT policies are JWT-claim scoped (app_user_can_access_tenant); mutations require admin membership',
    );
  }
  base.warnings.push(
    'CLI db query --file rejected multi-statement; execution uses docker exec + local psql (remoteActionsExecuted=false)',
  );

  const linkedAfter = readLinkedProjectMeta();
  base.linkedMetadataPreserved = linkedBefore.present === linkedAfter.present
    && linkedBefore.data?.ref === linkedAfter.data?.ref;
  base.remoteActionsExecuted = false;
  base.durationMs = Date.now() - started;
  return base;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const report = await runLocalPatientsWave2RepositoryE2e();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(`Phase 9.4A Wave2 Repository E2E: ${report.status}`);
    console.log(`docker=${report.docker} cli=${report.cli}`);
    console.log(`isolation=${report.isolation} config=${report.config}`);
    console.log(`linkedRef=${report.linkedRef} preserved=${report.linkedMetadataPreserved}`);
    console.log(`remoteActionsExecuted=${report.remoteActionsExecuted}`);
    if (report.dbContainer) console.log(`dbContainer=${report.dbContainer}`);
    if (report.warnings?.length) console.log(`warnings: ${report.warnings.join(' | ')}`);
    if (report.blockers?.length) console.log(`blockers: ${report.blockers.join(', ')}`);
    console.log(`commandsExecuted=${report.commandsExecuted.length} durationMs=${report.durationMs}`);
  }
  if (report.status === 'PATIENTS_WAVE2_REPO_E2E_PASS') process.exit(0);
  if (
    report.status === 'PATIENTS_WAVE2_REPO_E2E_SKIPPED_OPT_IN'
    || report.status === 'PATIENTS_WAVE2_REPO_E2E_BLOCKED'
  ) {
    process.exit(2);
  }
  process.exit(1);
}
