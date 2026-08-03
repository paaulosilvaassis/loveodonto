/**
 * API 3001 + Vite Console 5177. Preflight Supabase em scripts/preflight-local.mjs.
 */
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensureConsolePortFree,
  isPortInUse,
  probeApiHealth,
  probeConsoleLogin,
  REPO_ROOT,
  validateEnvStackOrExit,
} from './preflight-local.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = REPO_ROOT;
const PORT = Number(process.env.ADMIN_API_PORT || 3001);
const CONSOLE_DEV_PORT = 5177;
const CONSOLE_LOGIN_URL = `http://127.0.0.1:${CONSOLE_DEV_PORT}/login`;

function checkHealth() {
  return probeApiHealth(PORT);
}

async function waitForHealth(maxMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await checkHealth()) return;
    await new Promise((r) => setTimeout(r, 350));
  }
  throw new Error(
    `Backend sem resposta em http://127.0.0.1:${PORT}/health — confira server/.env`,
  );
}

function spawnServerNode() {
  const serverDir = path.join(root, 'server');
  const serverEntry = path.join(serverDir, 'index.js');
  if (!fs.existsSync(serverEntry)) {
    throw new Error('[console+api] Falta server/index.js');
  }
  return spawn(process.execPath, [serverEntry], {
    cwd: serverDir,
    stdio: 'inherit',
    env: { ...process.env },
  });
}

function spawnConsoleVite() {
  const consoleDir = path.join(root, 'console');
  const bannerScript = path.join(root, 'scripts', 'console-dev-banner.js');
  if (fs.existsSync(bannerScript)) {
    execFileSync(process.execPath, [bannerScript], { stdio: 'inherit', cwd: consoleDir });
  }
  const viteCli = path.join(consoleDir, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(viteCli)) {
    throw new Error('[console+api] cd console && npm install');
  }
  return spawn(process.execPath, [viteCli, '--port', String(CONSOLE_DEV_PORT), '--strictPort'], {
    cwd: consoleDir,
    stdio: 'inherit',
    env: { ...process.env },
  });
}

async function main() {
  validateEnvStackOrExit();

  let serverProc = null;
  let serverStartedByUs = false;

  let apiUp = await checkHealth();
  if (!apiUp) {
    console.log(`[console+api] A subir Admin API :${PORT}...\n`);
    serverProc = spawnServerNode();
    serverStartedByUs = true;
    serverProc.on('error', (err) => {
      console.error('[console+api] Backend:', err.message);
      process.exit(1);
    });
    try {
      await waitForHealth(90000);
    } catch (e) {
      console.error(String(e.message || e));
      if (serverProc) serverProc.kill('SIGTERM');
      process.exit(1);
    }
    console.log('[console+api] API pronta.\n');
    apiUp = true;
  } else {
    console.log(`[console+api] API já ativa :${PORT}\n`);
  }

  const loginPageOk = await probeConsoleLogin(CONSOLE_DEV_PORT);
  if (apiUp && loginPageOk) {
    console.log('[console+api] Console já OK (' + CONSOLE_LOGIN_URL + ').');
    console.log(`  API http://127.0.0.1:${PORT}/health | Console http://localhost:${CONSOLE_DEV_PORT}/login`);
    console.log('[console+api] Sem segundo Vite. Ctrl+C noutro terminal se quiser reiniciar.\n');
    process.exit(0);
  }

  if (await isPortInUse(CONSOLE_DEV_PORT)) {
    await ensureConsolePortFree(CONSOLE_DEV_PORT);
  }

  console.log('[console+api] A subir Vite Console...\n');
  let viteProc;
  try {
    viteProc = spawnConsoleVite();
  } catch (e) {
    console.error(String(e.message || e));
    if (serverStartedByUs && serverProc) serverProc.kill('SIGTERM');
    process.exit(1);
  }

  viteProc.on('error', (err) => {
    console.error('[console+api] Vite:', err.message);
    if (serverStartedByUs && serverProc) serverProc.kill('SIGTERM');
    process.exit(1);
  });

  viteProc.on('exit', (code) => {
    if (serverStartedByUs && serverProc) {
      console.log('\n[console+api] A encerrar API iniciada aqui.');
      serverProc.kill('SIGTERM');
    }
    process.exit(code ?? 0);
  });

  if (serverStartedByUs && serverProc) {
    serverProc.on('exit', (code, signal) => {
      const d =
        code === null && signal
          ? String(signal)
          : String(code);
      console.error('\n[console+api] Backend parou (' + d + '). A fechar Vite.');
      viteProc.kill('SIGTERM');
      process.exit(code ?? 1);
    });
  }

  const shutdown = () => {
    viteProc.kill('SIGTERM');
    if (serverStartedByUs && serverProc) serverProc.kill('SIGTERM');
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv.includes('--env-check-only')) {
  validateEnvStackOrExit();
  process.exit(0);
}

const isMainModule =
  process.argv[1]
  && path.normalize(path.resolve(process.argv[1])) === path.normalize(__filename);

if (isMainModule) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
