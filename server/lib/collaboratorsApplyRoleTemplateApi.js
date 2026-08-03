/**
 * Phase 4.5B — POST /internal/app/collaborators/:id/apply-role-template (write).
 * Supabase + Auth app_metadata; zero IndexedDB; zero writes em collaborators.
 */

import {
  CollaboratorsListForbiddenError,
  CollaboratorsListQueryError,
  assertNoTenantIdQueryParam,
} from './collaboratorsApiList.js';
import {
  CollaboratorPermissionsNotFoundError,
  extractPermissionFieldsFromAppMetadata,
  loadPermissionCatalogIds,
  loadRoleDefaultIds,
  resolveAdminTenantForPermissions,
  resolveCollaboratorInTenant,
  resolveLinkedTenantUser,
} from './collaboratorsPermissionsApi.js';

export const PRODUCTION_PROJECT_REF = 'uoepkwhqztmsjnzirpev';

export class CollaboratorApplyTemplateConflictError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'CollaboratorApplyTemplateConflictError';
    this.code = code;
  }
}

export class RoleTemplateNotFoundError extends Error {
  constructor(message = 'Template de role não encontrado.', code = 'ROLE_TEMPLATE_NOT_FOUND') {
    super(message);
    this.name = 'RoleTemplateNotFoundError';
    this.code = code;
  }
}

export class CollaboratorApplyTemplateAuthError extends Error {
  constructor(message = 'Falha ao atualizar Auth app_metadata.', code = 'AUTH_WRITE_FAILED') {
    super(message);
    this.name = 'CollaboratorApplyTemplateAuthError';
    this.code = code;
  }
}

