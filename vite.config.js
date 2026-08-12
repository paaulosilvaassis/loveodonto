import path from 'node:path';
import fs from 'node:fs';
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

function stripEnvValue(value) {
  return String(value ?? '').trim().replace(/\r/g, '');
}

/** Só aplica valores não vazios — evita um .env vazio apagar outro fonte. */
function mergeNonEmptyEnv(...sources) {
  const out = {};
  for (const src of sources) {
    for (const [key, value] of Object.entries(src || {})) {
      const trimmed = stripEnvValue(value);
      if (trimmed) out[key] = trimmed;
    }
  }
  return out;
}

function loadStagingLocalEnvFile() {
  const filePath = path.join(__dirname, '.env.staging.local');
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i).trim()] = stripEnvValue(line.slice(i + 1));
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

const STAGING_REF = 'tckdjyunwmdpqmewrwvt';
const PRODUCTION_REF = 'uoepkwhqztmsjnzirpev';

function parseTruthy(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function extractRef(url) {
  try {
    return new URL(String(url || '').trim()).hostname.split('.')[0] || '';
  } catch {
    return '';
  }
}

function looksProduction(value) {
  const raw = String(value || '').toLowerCase();
  return raw.includes(PRODUCTION_REF)
    || raw.includes('amor-odonto-prod')
    || raw.includes('loveodonto.com.br');
}

function mergedPlatformEnv(mode) {
  const stagingFileEnv = loadStagingLocalEnvFile();
  const rootEnv = mergeNonEmptyEnv(loadEnv(mode, __dirname, ''), stagingFileEnv);
  const consoleEnv = mergeNonEmptyEnv(loadEnv(mode, path.join(__dirname, 'console'), ''));
  const stagingTestMode = mode === 'staging'
    || parseTruthy(rootEnv.VITE_STAGING_TEST_MODE)
    || parseTruthy(rootEnv.LOVE_ODONTO_STAGING_TEST_MODE)
    || parseTruthy(rootEnv.STAGING_TEST_MODE)
    || parseTruthy(process.env.VITE_STAGING_TEST_MODE)
    || parseTruthy(process.env.LOVE_ODONTO_STAGING_TEST_MODE)
    || parseTruthy(stagingFileEnv.VITE_STAGING_TEST_MODE);

  /** Em staging test mode: NÃO usar fallback console/.env (costuma ser production). */
  const platformUrl = (
    rootEnv.VITE_SUPABASE_PLATFORM_URL
    || rootEnv.VITE_SUPABASE_URL
    || (stagingTestMode ? '' : (consoleEnv.VITE_CONSOLE_SUPABASE_URL || consoleEnv.VITE_SUPABASE_URL))
    || ''
  ).trim();
  const platformKey = pickPublicKey(
    rootEnv.VITE_SUPABASE_PLATFORM_ANON_KEY,
    rootEnv.VITE_SUPABASE_ANON_KEY,
    ...(stagingTestMode
      ? []
      : [
        consoleEnv.VITE_CONSOLE_SUPABASE_ANON_KEY,
        consoleEnv.VITE_CONSOLE_SUPABASE_PUBLISHABLE_KEY,
        consoleEnv.VITE_SUPABASE_ANON_KEY,
      ]),
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

  if (stagingTestMode) {
    const urls = [platformUrl, appUrl, rootEnv.VITE_PLATFORM_API_BASE_URL, rootEnv.SUPABASE_URL];
    for (const u of urls) {
      if (looksProduction(u)) {
        throw new Error(
          `[STAGING_TEST_MODE] HARD STOP: URL de PRODUCTION detectada (${PRODUCTION_REF}). `
          + 'Use .env.staging.local e npm run staging:browser.',
        );
      }
    }
    const ref = extractRef(appUrl || platformUrl);
    if (ref !== STAGING_REF) {
      throw new Error(
        `[STAGING_TEST_MODE] HARD STOP: esperado project ${STAGING_REF}, obtido "${ref || 'vazio'}".`,
      );
    }
    const delivery = String(rootEnv.CONTRACTS_V2_DELIVERY_MODE || process.env.CONTRACTS_V2_DELIVERY_MODE || 'disabled')
      .trim()
      .toLowerCase();
    if (delivery && delivery !== 'disabled') {
      throw new Error(
        `[STAGING_TEST_MODE] HARD STOP: CONTRACTS_V2_DELIVERY_MODE deve ser disabled (atual: ${delivery}).`,
      );
    }
  }

  return { platformUrl, platformKey, appUrl, appKey, stagingTestMode };
}

export default defineConfig(({ mode }) => {
  const { platformUrl, platformKey, appUrl, appKey, stagingTestMode } = mergedPlatformEnv(mode);

  return {
    /** Garante que o Vite leia `.env*` desta pasta (não da pasta pai do monorepo). */
    envDir: __dirname,
    define: {
      'import.meta.env.VITE_SUPABASE_PLATFORM_URL': JSON.stringify(platformUrl),
      'import.meta.env.VITE_SUPABASE_PLATFORM_ANON_KEY': JSON.stringify(platformKey),
      'import.meta.env.VITE_SUPABASE_APP_URL': JSON.stringify(appUrl),
      'import.meta.env.VITE_SUPABASE_APP_ANON_KEY': JSON.stringify(appKey),
      'import.meta.env.VITE_STAGING_TEST_MODE': JSON.stringify(
        stagingTestMode ? 'true' : String(process.env.VITE_STAGING_TEST_MODE || ''),
      ),
      'import.meta.env.VITE_SUPABASE_PROJECT_REF': JSON.stringify(
        extractRef(appUrl || platformUrl) || '',
      ),
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
