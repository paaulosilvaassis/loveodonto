/**
 * Preflight local — validação única antes de subir Vite/API (Windows + Unix).
 * Exporta funções usadas por dev-console-with-api.js e pela CLI `--mode`.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..');

const DEFAULT_API_PORT = Number(process.env.ADMIN_API_PORT || 3001);
const DEFAULT_CONSOLE_PORT = 5177;

/** Permite ignorar bloqueios de duplicado (só emergência). */
const ALLOW_DUP = process.env.LOVE_ODONTO_ALLOW_DUPLICATE_DEV === '1';

export function parseEnvFile(filePath) {
  const out = {};
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
  } catch {
    /* ausente */
  }
  return out;
}

function mergeDirEnv(dir) {
  return {
    ...parseEnvFile(path.join(dir, '.env')),
    ...parseEnvFile(path.join(dir, '.env.local')),
  };
}

export function hostOf(url) {
  try {
    const s = String(url || '').trim();
    if (!s) return null;
    return new URL(s.includes('http') ? s : `https://${s}`).hostname;
  } catch {
    return null;
  }
}

/** Igual a server/index.js: server/.env → raiz .env → .env.local */
export function getBackendSupabaseUrl() {
  const merged = {
    ...parseEnvFile(path.join(REPO_ROOT, 'server', '.env')),
    ...mergeDirEnv(REPO_ROOT),
  };
  return String(merged.SUPABASE_URL || '').trim();
}

/**
 * Igual a console/vite.config.js: console/.env* prevalece; raiz só como fallback.
 * (Antes root sobrescrevia console e forçava staging na Console.)
 */
export function getConsoleViteSupabaseUrl() {
  const consoleM = mergeDirEnv(path.join(REPO_ROOT, 'console'));
  const rootM = mergeDirEnv(REPO_ROOT);
  return String(
    consoleM.VITE_CONSOLE_SUPABASE_URL
    || consoleM.VITE_SUPABASE_PLATFORM_URL
    || consoleM.VITE_SUPABASE_URL
    || rootM.VITE_CONSOLE_SUPABASE_URL
    || rootM.VITE_SUPABASE_PLATFORM_URL
    || rootM.VITE_SUPABASE_URL
    || '',
  ).trim();
}

/** Igual a vite.config.js mergedPlatformEnv (app 5176). */
export function getAppPlatformSupabaseUrl() {
  const rootM = mergeDirEnv(REPO_ROOT);
  const consoleM = mergeDirEnv(path.join(REPO_ROOT, 'console'));
  return String(
    rootM.VITE_SUPABASE_PLATFORM_URL
    || rootM.VITE_SUPABASE_URL
    || consoleM.VITE_CONSOLE_SUPABASE_URL
    || consoleM.VITE_SUPABASE_URL
    || '',
  ).trim();
}

export function printSupabaseEnvDiagnosis() {
  const serverEnv = parseEnvFile(path.join(REPO_ROOT, 'server', '.env'));
  const rootEnv = parseEnvFile(path.join(REPO_ROOT, '.env'));
  const rootLocal = parseEnvFile(path.join(REPO_ROOT, '.env.local'));
  const consoleEnv = parseEnvFile(path.join(REPO_ROOT, 'console', '.env'));
  const consoleLocal = parseEnvFile(path.join(REPO_ROOT, 'console', '.env.local'));

  const backMerged = { ...serverEnv, ...rootEnv, ...rootLocal };
  const consoleMerged = { ...rootEnv, ...rootLocal, ...consoleEnv, ...consoleLocal };

  const line = (label, key, obj) => {
    const v = obj[key];
    if (!v) return;
    const h = hostOf(v);
    console.error(`  ${label} — ${key} → ${h || '?'}`);
  };

  console.error('[preflight] Ficheiros a rever:');
  line('server/.env', 'SUPABASE_URL', serverEnv);
  line('.env', 'SUPABASE_URL', rootEnv);
  line('.env.local', 'SUPABASE_URL', rootLocal);
  console.error(`  → backend efetivo: ${hostOf(backMerged.SUPABASE_URL) || '(vazio)'}`);
  console.error('');
  line('console/.env', 'VITE_CONSOLE_SUPABASE_URL', consoleEnv);
  line('console/.env.local', 'VITE_CONSOLE_SUPABASE_URL', consoleLocal);
  line('.env', 'VITE_CONSOLE_SUPABASE_URL', rootEnv);
  line('.env.local', 'VITE_CONSOLE_SUPABASE_URL', rootLocal);
  line('.env', 'VITE_SUPABASE_URL', rootEnv);
  line('.env.local', 'VITE_SUPABASE_URL', rootLocal);
  console.error(`  → Console Vite efetivo: ${hostOf(
    consoleMerged.VITE_CONSOLE_SUPABASE_URL
    || consoleMerged.VITE_SUPABASE_PLATFORM_URL
    || consoleMerged.VITE_SUPABASE_URL,
  ) || '(vazio)'}`);
}

/** Backend (API) e bundle da Console: mesmo projeto Supabase. */
export function validateEnvStackOrExit() {
  const hBack = hostOf(getBackendSupabaseUrl());
  const hCon = hostOf(getConsoleViteSupabaseUrl());

  if (!hBack) {
    console.error('[preflight] SUPABASE_URL em falta (server/.env ou .env na raiz).');
    printSupabaseEnvDiagnosis();
    process.exit(1);
  }
  if (!hCon) {
    console.error('[preflight] VITE_CONSOLE_SUPABASE_URL ou VITE_SUPABASE_URL em falta (console/.env ou raiz).');
    printSupabaseEnvDiagnosis();
    process.exit(1);
  }
  if (hBack !== hCon) {
    console.error('[preflight] Dois projetos Supabase: API usa', hBack, '— Console usa', hCon);
    printSupabaseEnvDiagnosis();
    process.exit(1);
  }
  console.log('[preflight] Supabase alinhado (API + Console):', hBack);
}

