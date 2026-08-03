/**
 * Phase 4.10 Wave 3B — POST /internal/app/invitations/reconcile.
 * Membership self-service (sem ?tenant_id).
 */

export function createInvitationsReconcileHandler(deps) {
  const {
    supabase,
    getTenantUserByAuthUserId,
    linkAuthUserToTenantMembership,
    normalizeEmail,
    isMissingInvitationStatusColumnError,
    normalizeDatabaseError,
  } = deps;

  return async function handleInvitationsReconcile(req, res) {
    try {
      let tenantUser = await getTenantUserByAuthUserId(req.appAuthUser.id);
      if (!tenantUser?.tenant_id) {
        tenantUser = await linkAuthUserToTenantMembership(
          req.appAuthUser.id,
          '',
          req.appAuthUser.email,
        );
      }
      if (!tenantUser?.tenant_id || !tenantUser?.email) {
        return res.status(200).json({ success: true, updated: 0 });
      }

      const acceptedAt = new Date().toISOString();
      const { data: invitationRows, error: invitationsError } = await supabase
        .from('invitations')
        .update({
          status: 'accepted',
          accepted_at: acceptedAt,
        })
        .eq('tenant_id', tenantUser.tenant_id)
        .eq('email', normalizeEmail(tenantUser.email))
        .in('status', ['pending', 'sent'])
        .select('id');
      if (invitationsError) throw invitationsError;

      const { error: tenantUserUpdateError } = await supabase
        .from('tenant_users')
        .update({ invitation_status: 'accepted' })
        .eq('tenant_id', tenantUser.tenant_id)
        .eq('user_id', req.appAuthUser.id);
      if (tenantUserUpdateError && !isMissingInvitationStatusColumnError(tenantUserUpdateError)) {
        throw tenantUserUpdateError;
      }

      return res.status(200).json({
        success: true,
        updated: Array.isArray(invitationRows) ? invitationRows.length : 0,
      });
    } catch (err) {
      console.error('[app-invitations-reconcile]', err);
      return res.status(400).json({
        error: normalizeDatabaseError(err, 'Falha ao reconciliar convite do primeiro acesso.'),
      });
    }
  };
}
