/**
 * Phase 9.2B — evaluateLocalSupabaseDryRunReadiness()
 * Nunca inicia Docker/Supabase, nunca reset/apply.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REQUIRED_MIGRATIONS, runStaticPreflight } from '../phase92/staticPreflight.mjs';
import {
  APP_MIGRATIONS,
  FORBIDDEN_ENV_KEYS,
  LOCAL_PROJECT_ID,
  PRODUCTION_REF,
  REPO_ROOT,
  STAGING_REF,
  auditRemoteLinkArtifacts,
} from './constants.mjs';
import { evaluateIsolation } from './isolation.mjs';
import { evaluateOptInContract } from './optInContract.mjs';
import { evaluateRemoteGuard, guardCommand } from './remoteGuard.mjs';
import { checkCli, checkDocker } from './toolchainPreflight.mjs';

function packageScriptsOk(repoRoot) {
  const pkgPath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return { ok: false, evidence: 'package.json missing' };
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const scripts = pkg.scripts || {};
  const required = [
    'supabase:local:toolchain-check',
    'supabase:local:preflight',
    'supabase:local:dry-run',
    'supabase:local:rls-runtime',
    'test:supabase:static',
    'test:supabase:local',
    'test:supabase:phase92c',
  ];
  const missing = required.filter((k) => !scripts[k]);
  const joined = JSON.stringify(scripts);
  const hasNpx = /npx\s+supabase/.test(joined);
  const hasRemoteRef = joined.includes(STAGING_REF) || joined.includes(PRODUCTION_REF);
  return {
    ok: missing.length === 0 && !hasNpx && !hasRemoteRef,
    missing,
    hasNpx,
    hasRemoteRef,
    testIsVitestOnly: scripts.test === 'vitest run',
  };
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, probeToolchain?: boolean }} [options]
 */
