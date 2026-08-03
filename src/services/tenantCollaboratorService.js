/**
 * Fonte oficial de colaboradores por tenant (SaaS).
 * Autoridade: API Supabase (tenant_users) + enriquecimento RH local (IndexedDB) com tenant_id válido.
 * IndexedDB nunca é autoridade quando a API responde — apenas cache derivado.
 */
import { isAgendaProfessional } from '../constants/collaboratorRhCatalog.js';
import { withDb } from '../db/index.js';
import { listTenantUsersAccess, reconcileCollaboratorTenantLinks } from './collaboratorAccessProvisionService.js';
import { readGetPrimaryPhone, readListCollaboratorsByTenant } from './collaboratorServiceReadAdapter.js';
import { normalizeTenantId } from './tenantIsolation.js';
import { isSaasModeEnabled } from './saasAuthService.js';
import { getUserAvatarUrl } from '../utils/avatarUtils.js';
import { resolveCollaboratorAccessDisplayStatus } from '../utils/inviteStatus.js';

const SAAS_SYNTHETIC_PREFIX = 'col-saas-';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function parseTimestamp(value) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function isSyntheticCollaboratorId(id) {
  return String(id || '').startsWith(SAAS_SYNTHETIC_PREFIX);
}

function countPermissions(tenantUser) {
  if (!tenantUser) return 0;
  if (tenantUser.has_custom_permissions && tenantUser.custom_permissions) {
    return Object.values(tenantUser.custom_permissions).filter((v) => v === true).length;
  }
  const overrides = tenantUser.permission_overrides || tenantUser.permissionOverrides;
  if (overrides && typeof overrides === 'object') {
    return Object.values(overrides).filter((v) => v === true).length;
  }
  return 0;
}

function resolveAccessStatusKey(tenantUser) {
  if (!tenantUser?.id) return 'none';
  return resolveCollaboratorAccessDisplayStatus(tenantUser).key;
}

function resolvePrimaryPhone(collaboratorId) {
  return readGetPrimaryPhone(collaboratorId);
}

function buildLocalLookup(localRows) {
  const byId = new Map();
  const byEmail = new Map();
  for (const row of localRows) {
    if (row?.id) byId.set(row.id, row);
    const email = normalizeEmail(row?.email);
    if (email && !byEmail.has(email)) byEmail.set(email, row);
  }
  return { byId, byEmail };
}

function resolveLocalForTenantUser(tenantUser, lookup) {
  const collabId = String(tenantUser?.collaborator_id || '').trim();
  if (collabId && lookup.byId.has(collabId)) {
    return lookup.byId.get(collabId);
  }
  const email = normalizeEmail(tenantUser?.email);
  if (email && lookup.byEmail.has(email)) {
    return lookup.byEmail.get(email);
  }
  return null;
}

function resolveCollaboratorId(tenantUser, local) {
  const fromApi = String(tenantUser?.collaborator_id || '').trim();
  const fromLocal = String(local?.id || '').trim();
  if (fromApi) return fromApi;
  if (fromLocal && !isSyntheticCollaboratorId(fromLocal)) return fromLocal;
  if (fromLocal) return fromLocal;
  const email = normalizeEmail(tenantUser?.email);
  if (email) return `${SAAS_SYNTHETIC_PREFIX}${email.replace(/[^a-z0-9]/g, '-').slice(0, 48)}`;
  return `col-remote-${String(tenantUser?.id || '').slice(0, 8)}`;
}

/**
 * Normaliza linha unificada colaborador + acesso.
 */
export function normalizeTenantCollaboratorRow({
  tenantId,
  tenantUser = null,
  local = null,
} = {}) {
  const tid = normalizeTenantId(tenantId);
  const collaboratorId = resolveCollaboratorId(tenantUser, local);
  const email = normalizeEmail(tenantUser?.email || local?.email);
  const fullName = String(
    local?.nomeCompleto
    || tenantUser?.full_name
    || local?.apelido
    || email.split('@')[0]
    || 'Colaborador',
  ).trim();
  const displayName = String(local?.apelido || fullName.split(' ')[0] || fullName).trim();
  const category = String(local?.rhCategoria || '').trim();
  const roleTitle = String(local?.cargo || '').trim();
  const specialties = Array.isArray(local?.especialidades)
    ? local.especialidades.filter(Boolean)
    : [];
  const specialty = specialties.join(', ');
  const rhStatus = String(local?.status || (tenantUser?.is_active === false ? 'inativo' : 'ativo')).toLowerCase();
  const roleSlug = String(tenantUser?.role || tenantUser?.role_slug || local?.role || 'atendimento').trim();
  const remoteUpdatedAt = tenantUser?.updated_at || null;
  const localUpdatedAt = local?.updatedAt || local?.updated_at || null;
  const updatedAt = remoteUpdatedAt || localUpdatedAt || new Date().toISOString();
  const avatarUrl = getUserAvatarUrl(local) || getUserAvatarUrl(tenantUser) || '';
  const phone = resolvePrimaryPhone(collaboratorId);

  const row = {
    collaborator_id: collaboratorId,
    tenant_id: tid,
    full_name: fullName,
    display_name: displayName,
    category,
    role_title: roleTitle,
    specialty,
    rh_status: rhStatus === 'inativo' ? 'inativo' : 'ativo',
    access_status: resolveAccessStatusKey(tenantUser),
    user_id: tenantUser?.user_id || null,
    email,
    phone,
    avatar_url: avatarUrl,
    photo_url: String(local?.fotoUrl || local?.photo_url || avatarUrl || '').trim(),
    role_slug: roleSlug,
    has_custom_permissions: Boolean(tenantUser?.has_custom_permissions),
    permissions_count: countPermissions(tenantUser),
    agenda_enabled: isAgendaProfessional(local || { rhCategoria: category, cargo: roleTitle }),
    updated_at: updatedAt,
    _tenantUser: tenantUser || null,
    _localUpdatedAt: localUpdatedAt,
    _remoteUpdatedAt: remoteUpdatedAt,
  };

  return row;
}

