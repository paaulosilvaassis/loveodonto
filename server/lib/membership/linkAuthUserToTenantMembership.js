/**
 * Phase 4.10 Wave 3H — vincula auth user a tenant_users existente pelo e-mail.
 */

import {
  isMissingHasSystemAccessColumnError,
  isMissingInvitationStatusColumnError,
} from './tenantUserSchemaFallbacks.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createLinkAuthUserToTenantMembership(deps) {
  const {
    supabase,
    normalizeEmail,
    isActiveTenantUserRow,
  } = deps;

  return async function linkAuthUserToTenantMembership(
    authUserId,
    explicitTenantId = '',
    emailHint = '',
  ) {
    const normalizedAuthUserId = normalizeText(authUserId);
    if (!normalizedAuthUserId) return null;

    let email = normalizeEmail(emailHint);
    if (!email) {
      const { data: authData } = await supabase.auth.admin.getUserById(normalizedAuthUserId);
      email = normalizeEmail(authData?.user?.email);
    }
    if (!email) return null;

    const normalizedExplicit = normalizeText(explicitTenantId);
    let query = supabase
      .from('tenant_users')
      .select('id, tenant_id, collaborator_id, user_id, email, full_name, role, role_slug, is_active, status, has_system_access')
      .eq('email', email);
    if (normalizedExplicit) query = query.eq('tenant_id', normalizedExplicit);

    let { data: rows, error } = await query;
    if (error && isMissingHasSystemAccessColumnError(error)) {
      ({ data: rows, error } = await supabase
        .from('tenant_users')
        .select('id, tenant_id, collaborator_id, user_id, email, full_name, role, role_slug, is_active, status')
        .eq('email', email));
      if (normalizedExplicit) {
        rows = (rows || []).filter((row) => row?.tenant_id === normalizedExplicit);
      }
    }
    if (error) throw error;

    const candidates = (Array.isArray(rows) ? rows : []).filter(isActiveTenantUserRow);
    for (const row of candidates) {
      const linkedUserId = normalizeText(row?.user_id);
      if (linkedUserId && linkedUserId !== normalizedAuthUserId) continue;

      if (!linkedUserId) {
        const updatePayload = { user_id: normalizedAuthUserId, invitation_status: 'accepted' };
        let { error: updErr } = await supabase
          .from('tenant_users')
          .update(updatePayload)
          .eq('id', row.id);
        if (updErr && isMissingInvitationStatusColumnError(updErr)) {
          ({ error: updErr } = await supabase
            .from('tenant_users')
            .update({ user_id: normalizedAuthUserId })
            .eq('id', row.id));
        }
        if (updErr) {
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[linkAuthUserToTenantMembership] update skipped', updErr.message);
          }
          continue;
        }
      }

      return { ...row, user_id: normalizedAuthUserId };
    }

    return null;
  };
}
