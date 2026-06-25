import { supabasePlatformClient } from '../lib/supabaseClients.js';
import { getPlatformAccessToken } from '../auth/saasSessionResolver.js';
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
  if (lower.includes('tenant_users_user_id_required') || lower.includes('sem conta no auth')) {
    return 'Não foi possível vincular o e-mail: a conta no Auth não existe mais. Salve o acesso novamente para recriar o convite.';
  }
  if (lower.includes('já possui acesso nesta clínica')) {
    return 'Este e-mail já possui acesso nesta clínica.';
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
  const token = await getPlatformAccessToken();
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

export async function provisionCollaboratorAccessById(collaboratorId, payload) {
  const id = String(collaboratorId || '').trim();
  if (!id) throw new Error('collaboratorId é obrigatório.');
  return postJson(`/internal/app/collaborators/${encodeURIComponent(id)}/provision-access`, {
    ...payload,
    collaborator_id: id,
    create_system_access: payload?.create_system_access !== false,
  });
}

export async function linkCollaboratorTenantAccess(payload) {
  return postJson('/internal/app/collaborators/link', payload);
}

/**
 * Persiste collaborator_id em tenant_users quando e-mail coincide (usuário criado antes do RH).
 */
export async function reconcileCollaboratorTenantLinks(tenantId, collaborators = []) {
  if (!tenantId || !Array.isArray(collaborators) || collaborators.length === 0) {
    return { linked: 0, users: [] };
  }

  const { users = [] } = await listTenantUsersAccess(tenantId);
  let linked = 0;

  for (const collaborator of collaborators) {
    const email = String(collaborator.email || '').trim().toLowerCase();
    if (!email) continue;

    const tenantUser = users.find(
      (row) => String(row.email || '').trim().toLowerCase() === email,
    );
    if (!tenantUser?.id) continue;
    if (tenantUser.collaborator_id === collaborator.id) continue;
    if (tenantUser.collaborator_id && tenantUser.collaborator_id !== collaborator.id) continue;

    try {
      await linkCollaboratorTenantAccess({
        tenant_id: tenantId,
        collaborator_id: collaborator.id,
        email,
        full_name: collaborator.nomeCompleto || collaborator.apelido || '',
      });
      linked += 1;
      tenantUser.collaborator_id = collaborator.id;
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.debug('[reconcileCollaboratorTenantLinks] falha ao vincular', {
          collaboratorId: collaborator.id,
          email,
          message: err?.message,
        });
      }
    }
  }

  if (linked > 0) {
    const refreshed = await listTenantUsersAccess(tenantId);
    return { linked, users: refreshed.users || users };
  }

  return { linked, users };
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

async function deleteJson(path, payload) {
  assertAdminApiFetchAllowed();
  const token = await getAccessTokenOrThrow();
  const response = await fetch(buildAdminApiUrl(path), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload || {}),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(normalizeProvisionErrorMessage(json?.error || `Erro HTTP ${response.status}.`));
  }
  return json;
}

/** Remove vínculo do usuário com a clínica (tenant_users). Não apaga auth.users. */
export async function removeTenantUserAccess(tenantUserId, payload) {
  return deleteJson(`/internal/app/users/${encodeURIComponent(tenantUserId)}`, payload);
}

export { listCollaborators } from './collaboratorService.js';
