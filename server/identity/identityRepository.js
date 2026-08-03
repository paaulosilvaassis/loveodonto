const IDENTITY_SELECT = [
  'id', 'tenant_id', 'collaborator_id', 'tenant_user_id', 'auth_user_id', 'email', 'full_name',
  'role_slug', 'status', 'invitation_status', 'password_status', 'identity_health',
  'last_login_at', 'last_invite_sent_at', 'last_password_reset_sent_at',
  'disabled_at', 'disabled_by', 'disabled_reason', 'disabled_reason_description',
  'expected_return_at', 'reactivated_at', 'reactivated_by', 'reactivation_reason',
  'permissions_version', 'metadata', 'created_at', 'updated_at',
].join(', ');

export function isMissingIdentitiesTableError(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return code === 'PGRST205' || code === '42P01'
    || (message.includes('identities') && message.includes('does not exist'));
}

export function createIdentityRepository(supabase) {
  async function findById(id, tenantId) {
    let q = supabase.from('identities').select(IDENTITY_SELECT).eq('id', id);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return data;
  }

  async function findByEmail(tenantId, email) {
    const normalized = String(email || '').trim().toLowerCase();
    const { data, error } = await supabase
      .from('identities')
      .select(IDENTITY_SELECT)
      .eq('tenant_id', tenantId)
      .eq('email', normalized)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function findByCollaborator(tenantId, collaboratorId) {
    const { data, error } = await supabase
      .from('identities')
      .select(IDENTITY_SELECT)
      .eq('tenant_id', tenantId)
      .eq('collaborator_id', String(collaboratorId || '').trim())
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function listByTenant(tenantId, { limit = 100, offset = 0, health = null, status = null } = {}) {
    let q = supabase
      .from('identities')
      .select(IDENTITY_SELECT, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (health) q = q.eq('identity_health', health);
    if (status) q = q.eq('status', status);
    const { data, error, count } = await q;
    if (error) throw error;
    return { identities: data || [], total: count || 0 };
  }

  async function upsertIdentity(payload) {
    const email = String(payload.email || '').trim().toLowerCase();
    const row = {
      tenant_id: payload.tenant_id,
      email,
      full_name: payload.full_name || null,
      role_slug: payload.role_slug || 'atendimento',
      collaborator_id: payload.collaborator_id || null,
      tenant_user_id: payload.tenant_user_id || null,
      auth_user_id: payload.auth_user_id || null,
      status: payload.status || 'invitation_pending',
      invitation_status: payload.invitation_status || 'none',
      password_status: payload.password_status || 'pending',
      identity_health: payload.identity_health || 'healthy',
      last_login_at: payload.last_login_at || null,
      last_invite_sent_at: payload.last_invite_sent_at || null,
      last_password_reset_sent_at: payload.last_password_reset_sent_at || null,
      disabled_at: payload.disabled_at ?? undefined,
      disabled_by: payload.disabled_by ?? undefined,
      disabled_reason: payload.disabled_reason ?? undefined,
      disabled_reason_description: payload.disabled_reason_description ?? undefined,
      expected_return_at: payload.expected_return_at ?? undefined,
      reactivated_at: payload.reactivated_at ?? undefined,
      reactivated_by: payload.reactivated_by ?? undefined,
      reactivation_reason: payload.reactivation_reason ?? undefined,
      permissions_version: payload.permissions_version ?? undefined,
      metadata: payload.metadata ?? undefined,
    };

    const { data, error } = await supabase
      .from('identities')
      .upsert(row, { onConflict: 'tenant_id,email' })
      .select(IDENTITY_SELECT)
      .single();
    if (error) throw error;
    return data;
  }

  async function updateIdentity(id, tenantId, patch) {
    const { data, error } = await supabase
      .from('identities')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select(IDENTITY_SELECT)
      .single();
    if (error) throw error;
    return data;
  }

  async function recordEvent(event) {
    const { data, error } = await supabase
      .from('identity_events')
      .insert({
        tenant_id: event.tenant_id,
        identity_id: event.identity_id || null,
        collaborator_id: event.collaborator_id || null,
        tenant_user_id: event.tenant_user_id || null,
        auth_user_id: event.auth_user_id || null,
        actor_user_id: event.actor_user_id || null,
        actor_email: event.actor_email || null,
        action: event.action,
        previous_status: event.previous_status || null,
        new_status: event.new_status || null,
        previous_role: event.previous_role || null,
        new_role: event.new_role || null,
        result: event.result || 'success',
        message: event.message || null,
        ip_address: event.ip_address || null,
        user_agent: event.user_agent || null,
        origin: event.origin || null,
        details: event.details || {},
      })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async function listEvents(identityId, tenantId, limit = 50) {
    const { data, error } = await supabase
      .from('identity_events')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('identity_id', identityId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }

  async function countByHealth(tenantId) {
    const { data, error } = await supabase
      .from('identities')
      .select('identity_health, status')
      .eq('tenant_id', tenantId);
    if (error) throw error;
    const rows = data || [];
    const summary = {
      total: rows.length,
      active: rows.filter((r) => r.status === 'active').length,
      invitation_pending: rows.filter((r) => r.status === 'invitation_pending').length,
      disabled: rows.filter((r) => ['disabled', 'suspended'].includes(r.status)).length,
      needs_repair: rows.filter((r) => r.identity_health !== 'healthy').length,
      broken_link: rows.filter((r) => r.status === 'broken_link' || r.identity_health === 'auth_missing').length,
      never_logged_in: rows.filter((r) => !r.last_login_at && r.status === 'active').length,
    };
    return summary;
  }

  return {
    findById,
    findByEmail,
    findByCollaborator,
    listByTenant,
    upsertIdentity,
    updateIdentity,
    recordEvent,
    listEvents,
    countByHealth,
  };
}