/** Compatibilidade com componentes legados (CollaboratorsPage, maps RH). */
export function toLegacyCollaboratorShape(normalized) {
  if (!normalized) return null;
  const specialties = normalized.specialty
    ? normalized.specialty.split(', ').filter(Boolean)
    : [];
  return {
    id: normalized.collaborator_id,
    tenant_id: normalized.tenant_id,
    nomeCompleto: normalized.full_name,
    apelido: normalized.display_name,
    nomeSocial: '',
    rhCategoria: normalized.category,
    cargo: normalized.role_title,
    especialidades: specialties,
    status: normalized.rh_status,
    email: normalized.email,
    fotoUrl: normalized.photo_url || normalized.avatar_url,
    updatedAt: normalized.updated_at,
    _tenantUser: normalized._tenantUser,
  };
}

function shouldDiscardLocalRow(local, tenantId) {
  const rowTenant = normalizeTenantId(local?.tenant_id || local?.tenantId);
  if (!rowTenant) return true;
  return rowTenant !== tenantId;
}

function isLocalStaleVsRemote(local, remoteUpdatedAt) {
  if (!remoteUpdatedAt) return false;
  const localAt = local?.updatedAt || local?.updated_at;
  if (!localAt) return true;
  return parseTimestamp(localAt) < parseTimestamp(remoteUpdatedAt);
}

/**
 * Persiste cache local derivado da API (acesso + vínculos). Não sobrescreve RH completo
 * quando o registro local é mais recente que o remoto.
 */
function persistTenantCollaboratorsCache(tenantId, normalizedRows) {
  const tid = normalizeTenantId(tenantId);
  if (!tid || !Array.isArray(normalizedRows) || normalizedRows.length === 0) return;

  withDb((db) => {
    db.collaborators = db.collaborators || [];
    db.collaboratorAccess = db.collaboratorAccess || [];

    for (const row of normalizedRows) {
      const collabId = row.collaborator_id;
      if (!collabId) continue;

      const idx = db.collaborators.findIndex((c) => c.id === collabId);
      const email = normalizeEmail(row.email);
      const byEmailIdx = email
        ? db.collaborators.findIndex((c) => normalizeEmail(c.email) === email)
        : -1;
      const localIdx = idx >= 0 ? idx : byEmailIdx;
      const prev = localIdx >= 0 ? db.collaborators[localIdx] : null;
      const remoteNewer = isLocalStaleVsRemote(prev, row._remoteUpdatedAt);

      const baseRecord = {
        id: collabId,
        tenant_id: tid,
        status: row.rh_status,
        apelido: row.display_name,
        nomeCompleto: row.full_name,
        nomeSocial: prev?.nomeSocial || '',
        sexo: prev?.sexo || '',
        dataNascimento: prev?.dataNascimento || '',
        fotoUrl: row.photo_url || prev?.fotoUrl || '',
        email: row.email,
        rhCategoria: prev?.rhCategoria || row.category || '',
        cargo: prev?.cargo || row.role_title || '',
        tipoVinculo: prev?.tipoVinculo || '',
        setor: prev?.setor || '',
        especialidades: prev?.especialidades || (row.specialty ? row.specialty.split(', ').filter(Boolean) : []),
        registroProfissional: prev?.registroProfissional || '',
        conselhoNome: prev?.conselhoNome || '',
        conselhoUf: prev?.conselhoUf || '',
        rhFuncaoDescricao: prev?.rhFuncaoDescricao || '',
        createdAt: prev?.createdAt || new Date().toISOString(),
        updatedAt: row.updated_at,
      };

      if (localIdx >= 0) {
        if (remoteNewer && prev) {
          db.collaborators[localIdx] = {
            ...prev,
            ...baseRecord,
            rhCategoria: prev.rhCategoria || baseRecord.rhCategoria,
            cargo: prev.cargo || baseRecord.cargo,
            tipoVinculo: prev.tipoVinculo || baseRecord.tipoVinculo,
            setor: prev.setor || baseRecord.setor,
            especialidades: prev.especialidades?.length ? prev.especialidades : baseRecord.especialidades,
            fotoUrl: prev.fotoUrl || baseRecord.fotoUrl,
          };
        } else {
          db.collaborators[localIdx] = {
            ...baseRecord,
            ...prev,
            id: prev.id || collabId,
            tenant_id: tid,
            email,
            updatedAt: row.updated_at,
          };
        }
      } else {
        db.collaborators.push(baseRecord);
      }

      if (row._tenantUser?.user_id) {
        const userId = String(row._tenantUser.user_id).trim();
        db.collaboratorAccess = (db.collaboratorAccess || []).filter(
          (item) => item.collaboratorId !== collabId && item.userId !== userId,
        );
        db.collaboratorAccess.push({
          collaboratorId: collabId,
          userId,
          tenant_id: tid,
          role: row.role_slug || row._tenantUser.role || 'atendimento',
          permissions: [],
          lastLoginAt: row._tenantUser.last_sign_in_at || '',
        });
      }
    }

    db.collaborators = db.collaborators.filter((c) => {
      if (shouldDiscardLocalRow(c, tid)) return false;
      return true;
    });

    return db;
  });
}

