/**
 * Phase 9.2A/E — runner seguro de dry-run local.
 *
 * Requer:
 *   RUN_SUPABASE_LOCAL_INTEGRATION=true
 *   LOVE_ODONTO_LOCAL_DB_CONFIRMATION=LOCAL_DISPOSABLE_ONLY
 *
 * Opcional para apply real:
 *   APPLY_LOCAL_DB_RESET=true
 *
 * Nunca: npx, link, db push, workdir supabase/ (usa supabase-local/).
 * Layout CLI 2.x: supabase-local/supabase/{config.toml,migrations/}
 *
 *   node scripts/supabase/runLocalMigrationDryRun.mjs
 *   node scripts/supabase/runLocalMigrationDryRun.mjs --preflight-only
 *   node scripts/supabase/runLocalMigrationDryRun.mjs --json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../phase92/processRunner.mjs';
import { REQUIRED_MIGRATIONS, runStaticPreflight } from '../phase92/staticPreflight.mjs';
import {
  ISOLATED_CLI_MIGRATIONS,
  ISOLATED_DIR,
  ISOLATED_MIGRATIONS,
  LINKED_PROJECT_PATH,
  LOCAL_PROJECT_ID,
  readLinkedProjectMeta,
} from './constants.mjs';
import {
  ensureIsolatedMigrationsLayout,
  evaluateIsolation,
  verifyIsolatedMigrationChecksums,
} from './isolation.mjs';
import { evaluateRemoteGuard, guardCommand } from './remoteGuard.mjs';
import { checkCli, checkDocker } from './toolchainPreflight.mjs';

const DEFAULT_DB_CONTAINER = 'supabase_db_supabase-local';

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

async function runGuarded(binary, args, env, commandsExecuted) {
  const gated = guardCommand(binary, args, env);
  if (gated.status !== 'SAFE_LOCAL_ENVIRONMENT') {
    commandsExecuted.push({
      blocked: true,
      ...gated,
      durationMs: 0,
    });
    return { blocked: true, gate: gated, result: null };
  }
  const result = await runProcess(binary, args, {
    cwd: ISOLATED_DIR,
    env,
    timeoutMs: Number(env.SUPABASE_LOCAL_CMD_TIMEOUT_MS) || 120_000,
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

/**
 * Phase 9.2E/H — PASS exige evidência real de schema aplicado.
 * Lê: contagem de tabelas public + existência/contagem de schema_migrations.
 */
