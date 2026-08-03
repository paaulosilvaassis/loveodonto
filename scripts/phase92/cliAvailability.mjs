/**
 * Phase 9.2 — Camada 2: CLI availability (opt-in, sem npx, sem download).
 */
import fs from 'node:fs';
import path from 'node:path';
import { runProcess } from './processRunner.mjs';
import { REPO_ROOT } from './staticPreflight.mjs';

export const CLI_OPT_IN_ENV = 'ENABLE_SUPABASE_CLI_CHECK';
export const INTEGRATION_OPT_IN_ENV = 'RUN_SUPABASE_LOCAL_INTEGRATION';

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

export function resolveSupabaseBinary(env = process.env) {
  const explicit = String(env.SUPABASE_CLI_PATH || '').trim();
  if (explicit && fs.existsSync(explicit)) {
    return { binary: explicit, source: 'SUPABASE_CLI_PATH' };
  }

  const localBin = process.platform === 'win32'
    ? path.join(REPO_ROOT, 'node_modules', '.bin', 'supabase.cmd')
    : path.join(REPO_ROOT, 'node_modules', '.bin', 'supabase');
  if (fs.existsSync(localBin)) {
    return { binary: localBin, source: 'node_modules/.bin' };
  }

  // PATH candidate — existence unknown until probed under opt-in.
  return { binary: 'supabase', source: 'PATH_CANDIDATE' };
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, probe?: boolean }} [options]
 * When probe=false or opt-in off: no process spawn.
 */
export async function checkSupabaseCliAvailability(options = {}) {
  const env = options.env || process.env;
  const optIn = isTruthy(env[CLI_OPT_IN_ENV]) || isTruthy(env[INTEGRATION_OPT_IN_ENV]);

  if (!optIn) {
    return {
      layer: 'CLI_AVAILABILITY',
      status: 'CLI_CHECK_SKIPPED',
      optIn: false,
      usedNpx: false,
      binary: null,
      source: null,
      probe: null,
    };
  }

  // Opt-in sozinho não spawna — exige probe:true explícito (integration runner).
  if (options.probe !== true) {
    return {
      layer: 'CLI_AVAILABILITY',
      status: 'CLI_CHECK_SKIPPED',
      optIn: true,
      usedNpx: false,
      binary: null,
      source: null,
      probe: null,
      detail: 'opt-in set but probe!==true',
    };
  }

  const resolved = resolveSupabaseBinary(env);
  const probe = await runProcess(resolved.binary, ['--version'], {
    timeoutMs: Number(env.SUPABASE_CLI_TIMEOUT_MS) || 5000,
    cwd: REPO_ROOT,
    env,
  });

  const available = !probe.timedOut && probe.exitCode === 0;
  return {
    layer: 'CLI_AVAILABILITY',
    status: available ? 'CLI_AVAILABLE' : 'CLI_NOT_AVAILABLE',
    optIn: true,
    usedNpx: false,
    binary: resolved.binary,
    source: resolved.source,
    probe,
  };
}
