/**
 * Phase 4.10 Wave 3C — PATCH /internal/app/users/:tenantUserId/access.
 * Envelope V2: 400 { error }, 200 { success, tenant_user }.
 */

import {
  TENANT_USER_SELECT_BASE,
  TENANT_USER_SELECT_WITH_ACCESS,
  omitHasSystemAccess,
} from './tenantUserFieldUtils.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createUsersPatchAccessHandler(deps) {
  const {
    supabase,
    getTenantAdminActorOrThrow,
    revokeAuthUserSessions,
    isMissingHasSystemAccessColumnError,
    normalizeDatabaseError,
  } = deps;

  return async function handleUsersPatchAccess(req, res) {
    try {
      const explicitTenantId = normalizeText(req.body?.tenant_id);
      const tenantUserId = normalizeText(req.params?.tenantUserId);
      const hasSystemAccess = Boolean(req.body?.has_system_access);
      if (!tenantUserId) return res.status(400).json({ error: 'tenantUserId é obrigatório.' });

      const actorTenantUser = req.tenantContext?.tenantUser
        || await getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId);
      const tenantId = req.tenantContext?.tenantId || actorTenantUser.tenant_id;

      const payload = {
        has_system_access: hasSystemAccess,
        is_active: hasSystemAccess,
        status: hasSystemAccess ? 'active' : 'inactive',
      };
      let result;
      try {
        result = await supabase
          .from('tenant_users')
          .update(payload)
          .eq('id', tenantUserId)
          .eq('tenant_id', tenantId)
          .select(TENANT_USER_SELECT_WITH_ACCESS)
          .single();
        if (result.error) throw result.error;
      } catch (error) {
        if (!isMissingHasSystemAccessColumnError(error)) throw error;
        result = await supabase
          .from('tenant_users')
          .update(omitHasSystemAccess(payload))
          .eq('id', tenantUserId)
          .eq('tenant_id', tenantId)
          .select(TENANT_USER_SELECT_BASE)
          .single();
        if (result.error) throw result.error;
      }

      const tenantUser = result.data;
      if (!hasSystemAccess && tenantUser?.user_id) {
        await revokeAuthUserSessions(tenantUser.user_id);
      }

      return res.status(200).json({ success: true, tenant_user: tenantUser });
    } catch (err) {
      return res.status(400).json({
        error: normalizeDatabaseError(err, 'Falha ao atualizar status de acesso do usuário.'),
      });
    }
  };
}
