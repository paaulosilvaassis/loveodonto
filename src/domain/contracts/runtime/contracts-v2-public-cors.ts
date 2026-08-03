/**
 * @module domain/contracts/runtime/contracts-v2-public-cors
 * @description CORS allowlist dedicada — Phase 10.12.
 * Sem wildcard, sem reflexão automática de Origin.
 */

export const CONTRACTS_V2_PUBLIC_ORIGIN_CONFIGURATION_REQUIRED =
  'CONTRACTS_V2_PUBLIC_ORIGIN_CONFIGURATION_REQUIRED';

export interface PublicSigningCorsPolicy {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  allowCredentials: boolean;
  maxAgeSeconds: number;
}

export interface ContractsV2PublicOriginsConfig {
  local: string[];
  test: string[];
  staging: string[];
  production: string[];
}

export const DEFAULT_CONTRACTS_V2_PUBLIC_ORIGINS: ContractsV2PublicOriginsConfig = {
  local: [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:4173',
    'http://localhost:4173',
    'http://127.0.0.1:3000',
    'http://localhost:3000',
  ],
  test: [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
  ],
  staging: [],
  production: [],
};

export const DEFAULT_PUBLIC_SIGNING_CORS_POLICY: Omit<PublicSigningCorsPolicy, 'allowedOrigins'> = {
  allowedMethods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Correlation-Id', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id', 'X-Correlation-Id'],
  allowCredentials: false,
  maxAgeSeconds: 600,
};

export type ContractsV2OriginEnvironment = keyof ContractsV2PublicOriginsConfig;

export function normalizeOrigin(origin: string | undefined | null): string | null {
  if (origin == null) return null;
  const raw = String(origin).trim();
  if (!raw || raw === 'null') return raw === 'null' ? 'null' : null;
  try {
    const u = new URL(raw);
    if (u.username || u.password || u.search || u.hash) return null;
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
    if (path) return null;
    const host = u.hostname.toLowerCase();
    const port = u.port ? `:${u.port}` : '';
    return `${u.protocol}//${host}${port}`;
  } catch {
    return null;
  }
}

export function resolveAllowedOriginsForEnvironment(
  envName: ContractsV2OriginEnvironment,
  config: ContractsV2PublicOriginsConfig = DEFAULT_CONTRACTS_V2_PUBLIC_ORIGINS,
  explicitOrigins?: string[],
): string[] {
  if (explicitOrigins && explicitOrigins.length) {
    return explicitOrigins.map((o) => normalizeOrigin(o)).filter(Boolean) as string[];
  }
  const list = config[envName] || [];
  return list.map((o) => normalizeOrigin(o)).filter(Boolean) as string[];
}

export function createPublicSigningCorsPolicy(input: {
  environment: ContractsV2OriginEnvironment;
  originsConfig?: ContractsV2PublicOriginsConfig;
  explicitOrigins?: string[];
}): PublicSigningCorsPolicy {
  const allowedOrigins = resolveAllowedOriginsForEnvironment(
    input.environment,
    input.originsConfig,
    input.explicitOrigins,
  );
  if ((input.environment === 'staging' || input.environment === 'production')
    && allowedOrigins.length === 0) {
    const err = new Error(
      `${CONTRACTS_V2_PUBLIC_ORIGIN_CONFIGURATION_REQUIRED}: origins vazias para ${input.environment}`,
    );
    (err as Error & { code: string }).code = CONTRACTS_V2_PUBLIC_ORIGIN_CONFIGURATION_REQUIRED;
    throw err;
  }
  return {
    ...DEFAULT_PUBLIC_SIGNING_CORS_POLICY,
    allowedOrigins,
  };
}

export type CorsDecision =
  | { allowed: true; origin: string | null; preflight: boolean }
  | { allowed: false; reason: string; preflight: boolean };

/**
 * Avalia CORS para rotas públicas v2.
 * Sem Origin: permite same-origin / non-browser (curl) — não ecoa Access-Control-Allow-Origin.
 * Origin presente: deve estar na allowlist exata.
 */
export function evaluatePublicSigningCors(
  policy: PublicSigningCorsPolicy,
  input: { origin?: string | null; method?: string },
): CorsDecision {
  const method = String(input.method || 'GET').toUpperCase();
  const preflight = method === 'OPTIONS';
  const normalized = normalizeOrigin(input.origin);

  if (input.origin == null || String(input.origin).trim() === '') {
    return { allowed: true, origin: null, preflight };
  }
  if (normalized === 'null') {
    return { allowed: false, reason: 'null_origin_denied', preflight };
  }
  if (!normalized) {
    return { allowed: false, reason: 'origin_invalid', preflight };
  }
  if (normalized.includes('*')) {
    return { allowed: false, reason: 'wildcard_denied', preflight };
  }
  if (!policy.allowedOrigins.includes(normalized)) {
    return { allowed: false, reason: 'origin_not_allowlisted', preflight };
  }
  if (!preflight && !policy.allowedMethods.includes(method)) {
    return { allowed: false, reason: 'method_not_allowed', preflight };
  }
  return { allowed: true, origin: normalized, preflight };
}

export function applyPublicSigningCorsHeaders(
  setHeader: (name: string, value: string) => void,
  policy: PublicSigningCorsPolicy,
  decision: CorsDecision,
): void {
  if (!decision.allowed || !decision.origin) return;
  setHeader('Access-Control-Allow-Origin', decision.origin);
  setHeader('Vary', 'Origin');
  setHeader('Access-Control-Allow-Methods', policy.allowedMethods.join(', '));
  setHeader('Access-Control-Allow-Headers', policy.allowedHeaders.join(', '));
  if (policy.exposedHeaders.length) {
    setHeader('Access-Control-Expose-Headers', policy.exposedHeaders.join(', '));
  }
  setHeader('Access-Control-Max-Age', String(policy.maxAgeSeconds));
  if (policy.allowCredentials) {
    setHeader('Access-Control-Allow-Credentials', 'true');
  }
}
