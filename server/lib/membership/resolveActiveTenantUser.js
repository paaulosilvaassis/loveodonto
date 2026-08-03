/**
 * Phase 4.10 Wave 3H — resolução de tenant_user ativo por auth user id.
 */

import { isMissingHasSystemAccessColumnError } from './tenantUserSchemaFallbacks.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createResolveActiveTenantUser(deps) {
  const {
    supabase,
    isActiveTenantUserRow,
    linkAuthUserToTenantMembership,
  } = deps;

  return async function resolveActiveTenantUser(
    authUserId,
    explicitTenantId = '',
    emailHint = '',
  ) {
    const normalizedExplicit = normalizeText(explicitTenantId);
    const baseFilters = (query) => {
      let q = query.eq('user_id', authUserId).order('created_at', { ascending: true });
      if (normalizedExplicit) q = q.eq('tenant_id', normalizedExplicit);
      return q;
    };

    let rows = null;
    let error = null;
    ({ data: rows, error } = await baseFilters(
      supabase.from('tenant_users').select('id, tenant_id, collaborator_id, user_id, email, full_name, role, role_slug, is_active, status, has_system_access'),
    ));
    if (error && isMissingHasSystemAccessColumnError(error)) {
      ({ data: rows, error } = await baseFilters(
        supabase.from('tenant_users').select('id, tenant_id, collaborator_id, user_id, email, full_name, role, role_slug, is_active, status'),
      ));
    }
    if (error) throw error;

    const activeRows = (Array.isArray(rows) ? rows : []).filter(isActiveTenantUserRow);

    if (activeRows.length === 0) {
      const linked = await linkAuthUserToTenantMembership(authUserId, explicitTenantId, emailHint);
      if (linked) return linked;
      return null;
    }

    if (!normalizedExplicit && activeRows.length > 1) {
      const err = new Error(
        'Usuário vinculado a múltiplas clínicas. Informe tenant_id explicitamente.',
      );
      err.code = 'TENANT_AMBIGUOUS';
      throw err;
    }

    return activeRows[0];
  };
}

export function createGetTenantUserByAuthUserId(deps) {
  const { resolveActiveTenantUser } = deps;

  return async function getTenantUserByAuthUserId(authUserId, explicitTenantId = '') {
    return resolveActiveTenantUser(authUserId, explicitTenantId);
  };
}