/**
 * Lista colaboradores oficiais do tenant.
 * @param {string} tenantId
 * @param {{ legacy?: boolean, reconcileLinks?: boolean, bundle?: boolean }} [options]
 * @returns {Promise<Array|{ rows: Array, collaborators: Array, tenantUsers: Array }>}
 */
export async function listTenantCollaborators(tenantId, options = {}) {
  const tid = normalizeTenantId(tenantId);
  if (!tid) {
    const err = new Error('tenant_id é obrigatório para listar colaboradores da clínica.');
    err.code = 'TENANT_REQUIRED';
    throw err;
  }

  if (!isSaasModeEnabled()) {
    const localRows = readListCollaboratorsByTenant(tid);
    const normalized = localRows.map((local) => normalizeTenantCollaboratorRow({
      tenantId: tid,
      tenantUser: null,
      local,
    }));
    const legacy = normalized.map(toLegacyCollaboratorShape);
    if (options.bundle) {
      return { rows: normalized, collaborators: legacy, tenantUsers: [] };
    }
    return options.legacy === false ? normalized : legacy;
  }

  let apiResult;
  try {
    apiResult = await listTenantUsersAccess(tid);
  } catch (err) {
    const message = err?.message || 'Não foi possível carregar colaboradores da clínica.';
    const wrapped = new Error(message);
    wrapped.code = err?.code || 'TENANT_COLLABORATORS_FETCH_FAILED';
    wrapped.cause = err;
    throw wrapped;
  }

  let tenantUsers = Array.isArray(apiResult?.users)
    ? apiResult.users.filter((u) => normalizeTenantId(u?.tenant_id || tid) === tid)
    : [];

  let localRows = readListCollaboratorsByTenant(tid);

  if (options.reconcileLinks === true && localRows.length > 0) {
    try {
      const reconciled = await reconcileCollaboratorTenantLinks(tid, localRows);
      if (Array.isArray(reconciled?.users) && reconciled.users.length > 0) {
        tenantUsers = reconciled.users.filter((u) => normalizeTenantId(u?.tenant_id || tid) === tid);
      }
    } catch {
      /* API permanece autoritativa */
    }
  }

  localRows = readListCollaboratorsByTenant(tid);
  const lookup = buildLocalLookup(localRows);
  const seenIds = new Set();
  const normalizedRows = [];

  for (const tenantUser of tenantUsers) {
    const local = resolveLocalForTenantUser(tenantUser, lookup);
    const normalized = normalizeTenantCollaboratorRow({
      tenantId: tid,
      tenantUser,
      local,
    });
    normalizedRows.push(normalized);
    seenIds.add(normalized.collaborator_id);
    if (local?.id) seenIds.add(local.id);
  }

  for (const local of localRows) {
    if (!local?.id || seenIds.has(local.id)) continue;
    if (shouldDiscardLocalRow(local, tid)) continue;
    const email = normalizeEmail(local.email);
    const alreadyByEmail = normalizedRows.some((r) => normalizeEmail(r.email) === email && email);
    if (alreadyByEmail) continue;
    normalizedRows.push(normalizeTenantCollaboratorRow({
      tenantId: tid,
      tenantUser: null,
      local,
    }));
    seenIds.add(local.id);
  }

  normalizedRows.sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'));

  try {
    persistTenantCollaboratorsCache(tid, normalizedRows);
  } catch (err) {
    if (import.meta.env?.DEV) {
      console.debug('[listTenantCollaborators] falha ao persistir cache', err?.message);
    }
  }

  const legacy = normalizedRows.map(toLegacyCollaboratorShape);

  if (options.bundle) {
    return {
      rows: normalizedRows,
      collaborators: legacy,
      tenantUsers,
    };
  }
  return options.legacy === false ? normalizedRows : legacy;
}
