import { getPlatformAccessToken } from '../auth/saasSessionResolver.js';
import {
  assertAdminApiFetchAllowed,
  buildAdminApiUrl,
  formatAdminApiNetworkError,
} from '../config/adminApiBase.js';

async function identityFetch(path, { method = 'GET', body, tenantId } = {}) {
  assertAdminApiFetchAllowed();
  const token = await getPlatformAccessToken();
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');

  const url = buildAdminApiUrl(path);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(formatAdminApiNetworkError(err?.message));
  }

  const raw = await response.text();
  let json = {};
  if (raw.trim()) {
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error('Resposta inválida do servidor de identidades.');
    }
  }
  if (!response.ok) {
    throw new Error(json?.message || json?.error || 'Falha na operação de identidade.');
  }
  return json;
}

export async function fetchIdentityByCollaborator({ tenantId, collaboratorId, email }) {
  const params = new URLSearchParams({ tenant_id: tenantId });
  const list = await identityFetch(`/internal/app/identities?${params.toString()}`);
  const identities = list?.identities || [];
  return identities.find((row) => row.collaborator_id === collaboratorId)
    || identities.find((row) => String(row.email || '').toLowerCase() === String(email || '').toLowerCase())
    || null;
}

export async function fetchIdentity(id, tenantId) {
  const params = new URLSearchParams({ tenant_id: tenantId });
  const result = await identityFetch(`/internal/app/identities/${encodeURIComponent(id)}?${params.toString()}`);
  return result?.identity || null;
}

export async function fetchIdentityHealthSummary(tenantId) {
  const params = new URLSearchParams({ tenant_id: tenantId });
  return identityFetch(`/internal/app/identity-health?${params.toString()}`);
}

export async function listIdentities(tenantId, { limit = 100, offset = 0, health = null, status = null } = {}) {
  const params = new URLSearchParams({ tenant_id: tenantId, limit: String(limit), offset: String(offset) });
  if (health) params.set('health', health);
  if (status) params.set('status', status);
  return identityFetch(`/internal/app/identities?${params.toString()}`);
}

export async function provisionIdentity(payload) {
  return identityFetch('/internal/app/identities/provision', { method: 'POST', body: payload });
}

export async function repairIdentity(identityId, payload) {
  return identityFetch(`/internal/app/identities/${encodeURIComponent(identityId)}/repair`, {
    method: 'POST',
    body: payload,
  });
}

export async function resendIdentityInvite(identityId, payload) {
  return identityFetch(`/internal/app/identities/${encodeURIComponent(identityId)}/resend-invite`, {
    method: 'POST',
    body: payload,
  });
}

export async function resetIdentityPassword(identityId, payload) {
  return identityFetch(`/internal/app/identities/${encodeURIComponent(identityId)}/reset-password`, {
    method: 'POST',
    body: payload,
  });
}

export async function deactivateIdentity(identityId, payload) {
  return identityFetch(`/internal/app/identities/${encodeURIComponent(identityId)}/deactivate`, {
    method: 'POST',
    body: payload,
  });
}

export async function reactivateIdentity(identityId, payload) {
  return identityFetch(`/internal/app/identities/${encodeURIComponent(identityId)}/reactivate`, {
    method: 'POST',
    body: payload,
  });
}

export async function revokeIdentitySessions(identityId, payload) {
  return identityFetch(`/internal/app/identities/${encodeURIComponent(identityId)}/revoke-sessions`, {
    method: 'POST',
    body: payload,
  });
}

export async function fetchIdentityEvents(identityId, tenantId, limit = 20) {
  const params = new URLSearchParams({ tenant_id: tenantId, limit: String(limit) });
  return identityFetch(`/internal/app/identities/${encodeURIComponent(identityId)}/events?${params.toString()}`);
}

export async function fetchIdentityReasons() {
  return identityFetch('/internal/app/identity/reasons');
}

export async function evaluateIdentityHealth(tenantId) {
  return identityFetch('/internal/app/identity-health/evaluate', {
    method: 'POST',
    body: { tenant_id: tenantId },
  });
}

export const IDENTITY_STATUS_LABELS = {
  active: 'Ativo',
  invitation_pending: 'Convite pendente',
  password_pending: 'Senha pendente',
  password_reset_sent: 'Reset enviado',
  suspended: 'Suspenso',
  disabled: 'Desativado',
  broken_link: 'Vínculo quebrado',
  repaired: 'Reparado',
  waiting_sync: 'Aguardando sync',
};

export const IDENTITY_HEALTH_LABELS = {
  healthy: 'Saudável',
  needs_repair: 'Precisa de reparo',
  auth_missing: 'Auth ausente',
  tenant_user_missing: 'Tenant user ausente',
  collaborator_link_missing: 'Colaborador não vinculado',
  role_mismatch: 'Perfil divergente',
  email_mismatch: 'E-mail divergente',
  permissions_outdated: 'Permissões desatualizadas',
};
