/**
 * @module repositories/contracts/contractsV2EnvironmentGuard
 * @description Proteção contra ambiente errado — Phase 10.9.
 * Abortar com CONTRACTS_V2_LOCAL_DATABASE_REQUIRED se não for local/efêmero.
 */

export const CONTRACTS_V2_LOCAL_DATABASE_REQUIRED = 'CONTRACTS_V2_LOCAL_DATABASE_REQUIRED';
export const CONTRACTS_V2_LOCAL_STORAGE_REQUIRED = 'CONTRACTS_V2_LOCAL_STORAGE_REQUIRED';

export const CONTRACTS_V2_LOCAL_OPT_IN_ENV = 'CONTRACTS_V2_LOCAL_DATABASE';
export const CONTRACTS_V2_LOCAL_STORAGE_OPT_IN_ENV = 'CONTRACTS_V2_LOCAL_STORAGE';
export const CONTRACTS_V2_LOCAL_OPT_IN_VALUE = 'true';

const ALLOWED_STORAGE_BUCKETS = new Set(['contracts-v2-private-local']);

const ALLOWED_HOSTS = new Set([
  '127.0.0.1',
  'localhost',
  '::1',
  'host.docker.internal',
]);

const ALLOWED_PROJECT_IDS = new Set([
  'love-odonto-local-disposable',
  'supabase-local',
]);

const FORBIDDEN_HOST_MARKERS = [
  'supabase.co',
  'amazonaws.com',
  'neon.tech',
  'pooler.supabase.com',
];

const PRODUCTION_REFS = [
  'uoepkwhqztmsjnzirpev', // production
  'tckdjyunwmdpqmewrwvt', // staging compartilhado — bloqueado nesta fase
];

const FORBIDDEN_ENV_KEYS = [
  'DATABASE_URL',
  'SUPABASE_DB_URL',
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SERVICE_ROLE_KEY',
] as const;

export type ContractsV2EnvironmentMode =
  | 'unavailable'
  | 'memory'
  | 'postgres-test'
  | 'postgres-storage-local-test';

export interface ContractsV2EnvironmentAssessment {
  ok: boolean;
  mode: ContractsV2EnvironmentMode;
  code: string | null;
  reasons: string[];
  allowedHosts: string[];
  projectId?: string | null;
  host?: string | null;
}

function isTruthy(value: unknown): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function parseHost(urlOrHost: string | undefined | null): string | null {
  if (!urlOrHost) return null;
  const raw = String(urlOrHost).trim();
  if (!raw) return null;
  try {
    if (raw.includes('://')) {
      return new URL(raw).hostname.toLowerCase();
    }
  } catch {
    // fallthrough
  }
  return raw.split(':')[0].toLowerCase();
}

/**
 * Avalia se o ambiente pode usar Postgres Contracts V2.
 * Não faz override silencioso — qualquer dúvida bloqueia.
 */
export function assessContractsV2DatabaseEnvironment(input: {
  env?: NodeJS.ProcessEnv;
  mode?: ContractsV2EnvironmentMode;
  databaseUrl?: string | null;
  supabaseUrl?: string | null;
  projectId?: string | null;
  projectRef?: string | null;
  explicitLocalMarker?: boolean;
} = {}): ContractsV2EnvironmentAssessment {
  const env = input.env || process.env;
  const mode = input.mode || 'unavailable';
  const reasons: string[] = [];

  if (mode === 'unavailable' || mode === 'memory') {
    return {
      ok: true,
      mode,
      code: null,
      reasons: [],
      allowedHosts: [...ALLOWED_HOSTS],
      projectId: input.projectId || null,
      host: null,
    };
  }

  // postgres-test e postgres-storage-local-test exigem marcadores explícitos
  const localOptIn = isTruthy(env[CONTRACTS_V2_LOCAL_OPT_IN_ENV])
    || input.explicitLocalMarker === true;
  const integration = isTruthy(env.RUN_SUPABASE_LOCAL_INTEGRATION);
  const confirmation = String(env.LOVE_ODONTO_LOCAL_DB_CONFIRMATION || '').trim()
    === 'LOCAL_DISPOSABLE_ONLY';

  if (!localOptIn) {
    reasons.push('missing_CONTRACTS_V2_LOCAL_DATABASE');
  }
  if (!integration) {
    reasons.push('missing_RUN_SUPABASE_LOCAL_INTEGRATION');
  }
  if (!confirmation) {
    reasons.push('missing_LOVE_ODONTO_LOCAL_DB_CONFIRMATION');
  }

  for (const key of FORBIDDEN_ENV_KEYS) {
    if (env[key] && String(env[key]).trim()) {
      // Em postgres-test, URLs locais podem ser passadas via argumento tipado — não via env proibido.
      reasons.push(`forbidden_env:${key}`);
    }
  }

  const host = parseHost(input.databaseUrl || input.supabaseUrl || null);
  if (host) {
    if (!ALLOWED_HOSTS.has(host)) {
      reasons.push(`host_not_allowed:${host}`);
    }
    for (const marker of FORBIDDEN_HOST_MARKERS) {
      if (host.includes(marker) || String(input.databaseUrl || '').includes(marker)) {
        reasons.push(`remote_host_marker:${marker}`);
      }
    }
  }

  const projectId = input.projectId || env.SUPABASE_LOCAL_PROJECT_ID || null;
  if (projectId && !ALLOWED_PROJECT_IDS.has(String(projectId))) {
    reasons.push(`project_id_not_allowed:${projectId}`);
  }

  const projectRef = input.projectRef || null;
  if (projectRef && PRODUCTION_REFS.includes(String(projectRef))) {
    reasons.push(`blocked_project_ref:${projectRef}`);
  }

  for (const ref of PRODUCTION_REFS) {
    const hay = [
      input.databaseUrl,
      input.supabaseUrl,
      projectRef,
      env.SUPABASE_PROJECT_REF,
    ].filter(Boolean).join(' ');
    if (hay.includes(ref)) {
      reasons.push(`production_or_staging_ref:${ref}`);
    }
  }

  if (reasons.length) {
    return {
      ok: false,
      mode,
      code: CONTRACTS_V2_LOCAL_DATABASE_REQUIRED,
      reasons,
      allowedHosts: [...ALLOWED_HOSTS],
      projectId,
      host,
    };
  }

  return {
    ok: true,
    mode,
    code: null,
    reasons: [],
    allowedHosts: [...ALLOWED_HOSTS],
    projectId,
    host,
  };
}

