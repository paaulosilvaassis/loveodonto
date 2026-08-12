/**
 * @module domain/contracts/staging/staging-browser-test-mode
 * @description PHASE_10.21X — Staging browser smoke isolation (fail-closed).
 *
 * When STAGING_TEST_MODE is active, any production Supabase ref/host aborts.
 * Never logs keys/tokens.
 */

export const STAGING_REF = 'tckdjyunwmdpqmewrwvt';
export const PRODUCTION_REF = 'uoepkwhqztmsjnzirpev';

export const STAGING_TEST_MODE_ENV_KEYS = [
  'VITE_STAGING_TEST_MODE',
  'LOVE_ODONTO_STAGING_TEST_MODE',
  'STAGING_TEST_MODE',
] as const;

export const PRODUCTION_HOST_MARKERS = [
  PRODUCTION_REF,
  'amor-odonto-prod',
  'loveodonto.com.br',
] as const;

export type StagingTestModeEnv = Record<string, string | undefined> | {
  [key: string]: unknown;
};

function readEnvValue(env: StagingTestModeEnv | null | undefined, key: string): string {
  if (!env) return '';
  const raw = (env as Record<string, unknown>)[key];
  return String(raw ?? '').trim();
}

export function parseTruthyFlag(value: unknown): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function isStagingTestModeEnabled(env: StagingTestModeEnv | null | undefined = undefined): boolean {
  const source = env
    || (typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env as StagingTestModeEnv)
      : (typeof process !== 'undefined' ? process.env : {}));
  return STAGING_TEST_MODE_ENV_KEYS.some((k) => parseTruthyFlag(readEnvValue(source, k)));
}

export function extractProjectRefFromUrl(urlOrHost: unknown): string {
  const raw = String(urlOrHost || '').trim();
  if (!raw) return '';
  try {
    const host = raw.includes('://') ? new URL(raw).hostname : raw;
    const first = String(host || '').split('.')[0] || '';
    return first.trim().toLowerCase();
  } catch {
    return '';
  }
}

export function urlLooksLikeProduction(value: unknown): boolean {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return false;
  if (raw.includes(PRODUCTION_REF)) return true;
  return PRODUCTION_HOST_MARKERS.some((m) => raw.includes(String(m).toLowerCase()));
}

export function collectSupabaseUrlCandidates(env: StagingTestModeEnv): string[] {
  const keys = [
    'VITE_SUPABASE_PLATFORM_URL',
    'VITE_SUPABASE_APP_URL',
    'VITE_SUPABASE_URL',
    'VITE_CONSOLE_SUPABASE_URL',
    'SUPABASE_URL',
    'STAGING_SUPABASE_URL',
    'VITE_PLATFORM_API_BASE_URL',
    'VITE_APP_ADMIN_API_BASE_URL',
  ];
  return keys.map((k) => readEnvValue(env, k)).filter(Boolean);
}

export interface StagingTestModeGuardResult {
  ok: boolean;
  stagingTestMode: boolean;
  projectRef: string;
  environment: 'STAGING' | 'PRODUCTION' | 'UNKNOWN' | 'INACTIVE';
  blockedReason?: string;
  productionDetected: boolean;
  expectedStagingRef: typeof STAGING_REF;
  forbiddenProductionRef: typeof PRODUCTION_REF;
}

/**
 * Fail-closed: when staging test mode is on, production URL/ref aborts.
 * When mode is off, returns ok with stagingTestMode=false (no banner/guards).
 */
