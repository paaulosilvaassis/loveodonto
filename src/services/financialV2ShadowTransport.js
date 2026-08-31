/**
 * PHASE 11.P — contrato estreito do shadow transport (sem SQL MCP).
 * Tenant authority vem da sessão autenticada, não do payload.
 */
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
} from '../contracts/financialV2RemoteSchemaContract.js';
import { extractSupabaseProjectRefFromUrl, getClientSupabaseUrl } from '../lib/supabaseSessionBridge.js';

export const PHASE_11P_GATE = 'FINANCIAL_V2_REAL_APP_RUNTIME_SHADOW_TRANSPORT_VALIDATED';
export const FINANCIAL_V2_SHADOW_TRANSPORT_TIMEOUT_MS = 8000;
export const FINANCIAL_V2_SHADOW_TRANSPORT_RETRIES = 0;

export const PHASE_11P_RUNTIME = {
  TARGET_DB_ENVIRONMENT: 'STAGING',
  SHADOW_TARGET_PROJECT_REF: STAGING_SUPABASE_PROJECT_REF,
  APP_RUNTIME_SHADOW_TRANSPORT: 'SUPABASE_JS_POSTGREST',
  APP_RUNTIME_AUTH_MODE: 'REAL_STAGING_AUTHENTICATED_SESSION',
  SHADOW_OPERATIONAL_AUTH: 'AUTHENTICATED_TENANT_SCOPED',
  V2_RUNTIME_SHADOW_DEFAULT: false,
  CLIENT_PAYLOAD_IS_TENANT_AUTHORITY: false,
  SERVICE_ROLE_IN_CLIENT_RUNTIME: false,
  FINANCIAL_SERVER_READ_ENABLED: false,
  FINANCIAL_SERVER_WRITE_AUTHORITY: false,
  DUAL_WRITE_ENABLED: false,
  SHADOW_NON_AUTHORITATIVE: true,
  TENANT_CUTOVER: false,
  BACKFILL_APPLIED: false,
  HISTORICAL_SHADOW_SCAN: false,
  PRODUCTION_DATABASE_CHANGED: false,
  REMOTE_SHADOW_BLOCKS_WRITER_RETURN: false,
  RETRY_STORM_RISK: 'CONTROLLED',
  SHADOW_COMPARATOR: 'compareFinancialShadow',
};

export function assertAppRuntimeEnvironmentAllowed(projectRef) {
  if (String(projectRef || '') === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error('FINANCIAL_V2_APP_RUNTIME_PRODUCTION_FORBIDDEN');
  }
  if (!projectRef) throw new Error('FINANCIAL_V2_APP_RUNTIME_ENV_REQUIRED');
  if (String(projectRef) !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error('FINANCIAL_V2_APP_RUNTIME_UNKNOWN_TARGET');
  }
  return true;
}

export function resolveClientProjectRef(client) {
  return extractSupabaseProjectRefFromUrl(getClientSupabaseUrl(client));
}

export function assertClientIsStagingOnly(client) {
  const ref = resolveClientProjectRef(client);
  return assertAppRuntimeEnvironmentAllowed(ref);
}

export function resolveTrustedSessionTenant(session) {
  if (!session?.user) {
    const error = new Error('SESSION_MISSING');
    error.code = 'SESSION_MISSING';
    throw error;
  }
  const tenantId = session.user.app_metadata?.tenant_id
    || session.user.app_metadata?.app_tenant_id
    || null;
  if (!tenantId) {
    const error = new Error('SESSION_TENANT_MISSING');
    error.code = 'SESSION_TENANT_MISSING';
    throw error;
  }
  return {
    userId: session.user.id,
    tenantId: String(tenantId),
  };
}

export function assertMappedTenantMatchesSession(mapped, sessionTenantId) {
  const payloadTenant = String(mapped?.tenant_id || mapped?.tenantId || '');
  if (payloadTenant && payloadTenant !== String(sessionTenantId)) {
    const error = new Error('CLIENT_PAYLOAD_NOT_TENANT_AUTHORITY');
    error.code = 'CLIENT_PAYLOAD_NOT_TENANT_AUTHORITY';
    throw error;
  }
  return sessionTenantId;
}

export async function withTransportTimeout(promise, ms = FINANCIAL_V2_SHADOW_TRANSPORT_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('TRANSPORT_TIMEOUT');
      error.code = 'TRANSPORT_TIMEOUT';
      reject(error);
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function sanitizeTransportTelemetry(entry) {
  const allowed = new Set([
    'tenant_id', 'entity_type', 'source_id', 'operation', 'result', 'reason_code', 'duration_ms', 'timestamp',
  ]);
  return Object.fromEntries(Object.entries(entry || {}).filter(([key]) => allowed.has(key)));
}
