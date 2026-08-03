/**
 * Phase 4.4 — GET /internal/app/collaborators/:id/permissions (read-only).
 * Supabase + Auth app_metadata; zero IndexedDB; zero writes.
 * Phase 4.10 Wave 2A — tenant admin delegado a server/core/tenant.
 */

import {
  CollaboratorsListForbiddenError,
  CollaboratorsListQueryError,
  FORBIDDEN_TENANT_IDS,
  assertNoTenantIdQueryParam,
} from './collaboratorsApiList.js';
import { resolveAdminTenantContext } from '../core/tenant/resolveTenantContext.js';
import { TenantCoreForbiddenError } from '../core/tenant/errors.js';

export const PRODUCTION_PROJECT_REF = 'uoepkwhqztmsjnzirpev';
export const PERMISSIONS_ADMIN_FORBIDDEN_MESSAGE = 'Apenas administradores da clínica podem consultar permissões.';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const COLLABORATOR_SUMMARY_SELECT = [
  'id',
  'tenant_id',
  'legacy_id',
  'email',
  'apelido',
  'nome_completo',
  'status',
].join(', ');

const TENANT_USER_LINK_SELECT = [
  'id',
  'tenant_id',
  'user_id',
  'email',
  'role',
  'role_slug',
  'status',
  'is_active',
  'has_system_access',
  'collaborator_id',
  'collaborator_uuid',
  'has_custom_permissions',
  'invitation_status',
].join(', ');

