import { supabasePlatformClient } from '../lib/supabaseClients.js';
import {
  assertAdminApiFetchAllowed,
  buildAdminApiUrl,
  formatAdminApiNetworkError,
} from '../config/adminApiBase.js';

function normalizeProvisionErrorMessage(message) {
  const raw = String(message || '').trim();
  const lower = raw.toLowerCase();
  if (
    lower.includes('failed to fetch')
    || lower.includes('networkerror')
    || lower.includes('fetch failed')
    || lower.includes('network request failed')
  ) {
    return formatAdminApiNetworkError();
  }
  if (lower.includes('backend saas não configurado') || lower.includes('vite_platform_api_base_url')) {
    return raw;
  }
  if (lower.includes('token do app ausente') || lower.includes('token do app inválido')) {
    return 'Sua sessão expirou ou está inválida. Faça login novamente.';
  }
  if (lower.includes('já está vinculado a outra clínica')) {
    return 'Este e-mail já está vinculado a outra clínica.';
  }
  if (lower.includes('duplicate key') || lower.includes('already exists')) {
    return 'Este e-mail já possui acesso.';
  }
  if (lower.includes('collaborator_id') && lower.includes('tenant_users') && lower.includes('schema cache')) {
    return 'Migration pendente: invitation_status/collaborator_id não existe no banco atual. Aplique a migration 005_app_collaborator_access_invites.sql no projeto Supabase do backend.';
  }
  return raw || 'Falha ao processar a operação de acesso.';
}

async function getAccessTokenOrThrow() {
  if (!supabasePlatformClient) {
    throw new Error('Supabase da plataforma não configurado para operações de acesso.');
  }
  const { data, error } = await supabasePlatformClient.auth.getSession();
  if (error) throw new Error(error.message || 'Falha ao obter sessão SaaS.');
  const token = data?.session?.access_token || '';
  if (!token) {
    throw new Error('Sessão SaaS ausente para operação de acesso.');
  }
  return token;
}

async function postJson(path, payload) {
  assertAdminApiFetchAllowed();
  const token = await getAccessTokenOrThrow();
  let response;
  try {
    response = await fetch(buildAdminApiUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload || {}),
    });
  } catch (err) {
    throw new Error(normalizeProvisionErrorMessage(err?.message || String(err || '')));
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(normalizeProvisionErrorMessage(json?.error || `Erro HTTP ${response.status}.`));
  }
  return json;
}

async function getJson(path) {
  assertAdminApiFetchAllowed();
  const token = await getAccessTokenOrThrow();
  let response;
  try {
    response = await fetch(buildAdminApiUrl(path), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (err) {
    throw new Error(normalizeProvisionErrorMessage(err?.message || String(err || '')));
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(normalizeProvisionErrorMessage(json?.error || `Erro HTTP ${response.status}.`));
  }
  return json;
}

async function patchJson(path, payload) {
  assertAdminApiFetchAllowed();
  const token = await getAccessTokenOrThrow();
  const response = await fetch(buildAdminApiUrl(path), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload || {}),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error || `Erro HTTP ${response.status}.`);
  }
  return json;
}

export async function provisionCollaboratorSystemAccess(payload) {
  return postJson('/internal/app/collaborators/provision', payload);
}

export async function createTenantUserAccess(payload) {
  return postJson('/internal/app/users/create', payload);
}

export async function resendCollaboratorInvite(payload) {
  return postJson('/internal/app/invitations/resend', payload);
}

export async function reconcileOwnInvitationAcceptance() {
  return postJson('/internal/app/invitations/reconcile', {});
}

export async function setCollaboratorSystemAccess(collaboratorId, payload) {
  return patchJson(`/internal/app/collaborators/${encodeURIComponent(collaboratorId)}/access`, payload);
}

/** Salva credenciais, perfil e overrides de permissão no Supabase (tenant_users + Auth app_metadata). */
export async function saveCollaboratorAccessBundle(payload) {
  return postJson('/internal/app/collaborators/access-bundle', payload);
}

export async function listTenantUsersAccess(tenantId) {
  const query = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  return getJson(`/internal/app/users/list${query}`);
}

export async function setTenantUserSystemAccess(tenantUserId, payload) {
  return patchJson(`/internal/app/users/${encodeURIComponent(tenantUserId)}/access`, payload);
}
