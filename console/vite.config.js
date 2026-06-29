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

/** Só aplica valores não vazios — evita .env.local na raiz apagar console/.env. */
function mergeNonEmptyEnv(...sources) {
  const out = {};
  for (const src of sources) {
    for (const [key, value] of Object.entries(src || {})) {
      const trimmed = String(value ?? '').trim();
      if (trimmed) out[key] = trimmed;
    }
  }
  return out;
}

/** Prefere anon JWT (eyJ) — login Auth costuma falhar com publishable em alguns browsers. */
function pickPublicKey(...candidates) {
  const keys = candidates.map(rejectTruncatedKey).filter(Boolean);
  const jwt = keys.find((k) => k.startsWith('eyJ'));
  if (jwt) return jwt;
  return keys.find((k) => k.startsWith('sb_publishable_')) || keys[0] || '';
}

export default defineConfig(({ mode }) => {
  const consoleEnv = mergeNonEmptyEnv(loadEnv(mode, __dirname, ''));
  const rootEnv = mergeNonEmptyEnv(loadEnv(mode, repoRoot, ''));
  const env = { ...consoleEnv, ...rootEnv };

  const resolvedConsoleUrl = (
    env.VITE_CONSOLE_SUPABASE_URL
    || env.VITE_SUPABASE_PLATFORM_URL
    || env.VITE_SUPABASE_URL
    || ''
  ).trim();

  const resolvedConsoleAnon = pickPublicKey(
    env.VITE_CONSOLE_SUPABASE_ANON_KEY,
    env.VITE_SUPABASE_PLATFORM_ANON_KEY,
    env.VITE_SUPABASE_ANON_KEY,
    env.VITE_CONSOLE_SUPABASE_PUBLISHABLE_KEY,
  );

  const resolvedConsolePublishable = rejectTruncatedKey(env.VITE_CONSOLE_SUPABASE_PUBLISHABLE_KEY);

  const backendTarget = env.VITE_PLATFORM_API_BASE_URL || 'http://127.0.0.1:3001';

  const devProxy = {
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

  if (resolvedConsoleUrl) {
    devProxy['/__supabase'] = {
      target: resolvedConsoleUrl.replace(/\/+$/, ''),
      changeOrigin: true,
      secure: true,
    };
  }

  return {
    define: {
      'import.meta.env.VITE_CONSOLE_SUPABASE_URL': JSON.stringify(resolvedConsoleUrl),
      'import.meta.env.VITE_CONSOLE_SUPABASE_ANON_KEY': JSON.stringify(resolvedConsoleAnon),
      'import.meta.env.VITE_CONSOLE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(resolvedConsolePublishable),
    },
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      port: 5177,
      strictPort: true,
      open: '/login',
      proxy: devProxy,
    },
    preview: {
      port: 4177,
      strictPort: true,
      proxy: devProxy,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
