import {
  IDENTITY_HEALTH,
  IDENTITY_STATUS,
  INVITATION_STATUS,
  PASSWORD_STATUS,
} from './constants.js';

function normalizeInvitationFromTenant(value) {
  const v = String(value || 'none').toLowerCase();
  if (v === 'pending') return INVITATION_STATUS.SENT;
  if (v === 'revoked') return INVITATION_STATUS.NONE;
  if (['none', 'sent', 'accepted', 'expired', 'failed'].includes(v)) return v;
  return INVITATION_STATUS.NONE;
}

export function mapTenantUserToIdentityFields(tenantUser, { collaboratorId = null } = {}) {
  const hasAccess = tenantUser?.has_system_access !== false
    && tenantUser?.is_active !== false
    && tenantUser?.status !== 'inactive';
  const inv = normalizeInvitationFromTenant(tenantUser?.invitation_status);
  const hasAuth = Boolean(tenantUser?.user_id);

  let status = IDENTITY_STATUS.ACTIVE;
  if (!hasAccess) status = IDENTITY_STATUS.DISABLED;
  else if (!hasAuth) status = IDENTITY_STATUS.INVITATION_PENDING;
  else if (['sent', 'none'].includes(inv) && inv !== INVITATION_STATUS.ACCEPTED) {
    status = IDENTITY_STATUS.INVITATION_PENDING;
  }

  let passwordStatus = hasAuth ? PASSWORD_STATUS.CREATED : PASSWORD_STATUS.PENDING;
  let health = IDENTITY_HEALTH.HEALTHY;
  if (!hasAuth) health = IDENTITY_HEALTH.AUTH_MISSING;
  if (!tenantUser?.collaborator_id && collaboratorId) health = IDENTITY_HEALTH.COLLABORATOR_LINK_MISSING;

  return {
    tenant_id: tenantUser.tenant_id,
    tenant_user_id: tenantUser.id,
    auth_user_id: tenantUser.user_id || null,
    email: String(tenantUser.email || '').trim().toLowerCase(),
    full_name: tenantUser.full_name || null,
    role_slug: tenantUser.role_slug || tenantUser.role || 'atendimento',
    collaborator_id: tenantUser.collaborator_id || collaboratorId || null,
    status,
    invitation_status: inv,
    password_status: passwordStatus,
    identity_health: health,
  };
}

export function createIdentityHealthEvaluator(deps) {
  const { supabase, getValidAuthUserId } = deps;

  async function evaluateIdentityRecord(identity, { tenantUser = null } = {}) {
    const issues = [];
    let health = IDENTITY_HEALTH.HEALTHY;

    let tu = tenantUser;
    if (!tu && identity.tenant_user_id) {
      const { data } = await supabase
        .from('tenant_users')
        .select('id, tenant_id, user_id, email, role, role_slug, collaborator_id, has_system_access, is_active, status, invitation_status')
        .eq('id', identity.tenant_user_id)
        .maybeSingle();
      tu = data;
    }
    if (!tu && identity.email) {
      const { data } = await supabase
        .from('tenant_users')
        .select('id, tenant_id, user_id, email, role, role_slug, collaborator_id, has_system_access, is_active, status, invitation_status')
        .eq('tenant_id', identity.tenant_id)
        .eq('email', String(identity.email).trim().toLowerCase())
        .maybeSingle();
      tu = data;
    }

    if (!tu) {
      issues.push('tenant_user_missing');
      health = IDENTITY_HEALTH.TENANT_USER_MISSING;
    }

    const authId = identity.auth_user_id || tu?.user_id || null;
    let authValid = false;
    if (authId) {
      authValid = Boolean(await getValidAuthUserId(authId));
      if (!authValid) {
        issues.push('auth_missing');
        health = IDENTITY_HEALTH.AUTH_MISSING;
      }
    } else {
      issues.push('auth_missing');
      health = IDENTITY_HEALTH.AUTH_MISSING;
    }

    if (identity.collaborator_id && tu && tu.collaborator_id !== identity.collaborator_id) {
      issues.push('collaborator_link_missing');
      if (health === IDENTITY_HEALTH.HEALTHY) health = IDENTITY_HEALTH.COLLABORATOR_LINK_MISSING;
    }

    if (tu && identity.email && String(tu.email).trim().toLowerCase() !== String(identity.email).trim().toLowerCase()) {
      issues.push('email_mismatch');
      if (health === IDENTITY_HEALTH.HEALTHY) health = IDENTITY_HEALTH.EMAIL_MISMATCH;
    }

    const tuRole = tu?.role_slug || tu?.role || 'atendimento';
    if (tu && identity.role_slug && tuRole !== identity.role_slug) {
      issues.push('role_mismatch');
      if (health === IDENTITY_HEALTH.HEALTHY) health = IDENTITY_HEALTH.ROLE_MISMATCH;
    }

    if (issues.length > 1) health = IDENTITY_HEALTH.NEEDS_REPAIR;

    return {
      identity_health: health,
      issues,
      tenant_user: tu || null,
      auth_valid: authValid,
      suggested_status: health === IDENTITY_HEALTH.AUTH_MISSING ? IDENTITY_STATUS.BROKEN_LINK : identity.status,
    };
  }

  async function evaluateIdentityHealth(identityId, tenantId) {
    const { data: identity, error } = await supabase
      .from('identities')
      .select('*')
      .eq('id', identityId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!identity) return null;
    return evaluateIdentityRecord(identity);
  }

  async function evaluateTenantHealth(tenantId, { limit = 500 } = {}) {
    const { data: identities, error } = await supabase
      .from('identities')
      .select('id, tenant_id, email, status, identity_health')
      .eq('tenant_id', tenantId)
      .limit(limit);
    if (error) throw error;

    const results = [];
    for (const row of identities || []) {
      const evaluation = await evaluateIdentityRecord(row);
      results.push({ identity_id: row.id, email: row.email, ...evaluation });
    }
    return results;
  }

  return {
    evaluateIdentityRecord,
    evaluateIdentityHealth,
    evaluateTenantHealth,
  };
}
