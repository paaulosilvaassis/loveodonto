/**
 * Phase 9.2 — Camada 3: gate + runner de integração local (opt-in estrito).
 * Nunca usa npx. Nunca aplica em projeto linkado/remoto.
 */
import fs from 'node:fs';
import { checkSupabaseCliAvailability, INTEGRATION_OPT_IN_ENV } from './cliAvailability.mjs';
import { runProcess } from './processRunner.mjs';
import { ISOLATED_DIR } from '../supabase/constants.mjs';
import { ensureIsolatedMigrationsLayout } from '../supabase/isolation.mjs';
import {
  FORBIDDEN_ENV_KEYS,
  LINKED_PATH,
  PROD_REF,
  runStaticPreflight,
} from './staticPreflight.mjs';

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

export function readLinkedProject() {
  if (!fs.existsSync(LINKED_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(LINKED_PATH, 'utf8'));
  } catch {
    return { ref: 'unreadable' };
  }
}

/**
 * Gate puro (sem spawn) — seguro para testes unitários.
 */
export function evaluateLocalIntegrationGate(env = process.env) {
  const optIn = isTruthy(env[INTEGRATION_OPT_IN_ENV]);
  const linked = readLinkedProject();
  const remoteEnv = FORBIDDEN_ENV_KEYS.filter((k) => env[k] && String(env[k]).trim());
  const argvHasProd = process.argv.join(' ').includes(PROD_REF);
  const blockers = [];

  if (!optIn) blockers.push('OPT_IN_REQUIRED');
  if (linked) blockers.push('REMOTE_PROJECT_LINKED');
  if (remoteEnv.length) blockers.push('REMOTE_DATABASE_URL_PRESENT');
  if (argvHasProd) blockers.push('PRODUCTION_REFERENCE_PRESENT');

  return {
    layer: 'LOCAL_DATABASE_GATE',
    optIn,
    remoteProjectLinked: Boolean(linked),
    linkedProjectRef: linked?.ref || null,
    remoteDatabaseUrlPresent: remoteEnv.length > 0,
    productionReferencePresent: argvHasProd,
    blockers,
    status: blockers.length === 0 ? 'GATE_OPEN' : 'BLOCKED_NON_LOCAL_ENVIRONMENT',
    allowedCommands: blockers.length === 0
      ? ['supabase --version', 'supabase status', 'supabase db reset']
      : [],
  };
}

/**
 * Executa dry-run local somente se gate + CLI ok.
 * Default: não chama db reset automaticamente sem APPLY_LOCAL_DB_RESET=true.
 */
export async function runLocalIntegration(options = {}) {
  const env = options.env || process.env;
  const staticReport = runStaticPreflight({ env });
  const gate = evaluateLocalIntegrationGate(env);

  if (gate.status !== 'GATE_OPEN') {
    return {
      layer: 'LOCAL_DATABASE_INTEGRATION',
      status: 'BLOCKED_NON_LOCAL_ENVIRONMENT',
      staticReport,
      gate,
      cli: { status: 'CLI_CHECK_SKIPPED', reason: 'gate_blocked' },
      steps: [],
      migrationsExecuted: false,
      usedNpx: false,
    };
  }

  if (staticReport.status !== 'STATIC_PREFLIGHT_PASS') {
    return {
      layer: 'LOCAL_DATABASE_INTEGRATION',
      status: 'BLOCKED_STATIC_PREFLIGHT_FAILED',
      staticReport,
      gate,
      cli: { status: 'CLI_CHECK_SKIPPED', reason: 'static_failed' },
      steps: [],
      migrationsExecuted: false,
      usedNpx: false,
    };
  }

  const cli = await checkSupabaseCliAvailability({ env, probe: true });
  if (cli.status !== 'CLI_AVAILABLE') {
    return {
      layer: 'LOCAL_DATABASE_INTEGRATION',
      status: 'LOCAL_DATABASE_DRY_RUN_BLOCKED',
      reason: 'CLI_NOT_AVAILABLE',
      staticReport,
      gate,
      cli,
      steps: [],
      migrationsExecuted: false,
      usedNpx: false,
    };
  }

  // Prefer the isolated Phase 9.2A/E runner path (supabase-local/) over repo root.
  const layout = ensureIsolatedMigrationsLayout();
  const workdir = ISOLATED_DIR;
  const steps = [{ name: 'ensure_isolated_layout', layout }];
  const version = await runProcess(cli.binary, ['--version'], {
    cwd: workdir,
    env,
    timeoutMs: 5000,
  });
  steps.push({ name: 'supabase_version', ...version });

  const statusCmd = await runProcess(cli.binary, ['status'], {
    cwd: workdir,
    env,
    timeoutMs: Number(env.SUPABASE_STATUS_TIMEOUT_MS) || 20_000,
  });
  steps.push({ name: 'supabase_status', ...statusCmd });

  const allowReset = isTruthy(env.APPLY_LOCAL_DB_RESET);
  if (!allowReset) {
    return {
      layer: 'LOCAL_DATABASE_INTEGRATION',
      status: 'LOCAL_DATABASE_DRY_RUN_BLOCKED',
      reason: 'APPLY_LOCAL_DB_RESET_NOT_SET',
      detail: 'CLI detected and status probed; set APPLY_LOCAL_DB_RESET=true to run db reset on disposable local stack',
      staticReport,
      gate,
      cli,
      workdir,
      layout,
      steps,
      migrationsExecuted: false,
      usedNpx: false,
    };
  }

  if (statusCmd.timedOut || statusCmd.exitCode !== 0) {
    return {
      layer: 'LOCAL_DATABASE_INTEGRATION',
      status: 'LOCAL_DATABASE_DRY_RUN_BLOCKED',
      reason: 'LOCAL_STACK_NOT_RUNNING',
      staticReport,
      gate,
      cli,
      workdir,
      layout,
      steps,
      migrationsExecuted: false,
      usedNpx: false,
    };
  }

  const reset = await runProcess(cli.binary, ['db', 'reset', '--local', '--yes'], {
    cwd: workdir,
    env,
    timeoutMs: Number(env.SUPABASE_DB_RESET_TIMEOUT_MS) || 180_000,
  });
  steps.push({ name: 'supabase_db_reset_local', ...reset });

  // Exit code alone is insufficient (Phase 9.2E). Prefer npm run supabase:local:dry-run
  // which verifies public tables + schema_migrations before PASS.
  const ok = !reset.timedOut && reset.exitCode === 0;
  return {
    layer: 'LOCAL_DATABASE_INTEGRATION',
    status: ok ? 'LOCAL_DRY_RUN_PASS_UNVERIFIED_SCHEMA' : 'FAILED',
    note: ok
      ? 'Use scripts/supabase/runLocalMigrationDryRun.mjs for SCHEMA_APPLIED_VERIFIED before treating as PASS'
      : undefined,
    staticReport,
    gate,
    cli,
    workdir,
    layout,
    steps,
    migrationsExecuted: ok,
    usedNpx: false,
  };
}