export class CollaboratorApplyTemplateRollbackError extends Error {
  constructor(message = 'Falha ao aplicar template e rollback não concluiu.', code = 'ROLLBACK_FAILED') {
    super(message);
    this.name = 'CollaboratorApplyTemplateRollbackError';
    this.code = code;
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeRoleValue(value) {
  return normalizeText(value).toLowerCase();
}

export function assertNoTenantIdInBody(body = {}) {
  const tenantFromBody = normalizeText(body?.tenant_id);
  if (tenantFromBody) {
    throw new CollaboratorsListQueryError(
      'tenant_id não é aceito no body. O tenant é resolvido pelo contexto autenticado.',
      'TENANT_BODY_FORBIDDEN',
    );
  }
}

export function parseApplyRoleTemplateBody(body = {}) {
  assertNoTenantIdInBody(body);

  const forbiddenFields = ['permission_overrides', 'custom_permissions', 'permissions', 'target_user_id'];
  for (const field of forbiddenFields) {
    if (body[field] !== undefined) {
      throw new CollaboratorsListQueryError(
        `Campo "${field}" não é suportado neste endpoint.`,
        'UNSUPPORTED_FIELD',
      );
    }
  }

  const roleSlug = normalizeRoleValue(body?.role_slug || body?.role);
  if (!roleSlug) {
    throw new CollaboratorsListQueryError('role_slug é obrigatório.', 'INVALID_ROLE_SLUG');
  }

  let confirmOverwrite = false;
  if (body?.confirmOverwrite !== undefined && body?.confirmOverwrite !== null) {
    if (typeof body.confirmOverwrite !== 'boolean') {
      throw new CollaboratorsListQueryError(
        'confirmOverwrite deve ser boolean.',
        'INVALID_CONFIRM_OVERWRITE',
      );
    }
    confirmOverwrite = body.confirmOverwrite;
  }

  return { roleSlug, confirmOverwrite };
}

export function detectRequiresOverwrite(tenantUser, appMetadata) {
  const fromMeta = extractPermissionFieldsFromAppMetadata(appMetadata || {});
  const hasCustomFlag = tenantUser?.has_custom_permissions === true || fromMeta.has_custom_permissions;
  const hasCustomMap = fromMeta.custom_permissions && Object.keys(fromMeta.custom_permissions).length > 0;
  const hasOverrides = fromMeta.permission_overrides && Object.keys(fromMeta.permission_overrides).length > 0;
  return hasCustomFlag || hasCustomMap || hasOverrides;
}

export function filterTemplateIdsAgainstCatalog(catalogIds, templateIds) {
  const catalogSet = new Set(catalogIds);
  const validTemplateIds = (templateIds || []).filter((id) => catalogSet.has(id));
  return {
    validTemplateIds,
    appliedCount: validTemplateIds.length,
  };
}

export function buildRoleTemplateAppMetadata(prevMeta, tenantId, roleSlug) {
  const prev = prevMeta && typeof prevMeta === 'object' ? { ...prevMeta } : {};
  const nextMeta = {
    ...prev,
    tenant_id: tenantId,
    role: roleSlug,
    role_slug: roleSlug,
    role_template: roleSlug,
    has_custom_permissions: false,
    permission_overrides: {},
  };
  delete nextMeta.custom_permissions;
  return nextMeta;
}

export function buildTenantUserRoleUpdatePayload(roleSlug) {
  return {
    role: roleSlug,
    role_slug: roleSlug,
    has_custom_permissions: false,
    updated_at: new Date().toISOString(),
  };
}

export async function applyRoleTemplateToLinkedUser({
  supabase,
  tenantId,
  collaborator,
  tenantUser,
  roleSlug,
  confirmOverwrite,
  getAuthUserMeta,
  appendAccessAuditToAuthUser,
  actorUserId,
}) {
  if (!tenantUser?.id) {
    throw new CollaboratorApplyTemplateConflictError(
      'Colaborador RH sem vínculo de acesso ao sistema.',
      'ACCESS_NOT_LINKED',
    );
  }
  if (!tenantUser?.user_id) {
    throw new CollaboratorApplyTemplateConflictError(
      'Usuário Auth não vinculado ao tenant_user.',
      'ACCESS_NOT_LINKED',
    );
  }

  const normalizedRole = normalizeRoleValue(roleSlug);
  if (!normalizedRole) {
    throw new CollaboratorsListQueryError('role_slug inválido.', 'INVALID_ROLE_SLUG');
  }

  const catalogIds = await loadPermissionCatalogIds(supabase);
  if (catalogIds.length === 0) {
    throw new RoleTemplateNotFoundError('permission_catalog vazio.', 'CATALOG_NOT_SEEDED');
  }

  const templateIds = await loadRoleDefaultIds(supabase, normalizedRole);
  if (templateIds.length === 0) {
    throw new RoleTemplateNotFoundError(
      `Nenhum default encontrado para role_slug "${normalizedRole}".`,
      'ROLE_TEMPLATE_NOT_FOUND',
    );
  }

  const { appliedCount } = filterTemplateIdsAgainstCatalog(catalogIds, templateIds);

  const authMeta = await getAuthUserMeta(tenantUser.user_id);
  if (!authMeta) {
    throw new CollaboratorApplyTemplateConflictError(
      'Usuário Auth não encontrado para o tenant_user vinculado.',
      'AUTH_USER_MISSING',
    );
  }

  const requiresOverwrite = detectRequiresOverwrite(tenantUser, authMeta.app_metadata);
  if (requiresOverwrite && confirmOverwrite !== true) {
    throw new CollaboratorApplyTemplateConflictError(
      'Colaborador possui permissões customizadas. Envie confirmOverwrite=true para substituir pelo template.',
      'OVERWRITE_CONFIRMATION_REQUIRED',
    );
  }

  const snapshot = {
    role: tenantUser.role ?? null,
    role_slug: tenantUser.role_slug ?? null,
    has_custom_permissions: tenantUser.has_custom_permissions ?? false,
    app_metadata: authMeta.app_metadata && typeof authMeta.app_metadata === 'object'
      ? { ...authMeta.app_metadata }
      : {},
  };
  const previousRoleSlug = normalizeRoleValue(snapshot.role_slug || snapshot.role || '');

  const tuUpdatePayload = buildTenantUserRoleUpdatePayload(normalizedRole);
  const { error: tuUpdateErr } = await supabase
    .from('tenant_users')
    .update(tuUpdatePayload)
    .eq('id', tenantUser.id)
    .eq('tenant_id', tenantId);
  if (tuUpdateErr) throw tuUpdateErr;

  try {
    const nextMeta = buildRoleTemplateAppMetadata(snapshot.app_metadata, tenantId, normalizedRole);
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
        role: snapshot.role,
        role_slug: snapshot.role_slug,
        has_custom_permissions: snapshot.has_custom_permissions,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantUser.id)
      .eq('tenant_id', tenantId);

    if (rollbackErr) {
      console.error('[COLLABORATOR_ROLE_TEMPLATE_ROLLBACK]', {
        tenant_id: tenantId,
        tenant_user_id: tenantUser.id,
        error: rollbackErr?.message,
      });
      throw new CollaboratorApplyTemplateRollbackError(
        'Falha ao atualizar Auth e rollback de tenant_users também falhou.',
        'ROLLBACK_FAILED',
      );
    }

    console.log('[COLLABORATOR_ROLE_TEMPLATE_ROLLBACK]', {
      tenant_id: tenantId,
      tenant_user_id: tenantUser.id,
      restored_role_slug: snapshot.role_slug,
    });
    throw new CollaboratorApplyTemplateAuthError(
      authErr?.message || 'Falha ao atualizar Auth app_metadata.',
      'AUTH_WRITE_FAILED',
    );
  }

  if (typeof appendAccessAuditToAuthUser === 'function') {
    try {
      await appendAccessAuditToAuthUser(tenantUser.user_id, {
        action: 'role_template_applied',
        audit_event: 'COLLABORATOR_ROLE_TEMPLATE_APPLIED',
        role_slug: normalizedRole,
        previous_role_slug: previousRoleSlug || null,
        applied_permissions_count: appliedCount,
        confirm_overwrite: requiresOverwrite ? confirmOverwrite === true : false,
        actor_user_id: actorUserId || null,
        tenant_id: tenantId,
        collaborator_id: collaborator.id,
      });
    } catch (auditErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[COLLABORATOR_ROLE_TEMPLATE_APPLY] audit append skipped', auditErr?.message);
      }
    }
  }

