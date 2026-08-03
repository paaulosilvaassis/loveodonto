import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Chave placeholder tipo eyJ... não deve virar client inválido. */
function rejectTruncatedKey(value) {
  const s = String(value ?? '').trim();
  if (!s || s.endsWith('...') || s.endsWith('…')) return '';
  return s;
}

/** Só aplica valores não vazios — evita um .env vazio apagar outro fonte. */
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

/** Prefere anon JWT (eyJ) — alinhado ao console/vite.config.js. */
function pickPublicKey(...candidates) {
  const keys = candidates.map(rejectTruncatedKey).filter(Boolean);
  const jwt = keys.find((k) => k.startsWith('eyJ'));
  if (jwt) return jwt;
  return keys.find((k) => k.startsWith('sb_publishable_')) || keys[0] || '';
}

/**
 * App na raiz do pacote (5176): `envDir` = esta pasta (`appgestaoodonto/`),
 * onde ficam `.env.local` / `.env.development` com `VITE_SUPABASE_PLATFORM_*`.
 * Fallback: `console/.env*` (`VITE_CONSOLE_SUPABASE_*`) — mesmo projeto Supabase.
 * O define abaixo injeta só URL + chave pública no bundle; reinicie o Vite após mudar env.
 */
const internalAppProxy = {
  '/internal/app': {
    target: 'http://127.0.0.1:3001',
    changeOrigin: true,
    configure(proxy) {
      proxy.on('error', (err, _req, res) => {
        if (!res || res.headersSent || typeof res.writeHead !== 'function') {
          return;
        }
        const msg = String(err?.code || err?.message || err || '');
        const isConn =
          msg.includes('ECONNREFUSED')
          || msg.includes('ECONNRESET')
          || msg.includes('socket hang up');
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            ok: false,
            message:
              'Admin API local indisponível (porta 3001). Na raiz do projeto, rode npm run dev para subir o app e o backend juntos.',
            error: isConn
              ? 'Admin API local indisponível (porta 3001). Na raiz do projeto, rode npm run dev para subir o app e o backend juntos.'
              : `Falha no proxy para o backend (3001): ${msg || 'erro desconhecido'}`,
          }),
        );
      });
    },
  },
  '/public/platform': {
    target: 'http://127.0.0.1:3001',
    changeOrigin: true,
  },
};

function mergedPlatformEnv(mode) {
  const rootEnv = mergeNonEmptyEnv(loadEnv(mode, __dirname, ''));
  const consoleEnv = mergeNonEmptyEnv(loadEnv(mode, path.join(__dirname, 'console'), ''));
  /** Mesmo projeto: nomes PLATFORM, CONSOLE ou legado VITE_SUPABASE_* na raiz do pacote. */
  const platformUrl = (
    rootEnv.VITE_SUPABASE_PLATFORM_URL
    || rootEnv.VITE_SUPABASE_URL
    || consoleEnv.VITE_CONSOLE_SUPABASE_URL
    || consoleEnv.VITE_SUPABASE_URL
    || ''
  ).trim();
  const platformKey = pickPublicKey(
    rootEnv.VITE_SUPABASE_PLATFORM_ANON_KEY,
    rootEnv.VITE_SUPABASE_ANON_KEY,
    consoleEnv.VITE_CONSOLE_SUPABASE_ANON_KEY,
    consoleEnv.VITE_CONSOLE_SUPABASE_PUBLISHABLE_KEY,
    consoleEnv.VITE_SUPABASE_ANON_KEY,
  );
  const appUrl = (
    rootEnv.VITE_SUPABASE_APP_URL
    || rootEnv.VITE_SUPABASE_URL
    || platformUrl
  ).trim();
  const appKey = pickPublicKey(
    rootEnv.VITE_SUPABASE_APP_ANON_KEY,
    rootEnv.VITE_SUPABASE_ANON_KEY,
    platformKey,
  );
  return { platformUrl, platformKey, appUrl, appKey };
}

export default defineConfig(({ mode }) => {
  const { platformUrl, platformKey, appUrl, appKey } = mergedPlatformEnv(mode);

  return {
    /** Garante que o Vite leia `.env*` desta pasta (não da pasta pai do monorepo). */
    envDir: __dirname,
    define: {
      'import.meta.env.VITE_SUPABASE_PLATFORM_URL': JSON.stringify(platformUrl),
      'import.meta.env.VITE_SUPABASE_PLATFORM_ANON_KEY': JSON.stringify(platformKey),
      'import.meta.env.VITE_SUPABASE_APP_URL': JSON.stringify(appUrl),
      'import.meta.env.VITE_SUPABASE_APP_ANON_KEY': JSON.stringify(appKey),
    },
    plugins: [tailwindcss(), react()],
    server: {
      /** Mesmo motivo que `console/vite.config.js`: bind IPv4 + IPv6 no Windows. */
      host: true,
      port: 5176,
      strictPort: true,
      open: true,
      /** Só Admin API local — Auth/Supabase usa URL absoluta pública (sem `/__supabase`). */
      proxy: internalAppProxy,
      /** Caminhos relativos ao repo — evita fs.allow fixo por máquina (quebrava outros PCs). */
      fs: {
        allow: [
          __dirname,
          path.join(__dirname, 'public'),
          path.join(__dirname, 'console'),
        ],
      },
    },
    preview: {
      port: 4176,
      strictPort: true,
      proxy: internalAppProxy,
    },
  };
});
