/**
 * Phase 4.10 Wave 3I — audit log da Console (platform_admin_users).
 */

export function createInsertAuditLog(deps) {
  const { supabase } = deps;

  return async function insertAuditLog({
    actor,
    action,
    targetType,
    targetId,
    tenantId = null,
    metadata = {},
  }) {
    const payload = {
      actor_admin_id: actor?.id || null,
      actor_role: actor?.role || null,
      action,
      target_type: targetType,
      target_id: String(targetId || ''),
      tenant_id: tenantId,
      metadata: {
        ...(metadata && typeof metadata === 'object' ? metadata : { note: String(metadata || '') }),
        actor_email: actor?.email || null,
      },
    };
    const { error } = await supabase.from('audit_logs').insert(payload);
    if (error) throw error;
  };
}
