/**
 * Phase 9.2C — RLS runtime validation runner (local only).
 *
 * Requer:
 *   RUN_SUPABASE_LOCAL_INTEGRATION=true
 *   LOVE_ODONTO_LOCAL_DB_CONFIRMATION=LOCAL_DISPOSABLE_ONLY
 *
 * NÃO requer APPLY_LOCAL_DB_RESET (não reseta o banco).
 * Nunca: --linked, db push, link, npx, --db-url remoto.
 *
 * Execução SQL: docker exec + psql no container local (simple query protocol).
 * Motivo: `supabase db query --file` usa prepared statement e rejeita multi-statement.
 *
 *   node scripts/supabase/runLocalRlsRuntimeValidation.mjs
 *   node scripts/supabase/runLocalRlsRuntimeValidation.mjs --json
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

const FIXTURE_REL = path.join('fixtures', 'rls_runtime_validation.sql');
const FIXTURE_ABS = path.join(ISOLATED_DIR, FIXTURE_REL);
const DEFAULT_DB_CONTAINER = 'supabase_db_supabase-local';

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

async function runGuarded(binary, args, env, commandsExecuted, timeoutMs, extra = {}) {
  const gated = guardCommand(binary, args, env);
  if (gated.status !== 'SAFE_LOCAL_ENVIRONMENT') {
    commandsExecuted.push({ blocked: true, ...gated, durationMs: 0 });
    return { blocked: true, gate: gated, result: null };
  }
  const result = await runProcess(binary, args, {
    cwd: ISOLATED_DIR,
    env,
    timeoutMs,
    ...extra,
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

export async function runLocalRlsRuntimeValidation(options = {}) {
  const env = options.env || process.env;
  const started = Date.now();
  const commandsExecuted = [];
  const linkedBefore = readLinkedProjectMeta();

  const optIn = evaluateOptIn(env);
  const isolation = evaluateIsolation(env);

  const base = {
    phase: '9.2C',
    status: 'RLS_RUNTIME_BLOCKED',
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
    base.status = 'RLS_RUNTIME_SKIPPED_OPT_IN';
    base.durationMs = Date.now() - started;
    return base;
  }

  if (isolation.config?.status !== 'CONFIG_LOCAL_OK') {
    base.blockers.push('CONFIG_NOT_LOCAL_OK');
  }
  if (!fs.existsSync(FIXTURE_ABS)) {
    base.blockers.push('RLS_FIXTURE_MISSING');
  }
  if (isTruthy(env.APPLY_LOCAL_DB_RESET)) {
    base.warnings.push('APPLY_LOCAL_DB_RESET is set but RLS runner never resets the DB');
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
    base.status = 'RLS_RUNTIME_BLOCKED';
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
    base.status = 'RLS_RUNTIME_BLOCKED';
    base.durationMs = Date.now() - started;
    return base;
  }

  const resolved = await resolveLocalDbContainer(env, commandsExecuted);
  base.dbContainer = resolved.container;
  if (!resolved.container) {
    base.blockers.push('LOCAL_DB_CONTAINER_NOT_FOUND');
    base.status = 'RLS_RUNTIME_BLOCKED';
    base.durationMs = Date.now() - started;
    return base;
  }

  const sql = fs.readFileSync(FIXTURE_ABS, 'utf8');
  // docker exec + psql: multi-statement via simple query protocol (local only)
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
    base.status = 'RLS_RUNTIME_BLOCKED';
    base.durationMs = Date.now() - started;
    return base;
  }

  const queryResult = await runProcess('docker', psqlArgs, {
    cwd: ISOLATED_DIR,
    env,
    timeoutMs: Number(env.SUPABASE_RLS_TIMEOUT_MS) || 120_000,
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
  const hasPass = /RLS_RUNTIME_PASS/.test(out);
  const hasFail = /RLS_RUNTIME_FAILED/.test(out);

  if (timedOut) {
    base.blockers.push('RLS_QUERY_TIMEOUT');
    base.status = 'RLS_RUNTIME_FAILED';
  } else if (hasPass && exitOk && !hasFail) {
    base.status = 'RLS_RUNTIME_PASS';
  } else if (
    /schema_gap_tables_missing|appointments ausente|rode.*dry-run/i.test(out)
    || /precondition_appointments_exists\s*\|\s*f\b/i.test(out)
  ) {
    base.blockers.push('SCHEMA_NOT_APPLIED_RUN_LOCAL_DRY_RUN_FIRST');
    base.status = 'RLS_RUNTIME_BLOCKED';
  } else if (/connection refused|No such container|does not exist/i.test(out)) {
    base.blockers.push('LOCAL_DB_QUERY_FAILED');
    base.status = 'RLS_RUNTIME_BLOCKED';
  } else {
    base.blockers.push('RLS_ASSERTIONS_FAILED');
    base.status = 'RLS_RUNTIME_FAILED';
  }

  base.scenarios = out
    .split(/\r?\n/)
    .filter((l) =>
      /rls_|user_|orphan_|storage_|precondition_|known_contract|unauthenticated|policies_|no_policy/.test(l))
    .slice(0, 80);

  if (/known_contract_select_is_jwt_claim_scoped/.test(out)) {
    base.warnings.push(
      'SELECT policies are JWT-claim scoped (app_user_can_access_tenant), not tenant_users membership; mutations require admin membership',
    );
  }
  base.warnings.push(
    'CLI db query --file rejected multi-statement; execution uses docker exec + local psql (still remoteActionsExecuted=false)',
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
  const report = await runLocalRlsRuntimeValidation();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(`Phase 9.2C RLS runtime: ${report.status}`);
    console.log(`docker=${report.docker} cli=${report.cli}`);
    console.log(`isolation=${report.isolation} config=${report.config}`);
    console.log(`linkedRef=${report.linkedRef} preserved=${report.linkedMetadataPreserved}`);
    console.log(`remoteActionsExecuted=${report.remoteActionsExecuted}`);
    if (report.dbContainer) console.log(`dbContainer=${report.dbContainer}`);
    if (report.warnings?.length) console.log(`warnings: ${report.warnings.join(' | ')}`);
    if (report.blockers?.length) console.log(`blockers: ${report.blockers.join(', ')}`);
    console.log(`commandsExecuted=${report.commandsExecuted.length} durationMs=${report.durationMs}`);
  }
  if (report.status === 'RLS_RUNTIME_PASS') process.exit(0);
  if (report.status === 'RLS_RUNTIME_SKIPPED_OPT_IN' || report.status === 'RLS_RUNTIME_BLOCKED') {
    process.exit(2);
  }
  process.exit(1);
}