export interface ContractsV2LocalStorageAssessment {
  ok: boolean;
  code: string | null;
  reasons: string[];
  bucket?: string | null;
  host?: string | null;
}

/**
 * Avalia se storage privado local pode ser usado (bucket allowlist + host local).
 */
export function assessContractsV2LocalStorage(input: {
  env?: NodeJS.ProcessEnv;
  bucket?: string | null;
  supabaseUrl?: string | null;
  storageUrl?: string | null;
  explicitLocalMarker?: boolean;
} = {}): ContractsV2LocalStorageAssessment {
  const env = input.env || process.env;
  const reasons: string[] = [];

  const storageOptIn = isTruthy(env[CONTRACTS_V2_LOCAL_STORAGE_OPT_IN_ENV])
    || input.explicitLocalMarker === true;
  const confirmation = String(env.LOVE_ODONTO_LOCAL_DB_CONFIRMATION || '').trim()
    === 'LOCAL_DISPOSABLE_ONLY';

  if (!storageOptIn) reasons.push('missing_CONTRACTS_V2_LOCAL_STORAGE');
  if (!confirmation) reasons.push('missing_LOVE_ODONTO_LOCAL_DB_CONFIRMATION');

  const bucket = input.bucket || env.CONTRACTS_V2_PRIVATE_BUCKET || null;
  if (!bucket || !ALLOWED_STORAGE_BUCKETS.has(String(bucket))) {
    reasons.push(`bucket_not_allowed:${bucket || 'missing'}`);
  }

  const storageHost = parseHost(input.storageUrl || input.supabaseUrl || env.SUPABASE_LOCAL_URL || null);
  if (storageHost) {
    if (!ALLOWED_HOSTS.has(storageHost)) {
      reasons.push(`storage_host_not_allowed:${storageHost}`);
    }
    for (const marker of FORBIDDEN_HOST_MARKERS) {
      const hay = [input.storageUrl, input.supabaseUrl, env.SUPABASE_URL, env.VITE_SUPABASE_URL]
        .filter(Boolean)
        .join(' ');
      if (storageHost.includes(marker) || hay.includes(marker)) {
        reasons.push(`remote_storage_marker:${marker}`);
      }
    }
  } else {
    reasons.push('missing_storage_host');
  }

  for (const ref of PRODUCTION_REFS) {
    const hay = [
      input.storageUrl,
      input.supabaseUrl,
      env.SUPABASE_URL,
      env.VITE_SUPABASE_URL,
    ].filter(Boolean).join(' ');
    if (hay.includes(ref)) reasons.push(`production_or_staging_ref:${ref}`);
  }

  if (reasons.length) {
    return {
      ok: false,
      code: CONTRACTS_V2_LOCAL_STORAGE_REQUIRED,
      reasons,
      bucket,
      host: storageHost,
    };
  }

  return {
    ok: true,
    code: null,
    reasons: [],
    bucket,
    host: storageHost,
  };
}

export function assertContractsV2LocalStorage(
  input?: Parameters<typeof assessContractsV2LocalStorage>[0],
): ContractsV2LocalStorageAssessment {
  const assessment = assessContractsV2LocalStorage(input);
  if (!assessment.ok) {
    const err = new Error(
      `${CONTRACTS_V2_LOCAL_STORAGE_REQUIRED}: storage local/efêmero obrigatório. `
      + `Razões: ${assessment.reasons.join(', ')}`,
    );
    (err as Error & { code: string }).code = CONTRACTS_V2_LOCAL_STORAGE_REQUIRED;
    throw err;
  }
  return assessment;
}

export function assertContractsV2LocalDatabase(
  input?: Parameters<typeof assessContractsV2DatabaseEnvironment>[0],
): ContractsV2EnvironmentAssessment {
  const assessment = assessContractsV2DatabaseEnvironment(input);
  if (!assessment.ok) {
    const err = new Error(
      `${CONTRACTS_V2_LOCAL_DATABASE_REQUIRED}: ambiente local/efêmero obrigatório. `
      + `Razões: ${assessment.reasons.join(', ')}`,
    );
    (err as Error & { code: string }).code = CONTRACTS_V2_LOCAL_DATABASE_REQUIRED;
    throw err;
  }
  return assessment;
}
