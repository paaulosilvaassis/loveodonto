/**
 * Phase 4.10 Wave 3C — DELETE /internal/app/users/:tenantUserId.
 * Envelope V2: 400/404 { error }, 200 { success, removed_tenant_user_id, email }.
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createUsersDeleteHandler(deps) {
  const {
    supabase,
    getTenantAdminActorOrThrow,
    normalizeEmail,
    normalizeDatabaseError,
  } = deps;

  return async function handleUsersDelete(req, res) {
    try {
      const explicitTenantId = normalizeText(req.body?.tenant_id);
      const tenantUserId = normalizeText(req.params?.tenantUserId);
      if (!tenantUserId) return res.status(400).json({ error: 'tenantUserId é obrigatório.' });

      const actorTenantUser = req.tenantContext?.tenantUser
        || await getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId);
      const tenantId = req.tenantContext?.tenantId || actorTenantUser.tenant_id;

      if (tenantUserId === actorTenantUser.id) {
        return res.status(400).json({ error: 'Você não pode remover seu próprio vínculo com a clínica.' });
      }

      const { data: target, error: targetError } = await supabase
        .from('tenant_users')
        .select('id, tenant_id, user_id, email, role, role_slug')
        .eq('id', tenantUserId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target?.id) {
        return res.status(404).json({ error: 'Usuário não encontrado nesta clínica.' });
      }

      if (target.user_id && target.user_id === req.appAuthUser.id) {
        return res.status(400).json({ error: 'Você não pode remover seu próprio vínculo com a clínica.' });
      }

      const email = normalizeEmail(target.email);
      const { error: revokeError } = await supabase
        .from('invitations')
        .update({
          status: 'revoked',
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('email', email)
        .in('status', ['pending', 'sent']);
      if (revokeError) {
        const code = String(revokeError?.code || '').toUpperCase();
        const msg = String(revokeError?.message || '').toLowerCase();
        const missingInvitations = code === 'PGRST205' || code === '42P01'
          || (msg.includes('relation') && msg.includes('does not exist'));
        if (!missingInvitations) throw revokeError;
      }

      const { error: deleteError } = await supabase
        .from('tenant_users')
        .delete()
        .eq('id', tenantUserId)
        .eq('tenant_id', tenantId);
      if (deleteError) throw deleteError;

      return res.status(200).json({
        success: true,
        removed_tenant_user_id: tenantUserId,
        email,
      });
    } catch (err) {
      console.error('[app-users-unlink]', err);
      return res.status(400).json({
        error: normalizeDatabaseError(err, 'Falha ao remover vínculo do usuário.'),
      });
    }
  };
}
