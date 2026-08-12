#!/usr/bin/env node
/**
 * PHASE_10.21X — Boot Vite app in isolated staging mode (fail-closed).
 * Loads `.env.staging.local` and runs `vite --mode staging`.
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
  console.error(`[staging-browser] HARD STOP: ${reason}`);
  process.exit(2);
}

if (!fs.existsSync(ENV_FILE)) {
  hardStop('Missing .env.staging.local — run: node scripts/staging/prepareStagingBrowserEnv.mjs');
}

const fileEnv = parseEnvFile(ENV_FILE);
const guard = assertSafe({ ...fileEnv, VITE_STAGING_TEST_MODE: 'true' });
if (!guard.ok) hardStop(guard.blockedReason || 'staging guard failed');

for (const [k, v] of Object.entries(fileEnv)) {
  if (String(v).includes(PRODUCTION_REF)) {
    hardStop(`Production ref found in .env.staging.local key ${k}`);
  }
  process.env[k] = v;
}

process.env.VITE_STAGING_TEST_MODE = 'true';
process.env.LOVE_ODONTO_STAGING_TEST_MODE = '1';
process.env.STAGING_TEST_MODE = '1';

console.log(JSON.stringify({
  ok: true,
  mode: 'staging',
  project: guard.projectRef,
  api: process.env.VITE_PLATFORM_API_BASE_URL || 'http://127.0.0.1:3001',
  delivery: process.env.CONTRACTS_V2_DELIVERY_MODE,
}));

const child = spawn('npx', ['vite', '--mode', 'staging'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 1));
