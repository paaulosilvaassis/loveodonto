/**
 * Phase 9.2B — Docker / CLI preflight com classificações oficiais.
 * Sem install, sem npx, sem start/reset.
 */
import fs from 'node:fs';
import path from 'node:path';
import { runProcess } from '../phase92/processRunner.mjs';
import { REPO_ROOT } from './constants.mjs';

function resolveSupabaseBinary(env = process.env) {
  const explicit = String(env.SUPABASE_CLI_PATH || '').trim();
  if (explicit && fs.existsSync(explicit)) {
    return { binary: explicit, source: 'SUPABASE_CLI_PATH' };
  }
  const local = process.platform === 'win32'
    ? path.join(REPO_ROOT, 'node_modules', '.bin', 'supabase.cmd')
    : path.join(REPO_ROOT, 'node_modules', '.bin', 'supabase');
  if (fs.existsSync(local)) {
    return { binary: local, source: 'node_modules/.bin' };
  }
  return { binary: 'supabase', source: 'PATH_CANDIDATE' };
}

function classifySpawnFailure(result, kind) {
  const msg = `${result?.stderrSanitized || ''} ${result?.stdoutSanitized || ''}`.toLowerCase();
  if (result?.timedOut) {
    return kind === 'docker' ? 'DOCKER_TIMEOUT' : 'CLI_TIMEOUT';
  }
  if (/eacces|access is denied|permission denied|privileg/.test(msg)) {
    return kind === 'docker' ? 'DOCKER_PERMISSION_BLOCKED' : 'CLI_PERMISSION_BLOCKED';
  }
  if (result?.exitCode === null && /enoent/.test(msg)) {
    return kind === 'docker' ? 'DOCKER_NOT_INSTALLED' : 'CLI_NOT_INSTALLED';
  }
  if (kind === 'cli' && /enoent/.test(msg)) return 'CLI_NOT_INSTALLED';
  if (kind === 'docker') return 'DOCKER_NOT_INSTALLED';
  return 'CLI_INVALID';
}

export async function checkDocker(options = {}) {
  if (options.probe !== true) {
    return { status: 'DOCKER_CHECK_SKIPPED', probe: null, usedNpx: false };
  }
  const version = await runProcess('docker', ['--version'], {
    timeoutMs: Number(options.timeoutMs) || 2500,
    cwd: REPO_ROOT,
    env: options.env || process.env,
  });
  if (version.timedOut) {
    return { status: 'DOCKER_TIMEOUT', probe: version, usedNpx: false };
  }
  if (version.exitCode !== 0) {
    return {
      status: classifySpawnFailure(version, 'docker'),
      probe: version,
      usedNpx: false,
    };
  }
  const info = await runProcess('docker', ['info'], {
    timeoutMs: Number(options.timeoutMs) || 4000,
    cwd: REPO_ROOT,
    env: options.env || process.env,
  });
  if (info.timedOut) {
    return { status: 'DOCKER_TIMEOUT', reason: 'info_timeout', probe: { version, info }, usedNpx: false };
  }
  if (info.exitCode !== 0) {
    const msg = `${info.stderrSanitized || ''}`.toLowerCase();
    if (/eacces|permission|denied|privileg/.test(msg)) {
      return {
        status: 'DOCKER_PERMISSION_BLOCKED',
        probe: { version, info },
        usedNpx: false,
      };
    }
    return {
      status: 'DOCKER_INSTALLED_NOT_RUNNING',
      probe: { version, info },
      usedNpx: false,
      versionSanitized: version.stdoutSanitized,
    };
  }
  return {
    status: 'DOCKER_AVAILABLE_AND_RUNNING',
    probe: { version, info },
    usedNpx: false,
    versionSanitized: version.stdoutSanitized,
  };
}

export async function checkCli(options = {}) {
  if (options.probe !== true) {
    return { status: 'CLI_CHECK_SKIPPED', probe: null, usedNpx: false, binary: null };
  }
  const resolved = resolveSupabaseBinary(options.env || process.env);
  const probe = await runProcess(resolved.binary, ['--version'], {
    timeoutMs: Number(options.timeoutMs) || 4000,
    cwd: REPO_ROOT,
    env: options.env || process.env,
  });
  if (probe.timedOut) {
    return { status: 'CLI_TIMEOUT', ...resolved, probe, usedNpx: false };
  }
  if (probe.exitCode !== 0) {
    return {
      status: classifySpawnFailure(probe, 'cli'),
      ...resolved,
      probe,
      usedNpx: false,
    };
  }
  return {
    status: 'CLI_AVAILABLE',
    ...resolved,
    probe,
    usedNpx: false,
    versionSanitized: probe.stdoutSanitized,
  };
}

export { resolveSupabaseBinary };
