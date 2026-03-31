import { supabaseAppClient } from '../lib/supabaseClients.js';

function decodeJwtPayload(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') return {};
  const parts = accessToken.split('.');
  if (parts.length < 2) return {};
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const normalized = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json = atob(normalized);
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function normalizeTenantId(value) {
  const tenantId = String(value || '').trim();
  return tenantId || '';
}

function extractTenantIdFromSession(session) {
  if (!session) return '';
  const user = session.user || {};
  const appMeta = user.app_metadata || {};
  const userMeta = user.user_metadata || {};
  const jwtPayload = decodeJwtPayload(session.access_token);

  return (
    normalizeTenantId(appMeta.tenant_id) ||
    normalizeTenantId(userMeta.tenant_id) ||
    normalizeTenantId(jwtPayload.tenant_id) ||
    normalizeTenantId(jwtPayload.app_tenant_id)
  );
}

export async function resolveTrustedTenantId({ fallbackTenantId = '' } = {}) {
  const fallback = normalizeTenantId(fallbackTenantId);
  if (!supabaseAppClient) return fallback;

  try {
    const { data, error } = await supabaseAppClient.auth.getSession();
    if (error) return fallback;
    const session = data?.session || null;
    const fromClaim = extractTenantIdFromSession(session);
    if (fromClaim) return fromClaim;

    const userId = session?.user?.id;
    if (!userId) return fallback;

    // Fallback seguro quando custom claim ainda não foi provisionada:
    // tenant_id obrigatório no perfil do usuário.
    const profileResult = await supabaseAppClient
      .from('users_profile')
      .select('tenant_id')
      .eq('id', userId)
      .maybeSingle();
    if (!profileResult.error) {
      const profileTenant = normalizeTenantId(profileResult.data?.tenant_id);
      if (profileTenant) return profileTenant;
    }
  } catch {
    return fallback;
  }

  return fallback;
}
