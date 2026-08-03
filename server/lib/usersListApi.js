/**
 * Phase 4.10 Wave 3B — GET /internal/app/users/list.
 * Admin via ?tenant_id obrigatório (legado); envelope V2 preservado.
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createUsersListHandler(deps) {
  const {
    supabase,
    getTenantAdminActorOrThrow,
    normalizeEmail,
    normalizeRoleValue,
    normalizeInvitationStatus,
    getValidAuthUserId,
    getAuthUserMeta,
    extractPermissionFieldsFromAppMetadata,
    normalizeDatabaseError,
  } = deps;

  return async function handleUsersList(req, res) {
    try {
      const explicitTenantId = normalizeText(req.query?.tenant_id);
      if (!explicitTenantId) {
        return res.status(400).json({
          error: 'tenant_id é obrigatório na query string.',
          code: 'TENANT_REQUIRED',
        });
      }

      let tenantId = req.tenantContext?.tenantId || req.tenantContext?.tenantUser?.tenant_id;
      if (!tenantId) {
        const actorTenantUser = await getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId);
        tenantId = actorTenantUser.tenant_id;
      }

      const tenantUsersListSelects = [
        'id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, is_active, status, has_system_access, invitation_status, created_at, updated_at',
        'id, tenant_id, user_id, full_name, email, role, role_slug, is_active, status, has_system_access, invitation_status, created_at, updated_at',
        'id, tenant_id, user_id, full_name, email, role, role_slug, is_active, status, has_system_access, created_at, updated_at',
        'id, tenant_id, user_id, full_name, email, role, role_slug, is_active, status, invitation_status, created_at, updated_at',
        'id, tenant_id, user_id, full_name, email, role, role_slug, is_active, status, created_at, updated_at',
      ];
      let tenantUsers;
      let lastTenantUsersError = null;
      for (const sel of tenantUsersListSelects) {
        const { data, error } = await supabase
          .from('tenant_users')
          .select(sel)
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: true });
        if (!error) {
          tenantUsers = data;
          lastTenantUsersError = null;
          break;
        }
        lastTenantUsersError = error;
      }
      if (lastTenantUsersError) throw lastTenantUsersError;

      let invitations = [];
      const invResult = await supabase
        .from('invitations')
        .select('id, tenant_id, tenant_user_id, collaborator_id, email, profile_role, status, expires_at, sent_at, accepted_at, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (invResult.error) {
        const invCode = String(invResult.error?.code || '').toUpperCase();
        const invMsg = String(invResult.error?.message || '').toLowerCase();
        if (
          invCode === 'PGRST205'
          || invCode === '42P01'
          || (invMsg.includes('relation') && invMsg.includes('does not exist'))
        ) {
          invitations = [];
        } else {
          throw invResult.error;
        }
      } else {
        invitations = invResult.data || [];
      }

      const latestInvitationByEmail = new Map();
      for (const inv of invitations || []) {
        const key = normalizeEmail(inv?.email);
        if (!key || latestInvitationByEmail.has(key)) continue;
        latestInvitationByEmail.set(key, inv);
      }

      const users = await Promise.all((tenantUsers || []).map(async (row) => {
        const email = normalizeEmail(row?.email);
        const invitation = latestInvitationByEmail.get(email) || null;
        const role = normalizeRoleValue(row?.role || row?.role_slug || invitation?.profile_role || 'atendimento');
        const hasSystemAccess = row?.has_system_access ?? row?.is_active ?? row?.status === 'active';
        const invitationStatus = normalizeInvitationStatus(row?.invitation_status || invitation?.status || 'none');
        const authUserValid = row?.user_id ? Boolean(await getValidAuthUserId(row.user_id)) : false;
        const authMeta = row?.user_id ? await getAuthUserMeta(row.user_id) : null;
        const permissionFields = extractPermissionFieldsFromAppMetadata(authMeta?.app_metadata);
        return {
          id: row.id,
          tenant_id: row.tenant_id,
          user_id: row.user_id || null,
          auth_user_valid: authUserValid,
          collaborator_id: row.collaborator_id || null,
          full_name: row.full_name || '',
          email: email || '',
          role,
          is_active: Boolean(row?.is_active ?? row?.status === 'active'),
          has_system_access: Boolean(hasSystemAccess),
          status: String(row?.status || (hasSystemAccess ? 'active' : 'inactive')),
          invitation_status: invitationStatus,
          created_at: row?.created_at || null,
          updated_at: row?.updated_at || null,
          last_sign_in_at: authMeta?.last_sign_in_at || null,
          password_reset_sent_at: authMeta?.app_metadata?.last_password_reset_requested_at || null,
          auth_meta: authMeta?.app_metadata || null,
          ...permissionFields,
          invitation,
        };
      }));

      return res.status(200).json({
        success: true,
        tenant_id: tenantId,
        users,
      });
    } catch (err) {
      return res.status(400).json({
        error: normalizeDatabaseError(err, 'Falha ao listar usuários da clínica.'),
      });
    }
  };
}
