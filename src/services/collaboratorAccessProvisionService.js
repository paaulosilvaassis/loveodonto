import { supabasePlatformClient } from '../lib/supabaseClients.js';
import { getPlatformAccessToken } from '../auth/saasSessionResolver.js';
import {
  assertAdminApiFetchAllowed,
  buildAdminApiUrl,
  formatAdminApiNetworkError,
  getConfiguredAdminApiBaseUrl,
} from '../config/adminApiBase.js';

export function isStaleAuthLinkError(message) {
  const lower = String(message || '').toLowerCase();
  return (
    lower.includes('tenant_users_user_id_required')
    || lower.includes('sem conta no auth')
    || lower.includes('conta no auth não existe')
    || lower.includes('conta no auth ausente')
    || lower.includes('falha ao ler usuário no auth')
    || lower.includes('não foi possível enviar o convite')
  );
}

function logCollabInviteClientAudit(audit = {}) {
  const payload = {
    environment: import.meta.env.MODE,
    apiBaseUrl: getConfiguredAdminApiBaseUrl() || '(proxy/dev)',
    ...audit,
  };
  if (import.meta.env?.DEV) {
    console.debug('[COLLAB_INVITE_PROD_AUDIT]', payload);
  } else {
    console.info('[COLLAB_INVITE_PROD_AUDIT]', payload);
  }
}

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
  if (lower.includes('<!doctype') || lower.includes('<html')) {
    return (
      'O servidor retornou HTML em vez de JSON. '
      + 'Verifique VITE_PLATFORM_API_BASE_URL — a URL deve apontar para a Admin API, não para o frontend.'
    );
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
  if (isStaleAuthLinkError(raw)) {
    return 'Não foi possível enviar o convite. Verifique o e-mail e tente novamente.';
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

async function parseAdminApiResponse(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const rawText = await response.text();
  if (contentType.includes('text/html') || rawText.trim().startsWith('<!')) {
    throw new Error(
      'O servidor retornou HTML em vez de JSON. '
      + 'Verifique VITE_PLATFORM_API_BASE_URL — a URL deve apontar para a Admin API, não para o frontend.',
    );
  }
  let json = {};
  if (rawText.trim()) {
    try {
      json = JSON.parse(rawText);
    } catch {
      throw new Error('Resposta inválida do backend (não é JSON).');
    }
  }
  return json;
}

async function postJson(path, payload, { auditContext = {} } = {}) {
  assertAdminApiFetchAllowed();
  const token = await getAccessTokenOrThrow();
  const url = buildAdminApiUrl(path);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload || {}),
    });
  } catch (err) {
    logCollabInviteClientAudit({
      ...auditContext,
      endpoint: path,
      apiBaseUrl: getConfiguredAdminApiBaseUrl() || url,
      error: err?.message || String(err),
    });
    throw new Error(normalizeProvisionErrorMessage(err?.message || String(err || '')));
  }
  const json = await parseAdminApiResponse(response);
  if (!response.ok) {
    const errMsg = normalizeProvisionErrorMessage(json?.message || json?.error || `Erro HTTP ${response.status}.`);
    logCollabInviteClientAudit({
      ...auditContext,
      endpoint: path,
      httpStatus: response.status,
      error: errMsg,
      response: json,
    });
    throw new Error(errMsg);
  }
  logCollabInviteClientAudit({
    ...auditContext,
    endpoint: path,
    httpStatus: response.status,
    ok: json?.ok !== false,
    authUserId: json?.authUserId || json?.tenant_user?.user_id || null,
    inviteStatus: json?.inviteStatus || json?.tenant_user?.invitation_status || null,
    inviteSent: json?.inviteSent ?? json?.emailSent ?? null,
  });
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
  const json = await parseAdminApiResponse(response);
  if (!response.ok) {
    throw new Error(normalizeProvisionErrorMessage(json?.message || json?.error || `Erro HTTP ${response.status}.`));
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
  const json = await parseAdminApiResponse(response);
  if (!response.ok) {
    throw new Error(normalizeProvisionErrorMessage(json?.message || json?.error || `Erro HTTP ${response.status}.`));
  }
  return json;
}

export async function provisionCollaboratorSystemAccess(payload, options = {}) {
  const auditContext = {
    tenantId: payload?.tenant_id || null,
    collaboratorId: payload?.collaborator_id || null,
    email: payload?.email || null,
    repairStaleAuth: payload?.repair_stale_auth === true,
    ...options.auditContext,
  };
  return postJson('/internal/app/collaborators/provision', payload, { auditContext });
}

/**
 * Provisiona acesso com reparo automático de vínculo Auth órfão (produção).
 */
export async function provisionCollaboratorAccessWithRepair(payload, { onRepairNotice } = {}) {
  const basePayload = { ...payload, send_invite: payload?.send_invite !== false };
  const needsRepair = payload?.repair_stale_auth === true
    || payload?.tenantUser?.auth_user_valid === false
    || (payload?.tenantUser?.user_id && payload?.tenantUser?.auth_user_valid === false);

  const runProvision = (body, { repaired = false } = {}) => provisionCollaboratorSystemAccess(body, {
    auditContext: {
      repaired,
      tenantId: body?.tenant_id,
      collaboratorId: body?.collaborator_id,
      email: body?.email,
    },
  });

  if (needsRepair) {
    onRepairNotice?.();
    return runProvision({ ...basePayload, repair_stale_auth: true }, { repaired: true });
  }

  try {
    return await runProvision(basePayload);
  } catch (err) {
    if (!isStaleAuthLinkError(err?.message)) throw err;
    onRepairNotice?.();
    return runProvision({ ...basePayload, repair_stale_auth: true }, { repaired: true });
  }
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
  const json = await parseAdminApiResponse(response);
  if (!response.ok) {
    throw new Error(normalizeProvisionErrorMessage(json?.message || json?.error || `Erro HTTP ${response.status}.`));
  }
  return json;
}

/** Remove vínculo do usuário com a clínica (tenant_users). Não apaga auth.users. */
export async function removeTenantUserAccess(tenantUserId, payload) {
  return deleteJson(`/internal/app/users/${encodeURIComponent(tenantUserId)}`, payload);
}

export { listCollaborators } from './collaboratorService.js';
