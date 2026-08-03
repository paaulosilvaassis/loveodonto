/**
 * Phase 4.7 — PUT /internal/app/collaborators/:id/permissions (write).
 * Manual custom permissions override; Supabase + Auth; zero IndexedDB.
 */

import {
  CollaboratorsListForbiddenError,
  CollaboratorsListQueryError,
  assertNoTenantIdQueryParam,
} from './collaboratorsApiList.js';
import {
  CollaboratorPermissionsNotFoundError,
  countAllowedPermissions,
  loadPermissionCatalogIds,
  loadRoleDefaultIds,
  resolveAdminTenantForPermissions,
  resolveCollaboratorInTenant,
  resolveLinkedTenantUser,
  sparseOverridesFromEffectiveMap,
} from './collaboratorsPermissionsApi.js';
import { assertNoTenantIdInBody } from './collaboratorsApplyRoleTemplateApi.js';

export const PRODUCTION_PROJECT_REF = 'uoepkwhqztmsjnzirpev';

export class CollaboratorPutPermissionsConflictError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'CollaboratorPutPermissionsConflictError';
    this.code = code;
  }
}

export class CollaboratorPutPermissionsValidationError extends Error {
  constructor(message, code = 'PAYLOAD_INVALID', details = {}) {
    super(message);
    this.name = 'CollaboratorPutPermissionsValidationError';
    this.code = code;
    this.details = details;
  }
}

export class CollaboratorPutPermissionsAuthError extends Error {
  constructor(message = 'Falha ao atualizar Auth app_metadata.', code = 'AUTH_WRITE_FAILED') {
    super(message);
    this.name = 'CollaboratorPutPermissionsAuthError';
    this.code = code;
  }
}

