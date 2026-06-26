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

/**
 * App na raiz (5176): em dev, `VITE_SUPABASE_PLATFORM_*` pode vir do `.env` da raiz OU,
 * se vazio, do `console/.env` como `VITE_CONSOLE_SUPABASE_*` (um único projeto Supabase para app + Console + backend).
 * O define abaixo injeta os valores no bundle; reinicie o Vite após mudar env.
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
  const rootEnv = loadEnv(mode, __dirname, '');
  const consoleEnv = loadEnv(mode, path.join(__dirname, 'console'), '');
  /** Mesmo projeto: nomes PLATFORM, CONSOLE ou legado VITE_SUPABASE_* na raiz. */
  const platformUrl = (
    rootEnv.VITE_SUPABASE_PLATFORM_URL
    || rootEnv.VITE_SUPABASE_URL
    || consoleEnv.VITE_CONSOLE_SUPABASE_URL
    || consoleEnv.VITE_SUPABASE_URL
    || ''
  ).trim();
  const platformKey = rejectTruncatedKey(
    rootEnv.VITE_SUPABASE_PLATFORM_ANON_KEY
      || rootEnv.VITE_SUPABASE_ANON_KEY
      || consoleEnv.VITE_CONSOLE_SUPABASE_ANON_KEY
      || consoleEnv.VITE_CONSOLE_SUPABASE_PUBLISHABLE_KEY
      || consoleEnv.VITE_SUPABASE_ANON_KEY,
  );
  return { platformUrl, platformKey };
}

export default defineConfig(({ mode }) => {
  const { platformUrl, platformKey } = mergedPlatformEnv(mode);

  return {
  define: {
    'import.meta.env.VITE_SUPABASE_PLATFORM_URL': JSON.stringify(platformUrl),
    'import.meta.env.VITE_SUPABASE_PLATFORM_ANON_KEY': JSON.stringify(platformKey),
  },
  plugins: [tailwindcss(), react()],
  server: {
    /** Mesmo motivo que `console/vite.config.js`: bind IPv4 + IPv6 no Windows. */
    host: true,
    port: 5176,
    strictPort: true,
    open: true,
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