export class CollaboratorPermissionsNotFoundError extends Error {
  constructor(message = 'Colaborador não encontrado neste tenant.') {
    super(message);
    this.name = 'CollaboratorPermissionsNotFoundError';
    this.code = 'COLLABORATOR_NOT_FOUND';
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeRoleValue(value, fallback = 'atendimento') {
  const role = normalizeText(value).toLowerCase();
  return role || fallback;
}

function readPermissionMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

export function extractPermissionFieldsFromAppMetadata(appMetadata) {
  const meta = appMetadata && typeof appMetadata === 'object' ? appMetadata : {};
  const permissionOverrides = readPermissionMap(meta.permission_overrides) || {};
  const hasCustomPermissions = meta.has_custom_permissions === true;
  const customPermissions = hasCustomPermissions
    ? readPermissionMap(meta.custom_permissions)
    : null;
  return {
    has_custom_permissions: hasCustomPermissions,
    custom_permissions: customPermissions,
    permission_overrides: permissionOverrides,
  };
}

export function sparseOverridesFromEffectiveMap(customPermissions, roleDefaultSet) {
  const sparse = {};
  if (!customPermissions || typeof customPermissions !== 'object') return sparse;
  for (const [permId, allowed] of Object.entries(customPermissions)) {
    if (typeof allowed !== 'boolean') continue;
    const base = roleDefaultSet.has(permId);
    if (allowed !== base) sparse[permId] = allowed;
  }
  return sparse;
}

export function effectiveMapFromSparseOverrides(sparseOverrides, roleDefaultSet, catalogIds) {
  const sparse = sparseOverrides && typeof sparseOverrides === 'object' ? sparseOverrides : {};
  const map = {};
  for (const permId of catalogIds) {
    map[permId] = sparse[permId] !== undefined
      ? sparse[permId]
      : roleDefaultSet.has(permId);
  }
  return map;
}

export function resolvePermissionStateFromSources({
  tenantUser,
  appMetadata,
  catalogIds,
  roleDefaultIds,
}) {
  const role = normalizeRoleValue(tenantUser?.role || tenantUser?.role_slug);
  const roleDefaultSet = new Set(roleDefaultIds);
  const fromMeta = extractPermissionFieldsFromAppMetadata(appMetadata || {});
  const explicitHasCustom = tenantUser?.has_custom_permissions === true
    || fromMeta.has_custom_permissions;
  const explicitCustom = readPermissionMap(tenantUser?.custom_permissions)
    || fromMeta.custom_permissions;
  const sparseOverrides = readPermissionMap(tenantUser?.permission_overrides)
    || fromMeta.permission_overrides
    || {};

  if (explicitHasCustom && explicitCustom) {
    const effective = { ...explicitCustom };
    for (const permId of catalogIds) {
      if (typeof effective[permId] !== 'boolean') {
        effective[permId] = roleDefaultSet.has(permId);
      }
    }
    return {
      role,
      has_custom_permissions: true,
      custom_permissions: explicitCustom,
      permission_overrides: sparseOverridesFromEffectiveMap(explicitCustom, roleDefaultSet),
      effective_permissions: effective,
    };
  }

  if (Object.keys(sparseOverrides).length > 0) {
    const effective = effectiveMapFromSparseOverrides(sparseOverrides, roleDefaultSet, catalogIds);
    return {
      role,
      has_custom_permissions: true,
      custom_permissions: effective,
      permission_overrides: sparseOverrides,
      effective_permissions: effective,
    };
  }

  const effective = effectiveMapFromSparseOverrides({}, roleDefaultSet, catalogIds);
  return {
    role,
    has_custom_permissions: false,
    custom_permissions: {},
    permission_overrides: {},
    effective_permissions: effective,
  };
}

export function countAllowedPermissions(effectivePermissions) {
  return Object.values(effectivePermissions || {}).filter((v) => v === true).length;
}

export function mapCollaboratorSummary(row) {
  const tenantId = normalizeText(row?.tenant_id);
  if (!tenantId || FORBIDDEN_TENANT_IDS.has(tenantId.toLowerCase())) {
    throw new CollaboratorsListForbiddenError('tenant_id proibido.', 'TENANT_FORBIDDEN');
  }
  if (row?.deleted_at) {
    throw new CollaboratorPermissionsNotFoundError();
  }
  return {
    id: row.id,
    tenant_id: tenantId,
    legacy_id: row.legacy_id ?? null,
    email: row.email ?? null,
    apelido: row.apelido,
    nome_completo: row.nome_completo,
    status: row.status,
  };
}

function scoreTenantUserMatch(tu, collaborator) {
  const email = normalizeEmail(collaborator.email);
  if (tu.collaborator_uuid && tu.collaborator_uuid === collaborator.id) return 40;
  if (collaborator.legacy_id && tu.collaborator_id === collaborator.legacy_id) return 30;
  if (tu.collaborator_id === collaborator.id) return 20;
  if (email && normalizeEmail(tu.email) === email) return 10;
  return 0;
}

export function pickLinkedTenantUser(rows, collaborator) {
  const matches = (rows || [])
    .map((row) => ({ row, score: scoreTenantUserMatch(row, collaborator) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return matches[0]?.row || null;
}

export function buildAccessBlock(collaborator, tenantUser) {
  if (!tenantUser) {
    return {
      linked: false,
      tenant_user_id: null,
      user_id: null,
      system_status: 'none',
      has_system_access: false,
      membership_status: null,
      rh_status: collaborator.status,
      role_slug: null,
      invitation_status: 'none',
    };
  }

  const membershipStatus = String(tenantUser.status || (tenantUser.is_active === false ? 'inactive' : 'active')).toLowerCase();
  const hasSystemAccess = tenantUser.has_system_access !== false
    && tenantUser.is_active !== false
    && membershipStatus !== 'inactive';
  const systemStatus = hasSystemAccess ? 'active' : 'inactive';

  return {
    linked: true,
    tenant_user_id: tenantUser.id,
    user_id: tenantUser.user_id || null,
    system_status: systemStatus,
    has_system_access: hasSystemAccess,
    membership_status: membershipStatus,
    rh_status: collaborator.status,
    role_slug: normalizeRoleValue(tenantUser.role || tenantUser.role_slug),
    invitation_status: tenantUser.invitation_status || 'none',
  };
}

export async function loadPermissionCatalogIds(supabase) {
  const { data, error } = await supabase
    .from('permission_catalog')
    .select('id')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => row.id);
}

export async function loadRoleDefaultIds(supabase, roleSlug) {
  const role = normalizeRoleValue(roleSlug);
  const { data, error } = await supabase
    .from('role_permission_defaults')
    .select('permission_id')
    .eq('role_slug', role);
  if (error) throw error;
  return (data || []).map((row) => row.permission_id);
}

async function fetchCollaboratorByFilter(supabase, tenantId, applyFilter) {
  let query = supabase
    .from('collaborators')
    .select(COLLABORATOR_SUMMARY_SELECT)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);
  query = applyFilter(query);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function resolveCollaboratorInTenant(supabase, tenantId, idParam) {
  const ref = normalizeText(idParam);
  if (!ref) {
    throw new CollaboratorsListQueryError('Identificador de colaborador inválido.', 'INVALID_COLLABORATOR_ID');
  }

  if (UUID_RE.test(ref)) {
    const byUuid = await fetchCollaboratorByFilter(supabase, tenantId, (q) => q.eq('id', ref));
    if (byUuid) {
      return { collaborator: mapCollaboratorSummary(byUuid), resolved_by: 'uuid' };
    }

    const { data: tuByUuid, error: tuErr } = await supabase
      .from('tenant_users')
      .select('collaborator_uuid')
      .eq('tenant_id', tenantId)
      .eq('collaborator_uuid', ref)
      .maybeSingle();
    if (tuErr) throw tuErr;
    if (tuByUuid?.collaborator_uuid) {
      const linked = await fetchCollaboratorByFilter(
        supabase,
        tenantId,
        (q) => q.eq('id', tuByUuid.collaborator_uuid),
      );
      if (linked) {
        return { collaborator: mapCollaboratorSummary(linked), resolved_by: 'tenant_user_uuid' };
      }
    }
  }

  const byLegacy = await fetchCollaboratorByFilter(supabase, tenantId, (q) => q.eq('legacy_id', ref));
  if (byLegacy) {
    return { collaborator: mapCollaboratorSummary(byLegacy), resolved_by: 'legacy_id' };
  }

  const { data: tuByLegacyText, error: tuLegacyErr } = await supabase
    .from('tenant_users')
    .select('collaborator_uuid, collaborator_id')
    .eq('tenant_id', tenantId)
    .eq('collaborator_id', ref);
  if (tuLegacyErr) throw tuLegacyErr;
  if (Array.isArray(tuByLegacyText) && tuByLegacyText.length === 1 && tuByLegacyText[0]?.collaborator_uuid) {
    const linked = await fetchCollaboratorByFilter(
      supabase,
      tenantId,
      (q) => q.eq('id', tuByLegacyText[0].collaborator_uuid),
    );
    if (linked) {
      return { collaborator: mapCollaboratorSummary(linked), resolved_by: 'tenant_user_text' };
    }
  }

  throw new CollaboratorPermissionsNotFoundError();
}

export async function resolveLinkedTenantUser(supabase, tenantId, collaborator) {
  const { data, error } = await supabase
    .from('tenant_users')
    .select(TENANT_USER_LINK_SELECT)
    .eq('tenant_id', tenantId);
  if (error) throw error;

  const email = normalizeEmail(collaborator.email);
  let picked = pickLinkedTenantUser(data, collaborator);

  if (!picked && email) {
    const emailMatches = (data || []).filter((row) => normalizeEmail(row.email) === email);
    if (emailMatches.length === 1) {
      picked = emailMatches[0];
    }
  }

  return picked;
}

export async function resolveAdminTenantForPermissions({
  authUserId,
  getTenantAdminActorOrThrow,
  resolveActiveTenantUser,
}) {
  if (!authUserId) {
    throw new CollaboratorsListForbiddenError('Sessão ausente.', 'AUTH_REQUIRED');
  }

  if (typeof resolveActiveTenantUser === 'function') {
    try {
      const ctx = await resolveAdminTenantContext({
        authUserId,
        resolveActiveTenantUser,
        adminForbiddenMessage: PERMISSIONS_ADMIN_FORBIDDEN_MESSAGE,
      });
      return ctx.tenantId;
    } catch (err) {
      if (err instanceof TenantCoreForbiddenError) {
        throw new CollaboratorsListForbiddenError(err.message, err.code);
      }
      throw err;
    }
  }

  try {
    const actor = await getTenantAdminActorOrThrow(authUserId, '');
    const tenantId = normalizeText(actor.tenant_id);
    if (!tenantId || FORBIDDEN_TENANT_IDS.has(tenantId.toLowerCase())) {
      throw new CollaboratorsListForbiddenError('tenant_id proibido.', 'TENANT_FORBIDDEN');
    }
    return tenantId;
  } catch (err) {
    const message = String(err?.message || '').toLowerCase();
    if (err?.code === 'TENANT_AMBIGUOUS' || message.includes('múltiplas clínicas')) {
      throw new CollaboratorsListForbiddenError(
        'Usuário vinculado a múltiplas clínicas.',
        'TENANT_AMBIGUOUS',
      );
    }
    if (message.includes('administradores')) {
      throw new CollaboratorsListForbiddenError(
        PERMISSIONS_ADMIN_FORBIDDEN_MESSAGE,
        'ADMIN_REQUIRED',
      );
    }
    throw new CollaboratorsListForbiddenError(
      'Usuário sem vínculo ativo em tenant_users.',
      'TENANT_MEMBERSHIP_REQUIRED',
    );
  }
}

export async function buildCollaboratorPermissionsPayload({
  supabase,
  tenantId,
  collaborator,
  tenantUser,
  getAuthUserMeta,
  isTenantAdminRole,
}) {
  const catalogIds = await loadPermissionCatalogIds(supabase);
  if (catalogIds.length === 0) {
    throw new Error('permission_catalog vazio.');
  }

  const access = buildAccessBlock(collaborator, tenantUser);
  if (!access.linked || !tenantUser?.user_id) {
    return {
      collaborator,
      access,
      permissions: {
        catalog_count: catalogIds.length,
        role_default_count: 0,
        effective_allowed_count: 0,
        has_custom_permissions: false,
        is_full_custom: false,
        admin_bypass: false,
        role_template: null,
        role_defaults: [],
        custom_permissions: {},
        permission_overrides: {},
        effective_permissions: {},
      },
      sources: {
        permission_catalog: 'supabase',
        role_permission_defaults: 'supabase',
        tenant_user_permissions: 'not_migrated',
        custom_permissions: 'none',
      },
    };
  }

  const roleSlug = access.role_slug;
  const roleDefaultIds = await loadRoleDefaultIds(supabase, roleSlug);
  const authMeta = await getAuthUserMeta(tenantUser.user_id);
  const permissionState = resolvePermissionStateFromSources({
    tenantUser: {
      ...tenantUser,
      ...extractPermissionFieldsFromAppMetadata(authMeta?.app_metadata || {}),
    },
    appMetadata: authMeta?.app_metadata || {},
    catalogIds,
    roleDefaultIds,
  });

  let effectivePermissions = { ...permissionState.effective_permissions };
  const adminBypass = isTenantAdminRole(roleSlug) && access.has_system_access;
  if (adminBypass) {
    effectivePermissions = Object.fromEntries(catalogIds.map((id) => [id, true]));
  }

  const effectiveAllowedCount = countAllowedPermissions(effectivePermissions);

  return {
    collaborator,
    access,
    permissions: {
      catalog_count: catalogIds.length,
      role_default_count: roleDefaultIds.length,
      effective_allowed_count: effectiveAllowedCount,
      has_custom_permissions: permissionState.has_custom_permissions,
      is_full_custom: effectiveAllowedCount === catalogIds.length,
      admin_bypass: adminBypass,
      role_template: roleSlug,
      role_defaults: roleDefaultIds,
      custom_permissions: permissionState.custom_permissions || {},
      permission_overrides: permissionState.permission_overrides || {},
      effective_permissions: effectivePermissions,
    },
    sources: {
      permission_catalog: 'supabase',
      role_permission_defaults: 'supabase',
      tenant_user_permissions: 'not_migrated',
      custom_permissions: 'app_metadata',
    },
  };
}

export function createCollaboratorPermissionsHandler(deps) {
  const {
    supabase,
    getTenantAdminActorOrThrow,
    resolveActiveTenantUser,
    getAuthUserMeta,
    isTenantAdminRole,
  } = deps;

  return async function collaboratorPermissionsHandler(req, res) {
    const started = Date.now();
    const logPayload = {
      tenant_id: null,
      user_id: req.appAuthUser?.id || null,
      collaborator_ref: normalizeText(req.params?.id),
      resolved_by: null,
      linked: false,
      role_slug: null,
      catalog_count: 0,
      effective_allowed_count: 0,
      durationMs: 0,
    };

    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }

      assertNoTenantIdQueryParam(req.query || {});

      const tenantId = req.tenantContext?.tenantId ?? await resolveAdminTenantForPermissions({
        authUserId: req.appAuthUser.id,
        getTenantAdminActorOrThrow,
        resolveActiveTenantUser,
      });
      logPayload.tenant_id = tenantId;

      const { collaborator, resolved_by: resolvedBy } = await resolveCollaboratorInTenant(
        supabase,
        tenantId,
        req.params?.id,
      );
      logPayload.resolved_by = resolvedBy;

      const tenantUser = await resolveLinkedTenantUser(supabase, tenantId, collaborator);
      const payload = await buildCollaboratorPermissionsPayload({
        supabase,
        tenantId,
        collaborator,
        tenantUser,
        getAuthUserMeta,
        isTenantAdminRole,
      });

      logPayload.linked = payload.access.linked;
      logPayload.role_slug = payload.access.role_slug;
      logPayload.catalog_count = payload.permissions.catalog_count;
      logPayload.effective_allowed_count = payload.permissions.effective_allowed_count;
      logPayload.durationMs = Date.now() - started;

      console.log('[COLLABORATOR_PERMISSIONS_API_GET]', logPayload);

      return res.status(200).json({
        ok: true,
        data: payload,
        meta: {
          tenant_id: tenantId,
          collaborator_ref: logPayload.collaborator_ref,
          resolved_by: resolvedBy,
          read_only: true,
        },
      });
    } catch (err) {
      logPayload.durationMs = Date.now() - started;
      console.log('[COLLABORATOR_PERMISSIONS_API_GET]', {
        ...logPayload,
        error: err?.code || err?.message,
      });

      if (err instanceof CollaboratorsListQueryError) {
        return res.status(400).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof CollaboratorPermissionsNotFoundError) {
        return res.status(404).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof CollaboratorsListForbiddenError) {
        return res.status(403).json({ ok: false, error: err.message, code: err.code });
      }

      console.error('[COLLABORATOR_PERMISSIONS_API_GET]', err);
      return res.status(500).json({
        ok: false,
        error: 'Falha ao consultar permissões do colaborador.',
      });
    }
  };
}
