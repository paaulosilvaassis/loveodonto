#!/usr/bin/env node
/**
 * Launch staging API or Vite for 10.21Y without killing production ports.
 * Usage:
 *   node scripts/staging/launchStagingIsolated.mjs api
 *   node scripts/staging/launchStagingIsolated.mjs browser
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafe, PRODUCTION_REF } from './stagingBrowserGuard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mode = String(process.argv[2] || '').trim();
const ENV_FILE = path.join(ROOT, '.env.staging.local');

function parseEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/\r/g, '');
  }
  return env;
}

if (!['api', 'browser'].includes(mode)) {
  console.error('usage: launchStagingIsolated.mjs api|browser');
  process.exit(2);
}
if (!fs.existsSync(ENV_FILE)) {
  console.error('missing .env.staging.local');
  process.exit(2);
}

const fileEnv = parseEnvFile(ENV_FILE);
const guard = assertSafe({ ...fileEnv, LOVE_ODONTO_STAGING_TEST_MODE: '1', VITE_STAGING_TEST_MODE: 'true' });
if (!guard.ok) {
  console.error('HARD STOP', guard.blockedReason);
  process.exit(2);
}

const env = {
  ...process.env,
  ...fileEnv,
  NODE_ENV: 'development',
  LOVE_ODONTO_STAGING_TEST_MODE: '1',
  STAGING_TEST_MODE: '1',
  VITE_STAGING_TEST_MODE: 'true',
  CONTRACTS_V2_DELIVERY_MODE: 'disabled',
  PORT: '3011',
  ADMIN_API_PORT: '3011',
  VITE_PLATFORM_API_BASE_URL: 'http://127.0.0.1:3011',
  VITE_APP_ADMIN_API_BASE_URL: 'http://127.0.0.1:3011',
};

for (const [k, v] of Object.entries(env)) {
  if (String(v).includes(PRODUCTION_REF) && (k.includes('SUPABASE') || k.includes('URL'))) {
    console.error('HARD STOP production in', k);
    process.exit(2);
  }
}

let child;
if (mode === 'api') {
  child = spawn('node', ['index.js'], {
    cwd: path.join(ROOT, 'server'),
    env,
    stdio: 'inherit',
    detached: true,
  });
} else {
  child = spawn('npx', ['vite', '--mode', 'staging', '--port', '5188', '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
    detached: true,
    shell: process.platform === 'win32',
  });
}

child.unref();
console.log(JSON.stringify({
  ok: true,
  mode,
  pid: child.pid,
  project: guard.projectRef,
  api: 'http://127.0.0.1:3011',
  browser: 'http://127.0.0.1:5188',
}));
