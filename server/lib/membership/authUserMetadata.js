/**
 * Phase 4.10 Wave 3H — leitura/escrita de metadata Auth (permissões + audit).
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createAuthUserMetadata(deps) {
  const { supabase } = deps;

  async function getAuthUserMeta(userId) {
    const id = normalizeText(userId);
    if (!id) return null;
    const { data, error } = await supabase.auth.admin.getUserById(id);
    if (error || !data?.user) return null;
    return {
      last_sign_in_at: data.user.last_sign_in_at || null,
      created_at: data.user.created_at || null,
      user_metadata: data.user.user_metadata || {},
      app_metadata: data.user.app_metadata || {},
    };
  }

  function extractPermissionFieldsFromAppMetadata(appMetadata) {
    const meta = appMetadata && typeof appMetadata === 'object' ? appMetadata : {};
    const permissionOverrides = meta.permission_overrides
      && typeof meta.permission_overrides === 'object'
      && !Array.isArray(meta.permission_overrides)
      ? meta.permission_overrides
      : {};
    const hasCustomPermissions = meta.has_custom_permissions === true;
    const customPermissions = hasCustomPermissions
      && meta.custom_permissions
      && typeof meta.custom_permissions === 'object'
      && !Array.isArray(meta.custom_permissions)
      ? meta.custom_permissions
      : null;
    return {
      has_custom_permissions: hasCustomPermissions,
      custom_permissions: customPermissions,
      permission_overrides: permissionOverrides,
    };
  }

  async function enrichTeamRosterWithPermissionFields(rosterRows = []) {
    return Promise.all((rosterRows || []).map(async (row) => {
      const userId = normalizeText(row?.user_id);
      if (!userId) {
        return {
          ...row,
          has_custom_permissions: false,
          custom_permissions: null,
          permission_overrides: {},
        };
      }
      const authMeta = await getAuthUserMeta(userId);
      const permissionFields = extractPermissionFieldsFromAppMetadata(authMeta?.app_metadata);
      return { ...row, ...permissionFields };
    }));
  }

  async function appendAccessAuditToAuthUser(authUserId, auditEntry) {
    const meta = await getAuthUserMeta(authUserId);
    if (!meta) return null;
    const existing = Array.isArray(meta.app_metadata?.access_audit_log)
      ? meta.app_metadata.access_audit_log
      : [];
    const nextLog = [{ ...auditEntry, at: auditEntry.at || new Date().toISOString() }, ...existing].slice(0, 20);
    const { error } = await supabase.auth.admin.updateUserById(authUserId, {
      app_metadata: {
        ...meta.app_metadata,
        access_audit_log: nextLog,
        last_password_reset_requested_at: auditEntry.action === 'password_reset_requested'
          ? auditEntry.at || new Date().toISOString()
          : meta.app_metadata?.last_password_reset_requested_at || null,
      },
    });
    if (error) {
      console.error('[COLLAB_ACCESS_AUDIT] falha ao persistir audit em app_metadata', error.message);
    }
    return nextLog;
  }

  return {
    getAuthUserMeta,
    extractPermissionFieldsFromAppMetadata,
    enrichTeamRosterWithPermissionFields,
    appendAccessAuditToAuthUser,
  };
}
