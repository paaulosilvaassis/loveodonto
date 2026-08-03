/**
 * Phase 4.10 Wave 3B — GET /internal/app/collaborators/access-audit.
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createCollaboratorsAccessAuditHandler(deps) {
  const { supabase, getTenantAdminActorOrThrow, normalizeEmail, getAuthUserMeta } = deps;

  return async function handleCollaboratorsAccessAudit(req, res) {
    try {
      const explicitTenantId = normalizeText(req.query?.tenant_id);
      const targetEmail = normalizeEmail(req.query?.email);
      if (!targetEmail) {
        return res.status(400).json({ message: 'E-mail é obrigatório.' });
      }

      const actorTenantUser = req.tenantContext?.tenantUser
        || await getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId);
      const tenantId = req.tenantContext?.tenantId || actorTenantUser.tenant_id;

      const { data: tenantUser, error } = await supabase
        .from('tenant_users')
        .select('id, user_id, email')
        .eq('tenant_id', tenantId)
        .eq('email', targetEmail)
        .maybeSingle();
      if (error) throw error;
      if (!tenantUser?.user_id) {
        return res.status(200).json({ success: true, events: [] });
      }

      const meta = await getAuthUserMeta(tenantUser.user_id);
      const events = Array.isArray(meta?.app_metadata?.access_audit_log)
        ? meta.app_metadata.access_audit_log
        : [];

      return res.status(200).json({ success: true, events });
    } catch (err) {
      return res.status(400).json({
        message: 'Não foi possível carregar o histórico de acesso.',
      });
    }
  };
}