/** App 5176 (platform) e API: mesmo projeto (proxy /internal/app). */
export function validateEnvAppOrExit() {
  const hBack = hostOf(getBackendSupabaseUrl());
  const hPlat = hostOf(getAppPlatformSupabaseUrl());

  if (!hBack) {
    console.error('[preflight] SUPABASE_URL em falta para o backend.');
    printSupabaseEnvDiagnosis();
    process.exit(1);
  }
  if (!hPlat) {
    console.error('[preflight] Defina VITE_SUPABASE_PLATFORM_* ou VITE_CONSOLE_* (app + API no mesmo projeto).');
    process.exit(1);
  }
  if (hBack !== hPlat) {
    console.error('[preflight] App (platform) ≠ API:', hPlat, 'vs', hBack);
    process.exit(1);
  }
  console.log('[preflight] Supabase alinhado (app + API):', hBack);
}

export function probeApiHealth(port = DEFAULT_API_PORT) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export function probeConsoleLogin(port = DEFAULT_CONSOLE_PORT) {
  const url = `http://127.0.0.1:${port}/login`;
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2200, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/** App principal (Vite :5176) — responde na raiz. */
export function probeAppDev(port = 5176) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2200, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function assertNoDuplicateApiOrExit(port = DEFAULT_API_PORT) {
  if (ALLOW_DUP) return;
  if (await probeApiHealth(port)) {
    console.error('[preflight] API já ativa em http://127.0.0.1:' + port + ' — não inicie segunda instância.');
    console.error('  Use npm run console:dev ou pare o processo antes de npm run api:dev.');
    process.exit(1);
  }
}

export async function assertNoDuplicateConsoleOrExit(port = DEFAULT_CONSOLE_PORT) {
  if (ALLOW_DUP) return;
  if (await probeConsoleLogin(port)) {
    console.error('[preflight] Console já em http://localhost:' + port + '/login — não inicie outro Vite.');
    console.error('  Pare o terminal existente ou use npm run console:dev (coordena API + Console).');
    process.exit(1);
  }
}

export function isPortInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(800, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

const SKIP_CONSOLE_PORT_FREE = process.env.LOVE_ODONTO_SKIP_PORT_FREE === '1';

function getListeningPidsWindows(port) {
  const cmd =
    `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | `
    + 'Select-Object -ExpandProperty OwningProcess -Unique)';
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return [
      ...new Set(
        String(out || '')
          .split(/\r?\n/)
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    ];
  } catch {
    return [];
  }
}

function getListeningPidsUnix(port) {
  try {
    const out = execFileSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8' });
    return [
      ...new Set(
        String(out || '')
          .split(/\r?\n/)
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    ];
  } catch {
    return [];
  }
}

function killPidWindows(pid) {
  try {
    execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'pipe', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function killPidUnix(pid) {
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
      return true;
    } catch {
      return false;
    }
  }
}

/** Libertação automática da porta da Console em dev (stale Vite). */
export async function ensureConsolePortFree(port = DEFAULT_CONSOLE_PORT) {
  if (!(await isPortInUse(port))) return;

  if (SKIP_CONSOLE_PORT_FREE) {
    console.error('[preflight] Porta ' + port + ' ocupada. LOVE_ODONTO_SKIP_PORT_FREE=1 — liberte manualmente.');
    process.exit(1);
  }

  console.log('[preflight] Porta ' + port + ' ocupada — a libertar (dev)...');

  const pids =
    process.platform === 'win32' ? getListeningPidsWindows(port) : getListeningPidsUnix(port);

  if (pids.length === 0) {
    await new Promise((r) => setTimeout(r, 400));
    if (await isPortInUse(port)) {
      console.error('[preflight] Porta ' + port + ' ainda ocupada (sem PID). netstat -ano | findstr :' + port);
      process.exit(1);
    }
    return;
  }

  for (const pid of pids) {
    if (pid === process.pid) continue;
    const ok = process.platform === 'win32' ? killPidWindows(pid) : killPidUnix(pid);
    console.log('[preflight] PID ' + pid + (ok ? ' encerrado' : ' falhou'));
  }

  await new Promise((r) => setTimeout(r, 600));

  if (await isPortInUse(port)) {
    console.error('[preflight] Porta ' + port + ' ainda ocupada.');
    process.exit(1);
  }
  console.log('[preflight] Porta ' + port + ' livre.\n');
}

async function main() {
  const modeIdx = process.argv.indexOf('--mode');
  const mode = modeIdx >= 0 ? (process.argv[modeIdx + 1] || 'stack') : 'stack';

  switch (mode) {
    case 'stack':
      validateEnvStackOrExit();
      break;
    case 'app':
      validateEnvAppOrExit();
      break;
    case 'api':
      validateEnvStackOrExit();
      await assertNoDuplicateApiOrExit();
      console.log('[preflight] OK — pode iniciar a API.');
      break;
    case 'console-vite':
      validateEnvStackOrExit();
      await assertNoDuplicateConsoleOrExit();
      console.log('[preflight] OK — pode iniciar só o Vite da Console.');
      break;
    default:
      console.error('[preflight] --mode desconhecido: use stack | app | api | console-vite');
      process.exit(1);
  }
}

const isCli =
  process.argv[1]
  && path.normalize(path.resolve(process.argv[1])) === path.normalize(fileURLToPath(import.meta.url));

if (isCli) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