export class CollaboratorPutPermissionsRollbackError extends Error {
  constructor(message = 'Falha ao salvar permissões e rollback não concluiu.', code = 'ROLLBACK_FAILED') {
    super(message);
    this.name = 'CollaboratorPutPermissionsRollbackError';
    this.code = code;
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeRoleValue(value) {
  return normalizeText(value).toLowerCase();
}

export function parsePutPermissionsBody(body = {}) {
  assertNoTenantIdInBody(body);

  const forbiddenFields = [
    'tenant_id',
    'role_slug',
    'role',
    'has_custom_permissions',
    'custom_permissions',
    'permission_overrides',
    'target_user_id',
    'password',
    'email',
    'has_system_access',
  ];
  for (const field of forbiddenFields) {
    if (body[field] !== undefined) {
      throw new CollaboratorsListQueryError(
        `Campo "${field}" não é suportado neste endpoint.`,
        'UNSUPPORTED_FIELD',
      );
    }
  }

  const permissionsRaw = body?.permissions;
  if (!permissionsRaw || typeof permissionsRaw !== 'object' || Array.isArray(permissionsRaw)) {
    throw new CollaboratorPutPermissionsValidationError(
      'permissions é obrigatório e deve ser um objeto.',
      'PAYLOAD_INVALID',
    );
  }

  const permissions = {};
  for (const [key, value] of Object.entries(permissionsRaw)) {
    const permId = normalizeText(key);
    if (!permId) continue;
    if (typeof value !== 'boolean') {
      throw new CollaboratorPutPermissionsValidationError(
        `Permissão "${permId}" deve ser boolean.`,
        'PAYLOAD_INVALID',
      );
    }
    permissions[permId] = value;
  }

  if (Object.keys(permissions).length === 0) {
    throw new CollaboratorPutPermissionsValidationError(
      'permissions deve conter ao menos uma entrada válida.',
      'PAYLOAD_INVALID',
    );
  }

  let reason = null;
  if (body?.reason !== undefined && body?.reason !== null) {
    reason = normalizeText(body.reason).slice(0, 500) || null;
  }

  return { permissions, reason };
}

export function validatePermissionsAgainstCatalog(permissionKeys, catalogIds) {
  const catalogSet = new Set(catalogIds);
  const invalidKeys = permissionKeys.filter((key) => !catalogSet.has(key));
  if (invalidKeys.length > 0) {
    throw new CollaboratorPutPermissionsValidationError(
      'Permissões inválidas no payload.',
      'INVALID_PERMISSION',
      { invalid_keys: invalidKeys },
    );
  }
}

export function materializeCustomPermissionsMap(catalogIds, roleDefaultIds, payloadPermissions) {
  const roleDefaultSet = new Set(roleDefaultIds);
  const effectiveMap = {};
  for (const permId of catalogIds) {
    if (typeof payloadPermissions[permId] === 'boolean') {
      effectiveMap[permId] = payloadPermissions[permId];
    } else {
      effectiveMap[permId] = roleDefaultSet.has(permId);
    }
  }
  const sparseOverrides = sparseOverridesFromEffectiveMap(effectiveMap, roleDefaultSet);
  return {
    effectiveMap,
    sparseOverrides,
    effectiveAllowedCount: countAllowedPermissions(effectiveMap),
  };
}

export function buildManualOverrideAppMetadata(prevMeta, tenantId, roleSlug, effectiveMap, sparseOverrides) {
  const prev = prevMeta && typeof prevMeta === 'object' ? { ...prevMeta } : {};
  return {
    ...prev,
    tenant_id: tenantId,
    role: roleSlug,
    role_slug: roleSlug,
    role_template: null,
    has_custom_permissions: true,
    custom_permissions: effectiveMap,
    permission_overrides: sparseOverrides,
  };
}

export function buildTenantUserCustomFlagUpdatePayload() {
  return {
    has_custom_permissions: true,
    updated_at: new Date().toISOString(),
  };
}

export async function putCollaboratorPermissionsToLinkedUser({
  supabase,
  tenantId,
  collaborator,
  tenantUser,
  payloadPermissions,
  reason,
  getAuthUserMeta,
  appendAccessAuditToAuthUser,
  actorUserId,
}) {
  if (!tenantUser?.id) {
    throw new CollaboratorPutPermissionsConflictError(
      'Colaborador RH sem vínculo de acesso ao sistema.',
      'ACCESS_NOT_LINKED',
    );
  }
  if (!tenantUser?.user_id) {
    throw new CollaboratorPutPermissionsConflictError(
      'Usuário Auth não vinculado ao tenant_user.',
      'ACCESS_NOT_LINKED',
    );
  }

  const roleSlug = normalizeRoleValue(tenantUser.role || tenantUser.role_slug);
  if (!roleSlug) {
    throw new CollaboratorPutPermissionsValidationError(
      'tenant_user sem role_slug válido.',
      'PAYLOAD_INVALID',
    );
  }

  const catalogIds = await loadPermissionCatalogIds(supabase);
  if (catalogIds.length === 0) {
    throw new CollaboratorPutPermissionsValidationError(
      'permission_catalog vazio.',
      'PAYLOAD_INVALID',
    );
  }

  validatePermissionsAgainstCatalog(Object.keys(payloadPermissions), catalogIds);

  const roleDefaultIds = await loadRoleDefaultIds(supabase, roleSlug);
  const {
    effectiveMap,
    sparseOverrides,
    effectiveAllowedCount,
  } = materializeCustomPermissionsMap(catalogIds, roleDefaultIds, payloadPermissions);

  const authMeta = await getAuthUserMeta(tenantUser.user_id);
  if (!authMeta) {
    throw new CollaboratorPutPermissionsConflictError(
      'Usuário Auth não encontrado para o tenant_user vinculado.',
      'AUTH_USER_MISSING',
    );
  }

  const snapshot = {
    has_custom_permissions: tenantUser.has_custom_permissions ?? false,
    app_metadata: authMeta.app_metadata && typeof authMeta.app_metadata === 'object'
      ? { ...authMeta.app_metadata }
      : {},
  };

  const tuUpdatePayload = buildTenantUserCustomFlagUpdatePayload();
  const { error: tuUpdateErr } = await supabase
    .from('tenant_users')
    .update(tuUpdatePayload)
    .eq('id', tenantUser.id)
    .eq('tenant_id', tenantId);
  if (tuUpdateErr) throw tuUpdateErr;

  try {
    const nextMeta = buildManualOverrideAppMetadata(
      snapshot.app_metadata,
      tenantId,
      roleSlug,
      effectiveMap,
      sparseOverrides,
    );
    const { error: authUpdateErr } = await supabase.auth.admin.updateUserById(tenantUser.user_id, {
      app_metadata: nextMeta,
    });
    if (authUpdateErr) {
      throw authUpdateErr;
    }
  } catch (authErr) {
    const { error: rollbackErr } = await supabase
      .from('tenant_users')
      .update({
        has_custom_permissions: snapshot.has_custom_permissions,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantUser.id)
      .eq('tenant_id', tenantId);

    if (rollbackErr) {
      console.error('[COLLABORATOR_PERMISSIONS_ROLLBACK]', {
        tenant_id: tenantId,
        tenant_user_id: tenantUser.id,
        error: rollbackErr?.message,
      });
      throw new CollaboratorPutPermissionsRollbackError(
        'Falha ao atualizar Auth e rollback de tenant_users também falhou.',
        'ROLLBACK_FAILED',
      );
    }

    console.log('[COLLABORATOR_PERMISSIONS_ROLLBACK]', {
      tenant_id: tenantId,
      tenant_user_id: tenantUser.id,
    });
    throw new CollaboratorPutPermissionsAuthError(
      authErr?.message || 'Falha ao atualizar Auth app_metadata.',
      'AUTH_WRITE_FAILED',
    );
  }

  if (typeof appendAccessAuditToAuthUser === 'function') {
    try {
      await appendAccessAuditToAuthUser(tenantUser.user_id, {
        action: 'permissions_updated',
        audit_event: 'COLLABORATOR_PERMISSIONS_UPDATED',
        role_slug: roleSlug,
        custom_permissions_count: catalogIds.length,
        effective_allowed_count: effectiveAllowedCount,
        payload_key_count: Object.keys(payloadPermissions).length,
        reason: reason || null,
        actor_user_id: actorUserId || null,
        tenant_id: tenantId,
        collaborator_id: collaborator.id,
      });
    } catch (auditErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[COLLABORATOR_PERMISSIONS_UPDATE] audit append skipped', auditErr?.message);
      }
    }
  }

  return {
    collaborator_id: collaborator.id,
    tenant_user_id: tenantUser.id,
    target_user_id: tenantUser.user_id,
    role_slug: roleSlug,
    has_custom_permissions: true,
    custom_permissions_count: catalogIds.length,
    effective_allowed_count: effectiveAllowedCount,
    catalog_count: catalogIds.length,
    payload_key_count: Object.keys(payloadPermissions).length,
    source: 'manual_override',
  };
}

export function createCollaboratorPutPermissionsHandler(deps) {
  const {
    supabase,
    getTenantAdminActorOrThrow,
    resolveActiveTenantUser,
    getAuthUserMeta,
    appendAccessAuditToAuthUser,
    logCollaboratorAccessAudit,
  } = deps;

  return async function collaboratorPutPermissionsHandler(req, res) {
    const started = Date.now();
    const logPayload = {
      tenant_id: null,
      actor_user_id: req.appAuthUser?.id || null,
      collaborator_ref: normalizeText(req.params?.id),
      tenant_user_id: null,
      custom_permissions_count: 0,
      effective_allowed_count: 0,
      durationMs: 0,
    };

    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }

      assertNoTenantIdQueryParam(req.query || {});
      const { permissions, reason } = parsePutPermissionsBody(req.body || {});

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

      const tenantUser = await resolveLinkedTenantUser(supabase, tenantId, collaborator);
      logPayload.tenant_user_id = tenantUser?.id || null;

      const result = await putCollaboratorPermissionsToLinkedUser({
        supabase,
        tenantId,
        collaborator,
        tenantUser,
        payloadPermissions: permissions,
        reason,
        getAuthUserMeta,
        appendAccessAuditToAuthUser,
        actorUserId: req.appAuthUser.id,
      });

      logPayload.custom_permissions_count = result.custom_permissions_count;
      logPayload.effective_allowed_count = result.effective_allowed_count;
      logPayload.durationMs = Date.now() - started;

      console.log('[COLLABORATOR_PERMISSIONS_UPDATE]', logPayload);

      if (typeof logCollaboratorAccessAudit === 'function') {
        logCollaboratorAccessAudit({
          action: 'permissions_updated',
          tenantId,
          actorUserId: req.appAuthUser.id,
          tenantUserId: result.tenant_user_id,
          collaboratorId: result.collaborator_id,
          roleSlug: result.role_slug,
          effectiveAllowedCount: result.effective_allowed_count,
        });
      }

      return res.status(200).json({
        ok: true,
        data: {
          collaborator_id: result.collaborator_id,
          tenant_user_id: result.tenant_user_id,
          role_slug: result.role_slug,
          has_custom_permissions: result.has_custom_permissions,
          custom_permissions_count: result.custom_permissions_count,
          effective_allowed_count: result.effective_allowed_count,
          source: result.source,
        },
        meta: {
          tenant_id: tenantId,
          collaborator_ref: logPayload.collaborator_ref,
          resolved_by: resolvedBy,
          changed_by: req.appAuthUser.id,
          audit_event: 'COLLABORATOR_PERMISSIONS_UPDATED',
          tenant_user_permissions: 'not_migrated',
        },
      });
    } catch (err) {
      logPayload.durationMs = Date.now() - started;
      console.log('[COLLABORATOR_PERMISSIONS_UPDATE]', {
        ...logPayload,
        error: err?.code || err?.message,
      });

      if (err instanceof CollaboratorsListQueryError) {
        return res.status(400).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof CollaboratorPutPermissionsValidationError) {
        return res.status(400).json({
          ok: false,
          error: err.message,
          code: err.code,
          details: err.details || {},
        });
      }
      if (err instanceof CollaboratorPermissionsNotFoundError) {
        return res.status(404).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof CollaboratorPutPermissionsConflictError) {
        return res.status(409).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof CollaboratorsListForbiddenError) {
        return res.status(403).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof CollaboratorPutPermissionsRollbackError) {
        return res.status(503).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof CollaboratorPutPermissionsAuthError) {
        return res.status(500).json({ ok: false, error: err.message, code: err.code });
      }

      console.error('[COLLABORATOR_PERMISSIONS_UPDATE]', err);
      return res.status(500).json({
        ok: false,
        error: 'Falha ao salvar permissões do colaborador.',
        code: 'INTERNAL_ERROR',
      });
    }
  };
}