async function inspectAppliedSchema(env, commandsExecuted) {
  const resolved = await resolveLocalDbContainer(env, commandsExecuted);
  if (!resolved.container) {
    return {
      status: 'SCHEMA_INSPECTION_FAILED',
      publicTableCount: 0,
      schemaMigrationsPresent: false,
      schemaMigrationsCount: 0,
      blocker: 'LOCAL_DB_CONTAINER_NOT_FOUND',
      container: null,
    };
  }

  const tableCountSql =
    "SELECT count(*)::text FROM pg_tables WHERE schemaname = 'public';";
  const historyPresentSql =
    "SELECT CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL "
    + "THEN '0' ELSE '1' END;";
  const historyCountSql =
    "SELECT CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL "
    + "THEN '0' ELSE (SELECT count(*)::text FROM supabase_migrations.schema_migrations) END;";

  const tableProbe = await runProcess(
    'docker',
    ['exec', resolved.container, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', tableCountSql],
    { cwd: ISOLATED_DIR, env, timeoutMs: 20_000 },
  );
  commandsExecuted.push({
    blocked: false,
    command: 'docker',
    argsSanitized: ['exec', resolved.container, 'psql', '-At', '-c', 'public_table_count'],
    exitCode: tableProbe.exitCode,
    timedOut: tableProbe.timedOut,
    durationMs: tableProbe.durationMs,
    stdoutSanitized: tableProbe.stdoutSanitized,
    stderrSanitized: tableProbe.stderrSanitized,
  });

  const historyProbe = await runProcess(
    'docker',
    ['exec', resolved.container, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', historyPresentSql],
    { cwd: ISOLATED_DIR, env, timeoutMs: 20_000 },
  );
  commandsExecuted.push({
    blocked: false,
    command: 'docker',
    argsSanitized: ['exec', resolved.container, 'psql', '-At', '-c', 'schema_migrations_present'],
    exitCode: historyProbe.exitCode,
    timedOut: historyProbe.timedOut,
    durationMs: historyProbe.durationMs,
    stdoutSanitized: historyProbe.stdoutSanitized,
    stderrSanitized: historyProbe.stderrSanitized,
  });

  const historyCountProbe = await runProcess(
    'docker',
    ['exec', resolved.container, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', historyCountSql],
    { cwd: ISOLATED_DIR, env, timeoutMs: 20_000 },
  );
  commandsExecuted.push({
    blocked: false,
    command: 'docker',
    argsSanitized: ['exec', resolved.container, 'psql', '-At', '-c', 'schema_migrations_count'],
    exitCode: historyCountProbe.exitCode,
    timedOut: historyCountProbe.timedOut,
    durationMs: historyCountProbe.durationMs,
    stdoutSanitized: historyCountProbe.stdoutSanitized,
    stderrSanitized: historyCountProbe.stderrSanitized,
  });

  const publicTableCount = Number.parseInt(String(tableProbe.stdoutSanitized || '').trim(), 10);
  const schemaMigrationsPresent = String(historyProbe.stdoutSanitized || '').trim() === '1';
  const schemaMigrationsCount = Number.parseInt(String(historyCountProbe.stdoutSanitized || '').trim(), 10);
  const tableOk = Number.isFinite(publicTableCount) && publicTableCount > 0
    && tableProbe.exitCode === 0 && !tableProbe.timedOut;
  const historyOk = schemaMigrationsPresent
    && Number.isFinite(schemaMigrationsCount) && schemaMigrationsCount > 0
    && historyProbe.exitCode === 0 && !historyProbe.timedOut;

  if (tableOk && historyOk) {
    return {
      status: 'SCHEMA_APPLIED_VERIFIED',
      publicTableCount,
      schemaMigrationsPresent: true,
      schemaMigrationsCount,
      container: resolved.container,
    };
  }

  return {
    status: 'SCHEMA_NOT_APPLIED',
    publicTableCount: Number.isFinite(publicTableCount) ? publicTableCount : 0,
    schemaMigrationsPresent,
    schemaMigrationsCount: Number.isFinite(schemaMigrationsCount) ? schemaMigrationsCount : 0,
    blocker: !tableOk ? 'PUBLIC_TABLES_MISSING' : 'SCHEMA_MIGRATIONS_MISSING',
    container: resolved.container,
  };
}

/**
 * Remove stack local descartável anterior (project name mismatch / containers stale).
 * Somente containers locais supabase_* ; nunca remoto.
 */
async function disposeLocalSupabaseContainers(env, commandsExecuted) {
  const listed = await runProcess('docker', ['ps', '-a', '--format', '{{.ID}}\t{{.Names}}'], {
    cwd: ISOLATED_DIR,
    env,
    timeoutMs: 15_000,
  });
  commandsExecuted.push({
    blocked: false,
    command: 'docker',
    argsSanitized: ['ps', '-a', '--format', '{{.ID}}\\t{{.Names}}'],
    exitCode: listed.exitCode,
    timedOut: listed.timedOut,
    durationMs: listed.durationMs,
    stdoutSanitized: listed.stdoutSanitized,
    stderrSanitized: listed.stderrSanitized,
  });

  const ids = String(listed.stdoutSanitized || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, name = ''] = line.split('\t');
      return { id, name };
    })
    .filter(({ name }) => (
      name.includes('supabase_')
      || name.includes('love-odonto-local')
      || name.includes(LOCAL_PROJECT_ID)
    ))
    .map(({ id }) => id)
    .filter(Boolean);

  if (!ids.length) {
    return { disposed: 0 };
  }

  const stopped = await runProcess('docker', ['rm', '-f', ...ids], {
    cwd: ISOLATED_DIR,
    env,
    timeoutMs: 120_000,
  });
  commandsExecuted.push({
    blocked: false,
    command: 'docker',
    argsSanitized: ['rm', '-f', `(${ids.length} local containers)`],
    exitCode: stopped.exitCode,
    timedOut: stopped.timedOut,
    durationMs: stopped.durationMs,
    stdoutSanitized: stopped.stdoutSanitized,
    stderrSanitized: stopped.stderrSanitized,
  });
  return { disposed: ids.length, exitCode: stopped.exitCode };
}

function attachFailureDetail(base, step, result) {
  base.failure = {
    step,
    exitCode: result?.exitCode ?? null,
    timedOut: result?.timedOut ?? false,
    stdoutSanitized: result?.stdoutSanitized || '',
    stderrSanitized: result?.stderrSanitized || '',
  };
}

export async function runLocalMigrationDryRun(options = {}) {
  const env = options.env || process.env;
  const preflightOnly = options.preflightOnly === true
    || process.argv.includes('--preflight-only');
  const probeToolchain = options.probeToolchain !== false
    && (isTruthy(env.RUN_SUPABASE_LOCAL_INTEGRATION) || options.forceProbe === true);

  const started = Date.now();
  const commandsExecuted = [];
  const linkedBefore = readLinkedProjectMeta();

  const staticReport = runStaticPreflight({ env: {} });
  const isolation = evaluateIsolation(env);
  const guard = evaluateRemoteGuard(env);
  const layout = ensureIsolatedMigrationsLayout();

  const docker = await checkDocker({
    probe: probeToolchain && guard.optIn.status === 'OPT_IN_OK',
    env,
  });
  const cli = await checkCli({
    probe: probeToolchain && guard.optIn.status === 'OPT_IN_OK',
    env,
  });

  const base = {
    environment: {
      workdir: ISOLATED_DIR,
      strategy: isolation.strategy,
      linkedMetadataPath: LINKED_PROJECT_PATH,
      linkedRefBefore: linkedBefore.data?.ref || null,
      cliMigrationsDir: ISOLATED_CLI_MIGRATIONS,
      legacyMigrationsDir: ISOLATED_MIGRATIONS,
    },
    docker,
    cli,
    isolation,
    config: isolation.config,
    migrationLayout: layout,
    staticReport,
    guard,
    migrationApply: { status: 'NOT_ATTEMPTED' },
    schemaInspection: { status: 'NOT_ATTEMPTED' },
    rlsInspection: { status: 'NOT_ATTEMPTED' },
    resetReapply: { status: 'NOT_ATTEMPTED' },
    remoteActionsExecuted: false,
    commandsExecuted,
    blockers: [...guard.blockers],
    warnings: [],
    status: 'LOCAL_DRY_RUN_BLOCKED',
    durationMs: 0,
    linkedMetadataPreserved: true,
  };

  if (isolation.config.status !== 'CONFIG_LOCAL_OK') {
    base.blockers.push('CONFIG_NOT_LOCAL_OK');
  }
  if (!layout.bootstrapPresent) {
    base.blockers.push('BOOTSTRAP_TENANTS_MISSING');
  }
  if (!layout.configSynced && !fs.existsSync(path.join(ISOLATED_DIR, 'supabase', 'config.toml'))) {
    base.blockers.push('CLI_CONFIG_MISSING');
  }
  // Phase 9.2H — nunca iniciar CLI com espelho divergente.
  const checksum = layout.checksum || verifyIsolatedMigrationChecksums();
  base.migrationChecksum = checksum;
  if (checksum.status !== 'ISOLATED_MIGRATION_CHECKSUM_OK') {
    base.blockers.push('ISOLATED_MIGRATION_CHECKSUM_MISMATCH');
  }
  if (layout.errors.length) {
    base.warnings.push(`migration_link_errors=${layout.errors.length}`);
  }
  if (staticReport.status !== 'STATIC_PREFLIGHT_PASS') {
    base.blockers.push('STATIC_PREFLIGHT_FAILED');
  }

  // Required migrations must be visible to the CLI path (and legacy for compat).
  for (const name of REQUIRED_MIGRATIONS) {
    const onCli = fs.existsSync(path.join(ISOLATED_CLI_MIGRATIONS, name));
    const onLegacy = fs.existsSync(path.join(ISOLATED_MIGRATIONS, name));
    if (!onCli) {
      base.blockers.push(`MISSING_CLI_MIGRATION_${name}`);
    }
    if (!onLegacy) {
      base.warnings.push(`missing_legacy_migration_${name}`);
    }
  }

  if (guard.optIn.status !== 'OPT_IN_OK') {
    base.status = 'LOCAL_INTEGRATION_SKIPPED';
    base.durationMs = Date.now() - started;
    return base;
  }

  const dockerOk = docker.status === 'DOCKER_AVAILABLE_AND_RUNNING'
    || docker.status === 'DOCKER_AVAILABLE';
  if (!dockerOk) {
    base.blockers.push(docker.status);
  }
  if (cli.status !== 'CLI_AVAILABLE') {
    base.blockers.push(cli.status);
  }

  if (preflightOnly || base.blockers.length > 0) {
    base.status = 'LOCAL_DRY_RUN_BLOCKED';
    base.durationMs = Date.now() - started;
    const linkedAfter = readLinkedProjectMeta();
    base.linkedMetadataPreserved = linkedBefore.present === linkedAfter.present
      && linkedBefore.data?.ref === linkedAfter.data?.ref;
    return base;
  }

  // Nível 3 obrigatório para start/reset (Phase 9.2B: permanece não autorizado até aprovação humana)
  if (!isTruthy(env.APPLY_LOCAL_DB_RESET)) {
    base.blockers.push('APPLY_LOCAL_DB_RESET_REQUIRED');
    base.status = 'LOCAL_DRY_RUN_BLOCKED';
    base.warnings.push(
      'Dry-run apply requires ALL three opt-ins. Phase 9.2B forbids setting APPLY_LOCAL_DB_RESET.',
    );
    base.durationMs = Date.now() - started;
    return base;
  }

  const binary = cli.binary;

  const version = await runGuarded(binary, ['--version'], env, commandsExecuted);
  if (version.blocked || version.result?.exitCode !== 0) {
    base.status = 'LOCAL_DRY_RUN_FAILED';
    base.migrationApply = { status: 'FAILED', step: 'version' };
    attachFailureDetail(base, 'version', version.result);
    base.durationMs = Date.now() - started;
    return base;
  }

  // Phase 9.2H — descarta stack local antigo (nome supabase-local vs project_id).
  await disposeLocalSupabaseContainers(env, commandsExecuted);

  // Re-sync imediatamente antes do start (evita race / cópia stale).
  const layoutBeforeStart = ensureIsolatedMigrationsLayout();
  base.migrationLayout = layoutBeforeStart;
  base.migrationChecksum = layoutBeforeStart.checksum;
  if (layoutBeforeStart.checksum?.status !== 'ISOLATED_MIGRATION_CHECKSUM_OK') {
    base.blockers.push('ISOLATED_MIGRATION_CHECKSUM_MISMATCH');
    base.status = 'LOCAL_DRY_RUN_BLOCKED';
    base.durationMs = Date.now() - started;
    return base;
  }

  const start = await runGuarded(binary, ['start'], env, commandsExecuted);
  if (start.blocked || start.result?.timedOut || start.result?.exitCode !== 0) {
    base.status = 'LOCAL_DRY_RUN_FAILED';
    base.migrationApply = { status: 'FAILED', step: 'start' };
    attachFailureDetail(base, 'start', start.result);
    base.durationMs = Date.now() - started;
    return base;
  }

  const reset = await runGuarded(binary, ['db', 'reset', '--yes'], env, commandsExecuted);
  if (reset.blocked || reset.result?.timedOut || reset.result?.exitCode !== 0) {
    base.status = 'LOCAL_DRY_RUN_FAILED';
    base.migrationApply = { status: 'FAILED', step: 'db_reset', result: reset.result };
    attachFailureDetail(base, 'db_reset', reset.result);
    base.durationMs = Date.now() - started;
    return base;
  }

  base.migrationApply = { status: 'APPLIED_VIA_DB_RESET', tablesExpected: REQUIRED_MIGRATIONS };
  base.resetReapply = { status: 'FIRST_RESET_OK' };

  // Second reset for reapply proof
  const reset2 = await runGuarded(binary, ['db', 'reset', '--yes'], env, commandsExecuted);
  base.resetReapply = {
    status: !reset2.blocked && reset2.result?.exitCode === 0 ? 'RESET_REAPPLY_OK' : 'RESET_REAPPLY_FAILED',
    second: reset2.result,
  };

  if (base.resetReapply.status !== 'RESET_REAPPLY_OK') {
    base.status = 'LOCAL_DRY_RUN_FAILED';
    attachFailureDetail(base, 'db_reset_reapply', reset2.result);
    base.durationMs = Date.now() - started;
    return base;
  }

  // Phase 9.2E — do not declare PASS without schema evidence.
  const schema = await inspectAppliedSchema(env, commandsExecuted);
  base.schemaInspection = schema;
  if (schema.status !== 'SCHEMA_APPLIED_VERIFIED') {
    base.status = 'LOCAL_DRY_RUN_FAILED';
    base.blockers.push(schema.blocker || 'SCHEMA_NOT_APPLIED');
    base.warnings.push('FALSE_POSITIVE_EXIT_CODE_GUARD: db reset exit 0 is insufficient without schema evidence');
    base.rlsInspection = {
      status: 'BLOCKED_SCHEMA_NOT_APPLIED',
      note: 'Fix CLI migration layout / re-run dry-run before supabase:local:rls-runtime',
      command: 'supabase:local:rls-runtime',
    };
    if (isTruthy(env.SUPABASE_LOCAL_STOP_AFTER)) {
      await runGuarded(binary, ['stop'], env, commandsExecuted);
    }
    const linkedAfterFail = readLinkedProjectMeta();
    base.linkedMetadataPreserved = linkedBefore.present === linkedAfterFail.present
      && linkedBefore.data?.ref === linkedAfterFail.data?.ref;
    base.remoteActionsExecuted = false;
    base.durationMs = Date.now() - started;
    return base;
  }

  if (isTruthy(env.SUPABASE_LOCAL_STOP_AFTER)) {
    await runGuarded(binary, ['stop'], env, commandsExecuted);
  }

  const linkedAfter = readLinkedProjectMeta();
  base.linkedMetadataPreserved = linkedBefore.present === linkedAfter.present
    && linkedBefore.data?.ref === linkedAfter.data?.ref;
  base.remoteActionsExecuted = false;
  base.rlsInspection = {
    status: 'DEFERRED_TO_9_2C',
    note: 'Use npm run supabase:local:rls-runtime after local migrations are applied',
    command: 'supabase:local:rls-runtime',
  };
  base.status = 'LOCAL_DRY_RUN_PASS';
  base.warnings.push('RLS_RUNTIME_USE_SEPARATE_COMMAND');
  base.durationMs = Date.now() - started;
  return base;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const report = await runLocalMigrationDryRun({
    preflightOnly: process.argv.includes('--preflight-only'),
  });
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(`Phase 9.2A dry-run: ${report.status}`);
    console.log(`docker=${report.docker.status} cli=${report.cli.status}`);
    console.log(`isolation=${report.isolation.status} config=${report.config.status}`);
    console.log(`linkedRef=${report.environment.linkedRefBefore} preserved=${report.linkedMetadataPreserved}`);
    console.log(`remoteActionsExecuted=${report.remoteActionsExecuted}`);
    if (report.schemaInspection?.status) {
      console.log(
        `schema=${report.schemaInspection.status}`
        + ` publicTables=${report.schemaInspection.publicTableCount ?? 'n/a'}`
        + ` schemaMigrations=${report.schemaInspection.schemaMigrationsCount
          ?? report.schemaInspection.schemaMigrationsPresent
          ?? 'n/a'}`,
      );
    }
    if (report.migrationChecksum?.status) {
      console.log(`migrationChecksum=${report.migrationChecksum.status}`
        + ` canonical=${report.migrationChecksum.canonicalCount ?? 'n/a'}`
        + ` cli=${report.migrationChecksum.cliCount ?? 'n/a'}`);
    }
    if (report.blockers.length) console.log(`blockers: ${report.blockers.join(', ')}`);
    if (report.warnings.length) console.log(`warnings: ${report.warnings.join(', ')}`);
    if (report.failure) {
      console.log(`failureStep=${report.failure.step} exitCode=${report.failure.exitCode} timedOut=${report.failure.timedOut}`);
      if (report.failure.stderrSanitized) {
        console.log('--- stderr ---');
        console.log(report.failure.stderrSanitized);
      }
      if (report.failure.stdoutSanitized) {
        console.log('--- stdout ---');
        console.log(report.failure.stdoutSanitized);
      }
    }
    console.log(`commandsExecuted=${report.commandsExecuted.length} durationMs=${report.durationMs}`);
  }
  const ok = report.status === 'LOCAL_DRY_RUN_PASS'
    || report.status === 'LOCAL_DRY_RUN_PASS_WITH_WARNINGS';
  // preflight-only / blocked are exit 2; failed exit 1; skipped exit 3
  if (ok) process.exit(0);
  if (report.status === 'LOCAL_INTEGRATION_SKIPPED') process.exit(3);
  if (report.status === 'LOCAL_DRY_RUN_BLOCKED') process.exit(2);
  process.exit(1);
}
