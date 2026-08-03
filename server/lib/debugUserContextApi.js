/**
 * Phase 4.10 Wave 2C — GET /internal/app/debug-user-context (DEV/STAGING only).
 * Diagnóstico admin; envelope V3; Core Auth/Tenant; zero IndexedDB.
 */

import { apiSuccess } from '../core/api/response.js';
import { normalizeRoleValue } from '../core/rbac/roles.js';
import {
  CollaboratorsListForbiddenError,
  CollaboratorsListQueryError,
  assertNoTenantIdQueryParam,
} from './collaboratorsApiList.js';
import { resolveAdminTenantForPermissions } from './collaboratorsPermissionsApi.js';

export const PRODUCTION_PROJECT_REF = 'uoepkwhqztmsjnzirpev';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class DebugUserContextNotFoundError extends Error {
  constructor(message = 'Usuário alvo não encontrado neste tenant.', code = 'TARGET_USER_NOT_FOUND') {
    super(message);
    this.name = 'DebugUserContextNotFoundError';
    this.code = code;
    this.status = 404;
  }
}

export class DebugUserContextQueryError extends Error {
  constructor(message, code = 'INVALID_QUERY') {
    super(message);
    this.name = 'DebugUserContextQueryError';
    this.code = code;
    this.status = 400;
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function isProductionSupabaseUrl(supabaseUrl = process.env.SUPABASE_URL) {
  const url = normalizeText(supabaseUrl).toLowerCase();
  return url.includes(PRODUCTION_PROJECT_REF);
}

export function isDebugUserContextAllowed({
  nodeEnv = process.env.NODE_ENV,
  supabaseUrl = process.env.SUPABASE_URL,
} = {}) {
  if (normalizeText(nodeEnv).toLowerCase() === 'production') return false;
  if (isProductionSupabaseUrl(supabaseUrl)) return false;
  return true;
}

export function createAssertNonProductionDebug(deps = {}) {
  return function assertNonProductionDebug(_req, res, next) {
    if (!isDebugUserContextAllowed(deps)) {
      return res.status(403).json({
        ok: false,
        error: 'Endpoint de diagnóstico indisponível em produção.',
        code: 'DEBUG_DISABLED_IN_PRODUCTION',
      });
    }
    next();
  };
}

export function parseDebugUserContextQuery(query = {}) {
  assertNoTenantIdQueryParam(query);

  const targetUserId = normalizeText(query?.target_user_id);
  if (targetUserId && !UUID_RE.test(targetUserId)) {
    throw new DebugUserContextQueryError(
      'target_user_id inválido. Use um UUID de usuário Auth.',
      'INVALID_TARGET_USER_ID',
    );
  }

  return { targetUserId: targetUserId || null };
}

export function countEffectivePermissions(permissionFields) {
  if (permissionFields.has_custom_permissions && permissionFields.custom_permissions) {
    return Object.values(permissionFields.custom_permissions).filter(Boolean).length;
  }
  return Object.values(permissionFields.permission_overrides || {}).filter((v) => v === true).length;
}

export function deriveAgendaEnabled(roleSlug, permissionFields) {
  const agendaPermKeys = ['agenda'];
  if (permissionFields.has_custom_permissions && permissionFields.custom_permissions) {
    return agendaPermKeys.some((mod) => Object.entries(permissionFields.custom_permissions)
      .some(([key, val]) => key.includes(mod) && val === true));
  }
  return ['dentista', 'profissional', 'atendimento', 'recepcao', 'gerente', 'administrativo']
    .includes(roleSlug);
}

export function buildSanitizedDebugUserContextData({
  authUserId,
  actorEmail = '',
  tenantId,
  tenantRow,
  clinicProfile,
  tuRow,
  permissionFields,
  authMeta,
}) {
  const roleSlug = normalizeRoleValue(tuRow?.role || tuRow?.role_slug || 'atendimento');
  const permissionsCount = countEffectivePermissions(permissionFields);

  return {
    user_id: authUserId,
    email: tuRow?.email || actorEmail || '',
    tenant_id: tenantId,
    tenant_name: tenantRow?.trade_name || tenantRow?.name || '',
    role_slug: roleSlug,
    tenant_user_status: tuRow?.status || (tuRow?.is_active ? 'active' : 'inactive') || 'unknown',
    collaborator_id: tuRow?.collaborator_id || null,
    collaborator_uuid: tuRow?.collaborator_uuid || null,
    collaborator_name: tuRow?.full_name || '',
    collaborator_status: tuRow?.is_active === false ? 'inativo' : 'ativo',
    access_id: tuRow?.id || null,
    access_status: tuRow?.has_system_access !== false ? 'active' : 'inactive',
    has_custom_permissions: Boolean(permissionFields.has_custom_permissions),
    permissions_count: permissionsCount,
    agenda_enabled: deriveAgendaEnabled(roleSlug, permissionFields),
    logo_url: clinicProfile?.logo_url || null,
    avatar_url: authMeta?.user_metadata?.avatar_url || null,
    source: 'debug-user-context',
    permission_overrides_keys: Object.keys(permissionFields.permission_overrides || {}).length,
    custom_permissions_keys: permissionFields.custom_permissions
      ? Object.keys(permissionFields.custom_permissions).length
      : 0,
  };
}

export function createDebugUserContextHandler(deps) {
  const {
    supabase,
    getTenantAdminActorOrThrow,
    resolveActiveTenantUser,
    getAuthUserMeta,
    extractPermissionFieldsFromAppMetadata,
    resolveClinicProfileForTenant,
    maskEmail,
    nodeEnv = process.env.NODE_ENV,
  } = deps;

  return async function debugUserContextHandler(req, res) {
    const started = Date.now();
    const logPayload = {
      tenant_id: null,
      actor_user_id: req.appAuthUser?.id || null,
      target_user_id: null,
      durationMs: 0,
    };

    try {
      if (!isDebugUserContextAllowed({ nodeEnv, supabaseUrl: process.env.SUPABASE_URL })) {
        return res.status(403).json({
          ok: false,
          error: 'Endpoint de diagnóstico indisponível em produção.',
          code: 'DEBUG_DISABLED_IN_PRODUCTION',
        });
      }

      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }

      const { targetUserId } = parseDebugUserContextQuery(req.query || {});
      const authUserId = targetUserId || req.appAuthUser.id;
      logPayload.target_user_id = authUserId;

      const tenantId = req.tenantContext?.tenantId ?? await resolveAdminTenantForPermissions({
        authUserId: req.appAuthUser.id,
        getTenantAdminActorOrThrow,
        resolveActiveTenantUser,
      });
      logPayload.tenant_id = tenantId;

      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('id, trade_name, name')
        .eq('id', tenantId)
        .maybeSingle();

      const clinicProfile = await resolveClinicProfileForTenant(
        supabase,
        tenantId,
        tenantRow || { id: tenantId },
      );

      const { data: tuRow } = await supabase
        .from('tenant_users')
        .select('id, tenant_id, user_id, collaborator_id, collaborator_uuid, full_name, email, role, role_slug, is_active, status, has_system_access')
        .eq('tenant_id', tenantId)
        .eq('user_id', authUserId)
        .maybeSingle();

      if (targetUserId && !tuRow) {
        throw new DebugUserContextNotFoundError();
      }

      const authMeta = await getAuthUserMeta(authUserId);
      const permissionFields = extractPermissionFieldsFromAppMetadata(authMeta?.app_metadata || {});

      const data = buildSanitizedDebugUserContextData({
        authUserId,
        actorEmail: req.appAuthUser.email || '',
        tenantId,
        tenantRow,
        clinicProfile,
        tuRow,
        permissionFields,
        authMeta,
      });

      logPayload.durationMs = Date.now() - started;
      if (typeof maskEmail === 'function' && data.email) {
        console.log('[DEBUG_USER_CONTEXT]', {
          ...logPayload,
          email: maskEmail(data.email),
        });
      } else {
        console.log('[DEBUG_USER_CONTEXT]', logPayload);
      }

      return res.status(200).json(apiSuccess(data, {
        tenant_id: tenantId,
        target_user_id: authUserId,
        requested_by: req.appAuthUser.id,
        environment: normalizeText(nodeEnv).toLowerCase() || 'development',
        source: 'debug-user-context',
        read_only: true,
      }));
    } catch (err) {
      logPayload.durationMs = Date.now() - started;
      console.log('[DEBUG_USER_CONTEXT]', { ...logPayload, error: err?.code || err?.message });

      if (err instanceof DebugUserContextQueryError || err instanceof CollaboratorsListQueryError) {
        return res.status(400).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof DebugUserContextNotFoundError) {
        return res.status(404).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof CollaboratorsListForbiddenError) {
        return res.status(403).json({ ok: false, error: err.message, code: err.code });
      }

      console.error('[DEBUG_USER_CONTEXT]', err);
      return res.status(500).json({
        ok: false,
        error: 'Falha no diagnóstico de contexto do usuário.',
        code: 'INTERNAL_ERROR',
      });
    }
  };
}