export function assertStagingTestModeSafe(
  env: StagingTestModeEnv,
  options: { requireStagingRef?: boolean } = {},
): StagingTestModeGuardResult {
  const stagingTestMode = isStagingTestModeEnabled(env);
  if (!stagingTestMode) {
    return {
      ok: true,
      stagingTestMode: false,
      projectRef: '',
      environment: 'INACTIVE',
      productionDetected: false,
      expectedStagingRef: STAGING_REF,
      forbiddenProductionRef: PRODUCTION_REF,
    };
  }

  const candidates = collectSupabaseUrlCandidates(env);
  const productionHit = candidates.find((c) => urlLooksLikeProduction(c));
  if (productionHit) {
    return {
      ok: false,
      stagingTestMode: true,
      projectRef: extractProjectRefFromUrl(productionHit) || PRODUCTION_REF,
      environment: 'PRODUCTION',
      productionDetected: true,
      blockedReason:
        'STAGING_TEST_MODE ativo, mas URL/host de PRODUCTION detectado. Abortando (fail-closed).',
      expectedStagingRef: STAGING_REF,
      forbiddenProductionRef: PRODUCTION_REF,
    };
  }

  const primary =
    readEnvValue(env, 'VITE_SUPABASE_APP_URL')
    || readEnvValue(env, 'VITE_SUPABASE_PLATFORM_URL')
    || readEnvValue(env, 'SUPABASE_URL')
    || readEnvValue(env, 'VITE_SUPABASE_URL')
    || '';
  const projectRef = extractProjectRefFromUrl(primary);

  if (options.requireStagingRef !== false) {
    if (!projectRef) {
      return {
        ok: false,
        stagingTestMode: true,
        projectRef: '',
        environment: 'UNKNOWN',
        productionDetected: false,
        blockedReason: 'STAGING_TEST_MODE ativo sem URL Supabase staging resolvida.',
        expectedStagingRef: STAGING_REF,
        forbiddenProductionRef: PRODUCTION_REF,
      };
    }
    if (projectRef !== STAGING_REF) {
      return {
        ok: false,
        stagingTestMode: true,
        projectRef,
        environment: projectRef === PRODUCTION_REF ? 'PRODUCTION' : 'UNKNOWN',
        productionDetected: projectRef === PRODUCTION_REF,
        blockedReason:
          `STAGING_TEST_MODE exige project ref ${STAGING_REF}; recebido "${projectRef}".`,
        expectedStagingRef: STAGING_REF,
        forbiddenProductionRef: PRODUCTION_REF,
      };
    }
  }

  // Platform API must be local or staging — never a known production public API host.
  const apiBase =
    readEnvValue(env, 'VITE_PLATFORM_API_BASE_URL')
    || readEnvValue(env, 'VITE_APP_ADMIN_API_BASE_URL')
    || '';
  if (apiBase && urlLooksLikeProduction(apiBase)) {
    return {
      ok: false,
      stagingTestMode: true,
      projectRef,
      environment: 'STAGING',
      productionDetected: true,
      blockedReason:
        'STAGING_TEST_MODE bloqueia Platform API apontando para PRODUCTION.',
      expectedStagingRef: STAGING_REF,
      forbiddenProductionRef: PRODUCTION_REF,
    };
  }

  return {
    ok: true,
    stagingTestMode: true,
    projectRef: projectRef || STAGING_REF,
    environment: 'STAGING',
    productionDetected: false,
    expectedStagingRef: STAGING_REF,
    forbiddenProductionRef: PRODUCTION_REF,
  };
}

/** External communication must stay disabled in staging browser smoke. */
export function assertStagingExternalCommunicationDisabled(
  env: StagingTestModeEnv,
): { ok: boolean; deliveryMode: string; blockedReason?: string } {
  if (!isStagingTestModeEnabled(env)) {
    return { ok: true, deliveryMode: 'n/a' };
  }
  const deliveryMode = String(
    readEnvValue(env, 'CONTRACTS_V2_DELIVERY_MODE') || 'disabled',
  ).trim().toLowerCase() || 'disabled';
  if (deliveryMode !== 'disabled') {
    return {
      ok: false,
      deliveryMode,
      blockedReason:
        `STAGING_TEST_MODE exige CONTRACTS_V2_DELIVERY_MODE=disabled (atual: ${deliveryMode}).`,
    };
  }
  return { ok: true, deliveryMode };
}

export function stagingBannerCopy(projectRef: string = STAGING_REF): {
  title: string;
  projectLine: string;
  environmentLine: string;
} {
  const short = String(projectRef || STAGING_REF).slice(0, 4);
  return {
    title: 'STAGING — DADOS FICTÍCIOS — NÃO É PRODUÇÃO',
    projectLine: `Project: ${short}…`,
    environmentLine: 'Environment: STAGING',
  };
}