export async function evaluateLocalSupabaseDryRunReadiness(options = {}) {
  const env = options.env || process.env;
  const probeToolchain = options.probeToolchain === true;

  const staticReport = runStaticPreflight({ env: {} });
  const isolation = evaluateIsolation(env);
  const audit = auditRemoteLinkArtifacts();
  const optIn = evaluateOptInContract(env);
  const guard = evaluateRemoteGuard(env);
  const docker = await checkDocker({ probe: probeToolchain, env });
  const cli = await checkCli({ probe: probeToolchain, env });

  const remoteEnv = FORBIDDEN_ENV_KEYS.filter((k) => env[k] && String(env[k]).trim());
  const migrationsPresent = REQUIRED_MIGRATIONS.every((f) =>
    fs.existsSync(path.join(APP_MIGRATIONS, f)));
  const scripts = packageScriptsOk(REPO_ROOT);

  // Guard para toolchain validation (sem exigir opt-in 1/2 no env)
  const allowVersion = guardCommand('supabase', ['--version'], {});
  const denyPush = guardCommand('supabase', ['db', 'push'], {});
  const guardToolchainOk = allowVersion.status === 'SAFE_LOCAL_ENVIRONMENT'
    && denyPush.status === 'BLOCKED_REMOTE_COMMAND'
    && remoteEnv.length === 0;

  const checks = {
    dockerInstalledRunning: docker.status === 'DOCKER_AVAILABLE_AND_RUNNING',
    dockerInstalledNotRunning: docker.status === 'DOCKER_INSTALLED_NOT_RUNNING',
    dockerMissing: ['DOCKER_NOT_INSTALLED', 'DOCKER_NOT_AVAILABLE'].includes(docker.status),
    cliAvailable: cli.status === 'CLI_AVAILABLE',
    configLocalOk: isolation.config.status === 'CONFIG_LOCAL_OK'
      && isolation.config.projectId === LOCAL_PROJECT_ID,
    metadataPreserved: audit.linkedPreserved === true,
    isolationReady: isolation.status === 'ISOLATION_READY',
    noRemoteEnv: remoteEnv.length === 0,
    guardToolchainOk,
    scriptsOk: scripts.ok,
    optInContractPrepared: optIn.contractPrepared,
    level3NotAuthorized: !optIn.level3Authorized,
    migrations020_023: migrationsPresent,
    staticPreflightPass: staticReport.status === 'STATIC_PREFLIGHT_PASS',
  };

  let status = 'READY_AWAITING_LOCAL_RESET_AUTHORIZATION';
  const blockers = [];

  if (probeToolchain) {
    if (docker.status === 'DOCKER_NOT_INSTALLED' || docker.status === 'DOCKER_NOT_AVAILABLE') {
      status = 'BLOCKED_MISSING_DOCKER';
      blockers.push(docker.status);
    } else if (docker.status === 'DOCKER_INSTALLED_NOT_RUNNING') {
      status = 'BLOCKED_DOCKER_NOT_RUNNING';
      blockers.push(docker.status);
    } else if (docker.status === 'DOCKER_PERMISSION_BLOCKED' || docker.status === 'DOCKER_TIMEOUT') {
      status = 'BLOCKED_MISSING_DOCKER';
      blockers.push(docker.status);
    } else if (docker.status === 'DOCKER_CHECK_SKIPPED') {
      status = 'BLOCKED_MISSING_DOCKER';
      blockers.push('DOCKER_CHECK_SKIPPED');
    }

    if (cli.status !== 'CLI_AVAILABLE') {
      if (status === 'READY_AWAITING_LOCAL_RESET_AUTHORIZATION') {
        status = 'BLOCKED_MISSING_CLI';
      }
      blockers.push(cli.status);
    }
  } else {
    // Without probe, cannot claim ready
    status = 'BLOCKED_MISSING_DOCKER';
    blockers.push('TOOLCHAIN_NOT_PROBED');
  }

  if (!checks.configLocalOk) {
    status = 'BLOCKED_INVALID_LOCAL_CONFIG';
    blockers.push(isolation.config.status || 'CONFIG_INVALID');
  }
  if (remoteEnv.length) {
    status = 'BLOCKED_REMOTE_ENVIRONMENT_REFERENCE';
    blockers.push(...remoteEnv.map((k) => `env:${k}`));
  }
  if (isTruthyForceDefault(env) && audit.linkedPresent) {
    status = 'BLOCKED_REMOTE_LINK_RISK';
    blockers.push('FORCE_APP_SUPABASE_WORKDIR_WITH_LINK');
  }
  if (optIn.level3Authorized) {
    // Em 9.2B reportamos warning — não liberamos execução aqui
    blockers.push('LEVEL3_PRESENT_BUT_PHASE_FORBIDS_EXECUTION');
  }
  if (!checks.migrations020_023) blockers.push('MIGRATIONS_020_023_MISSING');
  if (!checks.staticPreflightPass) blockers.push('STATIC_PREFLIGHT_FAILED');
  if (!scripts.ok) blockers.push('PACKAGE_SCRIPTS_INCOMPLETE');

  // Ready only if no blocking toolchain/config issues and level3 absent
  const ready = probeToolchain
    && docker.status === 'DOCKER_AVAILABLE_AND_RUNNING'
    && cli.status === 'CLI_AVAILABLE'
    && checks.configLocalOk
    && checks.noRemoteEnv
    && checks.guardToolchainOk
    && checks.isolationReady
    && checks.migrations020_023
    && checks.staticPreflightPass
    && checks.scriptsOk
    && !optIn.level3Authorized;

  if (ready) {
    status = 'READY_AWAITING_LOCAL_RESET_AUTHORIZATION';
  }

  return {
    phase: '9.2B',
    status: ready ? 'READY_AWAITING_LOCAL_RESET_AUTHORIZATION' : status,
    configVerification: cli.status === 'CLI_AVAILABLE'
      ? 'VERIFIED_AGAINST_CLI'
      : 'TEMPLATE_UNVERIFIED',
    checks,
    docker,
    cli,
    isolation,
    audit,
    optIn,
    guard: {
      status: guardToolchainOk ? 'SAFE_FOR_LOCAL_TOOLCHAIN_VALIDATION' : guard.status,
      remoteEnv,
      allowVersion: allowVersion.status,
      denyPush: denyPush.status,
    },
    scripts,
    staticReport: { status: staticReport.status },
    blockers: [...new Set(blockers)],
    warnings: [
      ...(audit.linkedPresent
        ? [`linked_metadata_present_ref=${audit.linkedRef} — dry-run must use supabase-local only`]
        : []),
      ...(isolation.config.present && isolation.config.status !== 'CONFIG_LOCAL_OK'
        ? ['config_template_or_invalid']
        : []),
      ...(!probeToolchain ? ['toolchain_probe_skipped'] : []),
    ],
    neverStates: {
      LOCAL_DRY_RUN_PASS: false,
      MIGRATIONS_APPLIED: false,
      RLS_VALIDATED: false,
      READY_FOR_PHASE_9_3: false,
    },
    actionsForbiddenInThisPhase: [
      'supabase start',
      'supabase db reset',
      'migration apply',
      'RLS runtime tests',
    ],
    remoteActionsExecuted: false,
    migrationsExecuted: false,
    resetExecuted: false,
  };
}

function isTruthyForceDefault(env) {
  return ['1', 'true', 'yes', 'on'].includes(String(env.FORCE_APP_SUPABASE_WORKDIR || '').toLowerCase());
}
