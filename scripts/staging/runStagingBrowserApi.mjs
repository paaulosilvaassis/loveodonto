#!/usr/bin/env node
/**
 * PHASE_10.21X — Boot Admin API with `.env.staging.local` (fail-closed).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafe, PRODUCTION_REF } from './stagingBrowserGuard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENV_FILE = path.join(ROOT, '.env.staging.local');

function parseEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

function hardStop(reason) {
  console.error(`[staging-api] HARD STOP: ${reason}`);
  process.exit(2);
}

if (!fs.existsSync(ENV_FILE)) {
  hardStop('Missing .env.staging.local — run prepareStagingBrowserEnv.mjs first');
}

const fileEnv = parseEnvFile(ENV_FILE);
const guard = assertSafe({ ...fileEnv, LOVE_ODONTO_STAGING_TEST_MODE: '1' });
if (!guard.ok) hardStop(guard.blockedReason || 'guard failed');

for (const [k, v] of Object.entries(fileEnv)) {
  if (String(v).includes(PRODUCTION_REF)) hardStop(`production in ${k}`);
  process.env[k] = v;
}
process.env.LOVE_ODONTO_STAGING_TEST_MODE = '1';
process.env.CONTRACTS_V2_DELIVERY_MODE = 'disabled';

console.log(JSON.stringify({
  ok: true,
  service: 'saas-admin-api-staging',
  project: guard.projectRef,
  delivery: 'disabled',
}));

const child = spawn('npm', ['start'], {
  cwd: path.join(ROOT, 'server'),
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 1));
