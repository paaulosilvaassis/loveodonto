import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

import react from '@vitejs/plugin-react';

import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

/** Chave placeholder (… ou ...) não deve virar client inválido. */
function rejectTruncatedKey(value) {
  const s = String(value ?? '').trim();
  if (!s || s.endsWith('...') || s.endsWith('…')) return '';
  return s;
}

export default defineConfig(({ mode }) => {
  /** Raiz prevalece sobre `console/.env` — mesmo projeto que `server/` (veja .env.example na raiz). */
  const env = {
    ...loadEnv(mode, __dirname, ''),
    ...loadEnv(mode, repoRoot, ''),
  };
  /**
   * Nomes canónicos: VITE_CONSOLE_SUPABASE_*.
   * Fallback: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (mesmo projeto, um único .env na raiz).
   */
  const resolvedConsoleUrl = (
    env.VITE_CONSOLE_SUPABASE_URL
    || env.VITE_SUPABASE_URL
    || ''
  ).trim();
  const resolvedConsoleAnon = rejectTruncatedKey(
    env.VITE_CONSOLE_SUPABASE_ANON_KEY
    || env.VITE_SUPABASE_ANON_KEY,
  );
  const resolvedConsolePublishable = rejectTruncatedKey(env.VITE_CONSOLE_SUPABASE_PUBLISHABLE_KEY);

  const backendTarget = env.VITE_PLATFORM_API_BASE_URL || 'http://127.0.0.1:3001';

  const platformApiProxy = {
    '/internal/platform': {
      target: backendTarget,
      changeOrigin: true,
      configure(proxy) {
        proxy.on('error', (err, _req, res) => {
          if (!res || res.headersSent || typeof res.writeHead !== 'function') return;
          const msg = String(err?.code || err?.message || err || '');
          const isConn =
            msg.includes('ECONNREFUSED')
            || msg.includes('ECONNRESET')
            || msg.includes('socket hang up');
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(
            JSON.stringify({
              error: isConn
                ? 'Admin API (3001) indisponível. Na raiz: npm run console:dev ou npm run server:restart.'
                : `Proxy /internal/platform: ${msg || 'erro desconhecido'}`,
            }),
          );
        });
      },
    },
  };

  return {
    define: {
      'import.meta.env.VITE_CONSOLE_SUPABASE_URL': JSON.stringify(resolvedConsoleUrl),
      'import.meta.env.VITE_CONSOLE_SUPABASE_ANON_KEY': JSON.stringify(resolvedConsoleAnon),
      'import.meta.env.VITE_CONSOLE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(resolvedConsolePublishable),
    },
    plugins: [react(), tailwindcss()],
    server: {
      /** Em Windows o Node pode fazer bind só em [::1]; sem isso, http://127.0.0.1:5177 falha (só IPv6). */
      host: true,
      /** Porta fixa 5177 (`console:dev` / `console:vite` sobem API+Console; `console:vite-only` = só Vite). App: 5176. */
      port: 5177,
      strictPort: true,
      /** Igual ao app na raiz: abre o login da Console no navegador ao subir o Vite. */
      open: '/login',
      proxy: platformApiProxy,
    },
    /** Porta distinta do dev (5177) para evitar conflito ao testar build + preview. */
    preview: {
      port: 4177,
      strictPort: true,
      proxy: platformApiProxy,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});

