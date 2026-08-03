/**
 * Admin API :3001 + Vite App :5176.
 * Sobe o backend local se ainda não estiver ativo e depois inicia o app.
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  probeApiHealth,
  probeAppDev,
  REPO_ROOT,
  validateEnvAppOrExit,
} from './preflight-local.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = REPO_ROOT;
const PORT = Number(process.env.ADMIN_API_PORT || 3001);
const APP_DEV_PORT = 5176;

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
    throw new Error('[app+api] Falta server/index.js');
  }
  return spawn(process.execPath, [serverEntry], {
    cwd: serverDir,
    stdio: 'inherit',
    env: { ...process.env, PORT: String(PORT), ADMIN_API_PORT: String(PORT) },
  });
}

function spawnAppVite() {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'preflight-local.mjs'), '--mode', 'app'], {
    stdio: 'inherit',
    cwd: root,
  });
  execFileSync(process.execPath, [path.join(root, 'scripts', 'esbuild-preflight.js')], {
    stdio: 'inherit',
    cwd: root,
  });
  const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(viteCli)) {
    throw new Error('[app+api] Rode npm install na raiz do projeto.');
  }
  return spawn(process.execPath, [viteCli, '--port', String(APP_DEV_PORT), '--strictPort'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env },
  });
}

async function main() {
  /** App local só exige App ↔ API no mesmo projeto. Console pode ser outro (produção). */
  validateEnvAppOrExit();

  let serverProc = null;
  let serverStartedByUs = false;

  const apiUp = await checkHealth();
  if (!apiUp) {
    console.log(`[app+api] A subir Admin API :${PORT}...\n`);
    serverProc = spawnServerNode();
    serverStartedByUs = true;
    serverProc.on('error', (err) => {
      console.error('[app+api] Backend:', err.message);
      process.exit(1);
    });
    try {
      await waitForHealth(90000);
    } catch (e) {
      console.error(String(e.message || e));
      if (serverProc) serverProc.kill('SIGTERM');
      process.exit(1);
    }
    console.log('[app+api] API pronta.\n');
  } else {
    console.log(`[app+api] API já ativa :${PORT}\n`);
  }

  const viteUp = await probeAppDev(APP_DEV_PORT);
  if (viteUp) {
    console.log(`[app+api] App já ativo em http://localhost:${APP_DEV_PORT}/`);
    console.log('[app+api] Não é necessário rodar npm run dev de novo.');
    console.log('[app+api] Para reiniciar: pare o Vite existente (Ctrl+C no terminal dele) e rode npm run dev.\n');
    process.exit(0);
  }

  console.log(`[app+api] A subir app em http://localhost:${APP_DEV_PORT} ...\n`);
  let viteProc;
  try {
    viteProc = spawnAppVite();
  } catch (e) {
    console.error(String(e.message || e));
    if (serverStartedByUs && serverProc) serverProc.kill('SIGTERM');
    process.exit(1);
  }

  viteProc.on('error', (err) => {
    console.error('[app+api] Vite:', err.message);
    if (serverStartedByUs && serverProc) serverProc.kill('SIGTERM');
    process.exit(1);
  });

  viteProc.on('exit', (code) => {
    if (serverStartedByUs && serverProc) {
      console.log('\n[app+api] A encerrar API iniciada aqui.');
      serverProc.kill('SIGTERM');
    }
    process.exit(code ?? 0);
  });

  if (serverStartedByUs && serverProc) {
    serverProc.on('exit', (code, signal) => {
      const detail = code === null && signal ? String(signal) : String(code);
      console.error(`\n[app+api] Backend parou (${detail}). A fechar Vite.`);
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
