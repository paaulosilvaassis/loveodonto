import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Chave placeholder tipo eyJ... não deve virar client inválido. */
function rejectTruncatedKey(value) {
  const s = String(value ?? '').trim();
  if (!s || s.endsWith('...') || s.endsWith('…')) return '';
  return s;
}

/**
 * O app na raiz (5176) expõe /platform/login, mas muitos devs só preenchem console/.env.
 * Mesclamos VITE_CONSOLE_SUPABASE_* do diretório console/ como fallback de VITE_SUPABASE_PLATFORM_*.
 */
function mergedPlatformEnv(mode) {
  const rootEnv = loadEnv(mode, __dirname, '');
  const consoleEnv = loadEnv(mode, path.join(__dirname, 'console'), '');
  const platformUrl = (
    rootEnv.VITE_SUPABASE_PLATFORM_URL
    || consoleEnv.VITE_CONSOLE_SUPABASE_URL
    || ''
  ).trim();
  const platformKey = rejectTruncatedKey(
    rootEnv.VITE_SUPABASE_PLATFORM_ANON_KEY
      || consoleEnv.VITE_CONSOLE_SUPABASE_ANON_KEY
      || consoleEnv.VITE_CONSOLE_SUPABASE_PUBLISHABLE_KEY,
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
  plugins: [react()],
  server: {
    port: 5176,
    strictPort: true,
    open: true,
    proxy: {
      '/internal/app': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
    fs: {
      allow: [
        'C:/Users/paaul/.cursor/projects/c-Users-paaul-Desktop-appgestaoodonto-main-appgestaoodonto/assets',
        'C:/Users/paaul/Downloads',
        'C:/Users/paaul/Desktop/appgestaoodonto-main/appgestaoodonto',
      ],
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => next());
    },
  },
};
});
