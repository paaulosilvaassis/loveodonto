/**
 * Um único comando: garante Admin API (3001) + Vite da Console (5177).
 * Se a API já estiver no ar, só sobe a Console (não mata o processo que você já tinha).
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PORT = Number(process.env.ADMIN_API_PORT || 3001);

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/health`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForHealth(maxMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await checkHealth()) return;
    await new Promise((r) => setTimeout(r, 350));
  }
  throw new Error(
    `O backend não respondeu em http://127.0.0.1:${PORT}/health. Confira server/.env (SUPABASE_*) e tente: npm run server:restart`,
  );
}

async function main() {
  let serverProc = null;
  let serverStartedByUs = false;

  const alreadyUp = await checkHealth();
  if (alreadyUp) {
    console.log(`[console+api] API já ativa em :${PORT} — apenas iniciando a Console.\n`);
  } else {
    console.log(`[console+api] Iniciando Admin API na porta ${PORT}...\n`);
    serverProc = spawn('npm', ['run', 'server:dev'], {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env },
    });
    serverStartedByUs = true;
    serverProc.on('error', (err) => {
      console.error('[console+api] Falha ao iniciar o backend:', err.message);
      process.exit(1);
    });
    try {
      await waitForHealth(90000);
    } catch (e) {
      console.error(String(e.message || e));
      if (serverProc) serverProc.kill('SIGTERM');
      process.exit(1);
    }
    console.log('[console+api] Admin API pronta.\n');
  }

  console.log('[console+api] Iniciando Platform Console (Vite)...\n');
  const viteProc = spawn('npm', ['run', 'dev'], {
    cwd: path.join(root, 'console'),
    stdio: 'inherit',
    shell: true,
    env: { ...process.env },
  });

  viteProc.on('error', (err) => {
    console.error('[console+api] Falha ao iniciar a Console:', err.message);
    if (serverStartedByUs && serverProc) serverProc.kill('SIGTERM');
    process.exit(1);
  });

  viteProc.on('exit', (code) => {
    if (serverStartedByUs && serverProc) {
      console.log('\n[console+api] Encerrando Admin API iniciada por este script.');
      serverProc.kill('SIGTERM');
    }
    process.exit(code ?? 0);
  });

  if (serverStartedByUs && serverProc) {
    serverProc.on('exit', (code) => {
      console.error(`\n[console+api] Backend encerrou (código ${code}). Fechando Vite.`);
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
