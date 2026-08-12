/**
 * Shared fail-closed guards for staging browser scripts (plain ESM).
 * Keep in sync with src/domain/contracts/staging/staging-browser-test-mode.ts
 */
export const STAGING_REF = 'tckdjyunwmdpqmewrwvt';
export const PRODUCTION_REF = 'uoepkwhqztmsjnzirpev';

export function parseTruthy(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function isStagingTestMode(env = {}) {
  return ['VITE_STAGING_TEST_MODE', 'LOVE_ODONTO_STAGING_TEST_MODE', 'STAGING_TEST_MODE']
    .some((k) => parseTruthy(env[k]));
}

export function extractRef(urlOrHost) {
  const raw = String(urlOrHost || '').trim();
  if (!raw) return '';
  try {
    const host = raw.includes('://') ? new URL(raw).hostname : raw;
    return String(host || '').split('.')[0].trim().toLowerCase();
  } catch {
    return '';
  }
}

export function looksProduction(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return false;
  return raw.includes(PRODUCTION_REF)
    || raw.includes('amor-odonto-prod')
    || raw.includes('loveodonto.com.br');
}

export function assertSafe(env) {
  if (!isStagingTestMode(env)) {
    return { ok: true, stagingTestMode: false, projectRef: '' };
  }
  const keys = [
    'VITE_SUPABASE_PLATFORM_URL',
    'VITE_SUPABASE_APP_URL',
    'VITE_SUPABASE_URL',
    'VITE_CONSOLE_SUPABASE_URL',
    'SUPABASE_URL',
    'VITE_PLATFORM_API_BASE_URL',
  ];
  for (const k of keys) {
    if (looksProduction(env[k])) {
      return {
        ok: false,
        stagingTestMode: true,
        projectRef: extractRef(env[k]) || PRODUCTION_REF,
        blockedReason: `STAGING_TEST_MODE + production detectado em ${k}`,
      };
    }
  }
  const primary = env.VITE_SUPABASE_APP_URL || env.VITE_SUPABASE_PLATFORM_URL || env.SUPABASE_URL || '';
  const projectRef = extractRef(primary);
  if (projectRef !== STAGING_REF) {
    return {
      ok: false,
      stagingTestMode: true,
      projectRef,
      blockedReason: `Esperado ${STAGING_REF}, obtido "${projectRef || 'vazio'}"`,
    };
  }
  const delivery = String(env.CONTRACTS_V2_DELIVERY_MODE || 'disabled').toLowerCase();
  if (delivery !== 'disabled') {
    return {
      ok: false,
      stagingTestMode: true,
      projectRef,
      blockedReason: `CONTRACTS_V2_DELIVERY_MODE deve ser disabled (atual: ${delivery})`,
    };
  }
  return { ok: true, stagingTestMode: true, projectRef };
}