  return {
    collaborator_id: collaborator.id,
    tenant_user_id: tenantUser.id,
    target_user_id: tenantUser.user_id,
    role_slug: normalizedRole,
    previous_role_slug: previousRoleSlug || null,
    applied_permissions_count: appliedCount,
    catalog_count: catalogIds.length,
    has_custom_permissions: false,
    overwrite_confirmed: requiresOverwrite ? confirmOverwrite === true : false,
    source: 'role_permission_defaults',
  };
}

export function createCollaboratorApplyRoleTemplateHandler(deps) {
  const {
    supabase,
    getTenantAdminActorOrThrow,
    resolveActiveTenantUser,
    getAuthUserMeta,
    appendAccessAuditToAuthUser,
    logCollaboratorAccessAudit,
  } = deps;

  return async function collaboratorApplyRoleTemplateHandler(req, res) {
    const started = Date.now();
    const logPayload = {
      tenant_id: null,
      actor_user_id: req.appAuthUser?.id || null,
      collaborator_ref: normalizeText(req.params?.id),
      tenant_user_id: null,
      role_slug: null,
      applied_permissions_count: 0,
      durationMs: 0,
    };

    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }

      assertNoTenantIdQueryParam(req.query || {});
      const { roleSlug, confirmOverwrite } = parseApplyRoleTemplateBody(req.body || {});

      const tenantId = req.tenantContext?.tenantId ?? await resolveAdminTenantForPermissions({
        authUserId: req.appAuthUser.id,
        getTenantAdminActorOrThrow,
        resolveActiveTenantUser,
      });
      logPayload.tenant_id = tenantId;
      logPayload.role_slug = roleSlug;

      const { collaborator, resolved_by: resolvedBy } = await resolveCollaboratorInTenant(
        supabase,
        tenantId,
        req.params?.id,
      );

      const tenantUser = await resolveLinkedTenantUser(supabase, tenantId, collaborator);
      logPayload.tenant_user_id = tenantUser?.id || null;

      const result = await applyRoleTemplateToLinkedUser({
        supabase,
        tenantId,
        collaborator,
        tenantUser,
        roleSlug,
        confirmOverwrite,
        getAuthUserMeta,
        appendAccessAuditToAuthUser,
        actorUserId: req.appAuthUser.id,
      });

      logPayload.applied_permissions_count = result.applied_permissions_count;
      logPayload.durationMs = Date.now() - started;

      console.log('[COLLABORATOR_ROLE_TEMPLATE_APPLY]', logPayload);

      if (typeof logCollaboratorAccessAudit === 'function') {
        logCollaboratorAccessAudit({
          action: 'role_template_applied',
          tenantId,
          actorUserId: req.appAuthUser.id,
          tenantUserId: result.tenant_user_id,
          collaboratorId: result.collaborator_id,
          roleSlug: result.role_slug,
          appliedPermissionsCount: result.applied_permissions_count,
        });
      }

      return res.status(200).json({
        ok: true,
        data: {
          collaborator_id: result.collaborator_id,
          tenant_user_id: result.tenant_user_id,
          role_slug: result.role_slug,
          applied_permissions_count: result.applied_permissions_count,
          has_custom_permissions: result.has_custom_permissions,
          source: result.source,
        },
        meta: {
          tenant_id: tenantId,
          collaborator_ref: logPayload.collaborator_ref,
          resolved_by: resolvedBy,
          changed_by: req.appAuthUser.id,
          audit_event: 'COLLABORATOR_ROLE_TEMPLATE_APPLIED',
        },
      });
    } catch (err) {
      logPayload.durationMs = Date.now() - started;
      console.log('[COLLABORATOR_ROLE_TEMPLATE_APPLY]', {
        ...logPayload,
        error: err?.code || err?.message,
      });

      if (err instanceof CollaboratorsListQueryError) {
        return res.status(400).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof CollaboratorPermissionsNotFoundError) {
        return res.status(404).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof RoleTemplateNotFoundError) {
        return res.status(404).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof CollaboratorApplyTemplateConflictError) {
        return res.status(409).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof CollaboratorsListForbiddenError) {
        return res.status(403).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof CollaboratorApplyTemplateRollbackError) {
        return res.status(503).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof CollaboratorApplyTemplateAuthError) {
        return res.status(500).json({ ok: false, error: err.message, code: err.code });
      }

      console.error('[COLLABORATOR_ROLE_TEMPLATE_APPLY]', err);
      return res.status(500).json({
        ok: false,
        error: 'Falha ao aplicar template de permissões.',
        code: 'INTERNAL_ERROR',
      });
    }
  };
}
