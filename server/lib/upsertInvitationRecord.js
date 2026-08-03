/**
 * Phase 4.10 Wave 3E — upsert de registro em invitations (identity/provisionamento).
 */

export function createUpsertInvitationRecord(deps) {
  const { supabase, normalizeInvitationStatus } = deps;

  return async function upsertInvitationRecord({
    tenantId,
    tenantUserId,
    collaboratorId,
    email,
    profileRole,
    createdBy,
    status = 'pending',
    expiresAt,
  }) {
    const normalizedStatus = normalizeInvitationStatus(status);
    const { data: existing, error: existingError } = await supabase
      .from('invitations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('email', email)
      .in('status', ['pending', 'sent'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;

    const payload = {
      tenant_id: tenantId,
      tenant_user_id: tenantUserId || null,
      collaborator_id: collaboratorId || null,
      email,
      profile_role: profileRole,
      status: normalizedStatus,
      expires_at: expiresAt,
      sent_at: normalizedStatus === 'sent' ? new Date().toISOString() : null,
      created_by: createdBy || null,
    };

    if (existing?.id) {
      const { data, error } = await supabase
        .from('invitations')
        .update(payload)
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    }

    const { data, error } = await supabase
      .from('invitations')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  };
}
