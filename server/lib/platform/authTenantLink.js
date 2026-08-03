/**
 * Phase 4.10 Wave 3I — criação Auth user + vínculo tenant_users (provisionamento platform).
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createAuthUserAndTenantLink(deps) {
  const {
    supabase,
    assertAuthUserIdForTenantWrite,
    identityLog,
  } = deps;

  return async function createAuthUserAndTenantLink({
    email,
    password,
    fullName,
    tenantId,
    roleSlug = 'master',
    cpf = '',
    phone = '',
  }) {
    const { data: authCreateData, error: authCreateError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: { tenant_id: tenantId, role: roleSlug },
    });
    if (authCreateError || !authCreateData?.user?.id) {
      throw authCreateError || new Error('Falha ao criar usuário no Supabase Auth.');
    }
    const authUserId = assertAuthUserIdForTenantWrite(authCreateData.user.id, { email, tenantId });
    identityLog('user_id encontrado', { userId: authUserId, source: 'createUser' });

    const tenantUserPayload = {
      tenant_id: tenantId,
      email,
      full_name: fullName,
      user_id: authUserId,
      role: roleSlug,
      role_slug: roleSlug,
      is_active: true,
      status: 'active',
      ...(cpf ? { cpf } : {}),
      ...(phone ? { phone } : {}),
    };

    const { data: existingTenantUser, error: existingTenantUserError } = await supabase
      .from('tenant_users')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('email', email)
      .maybeSingle();
    if (existingTenantUserError) {
      await supabase.auth.admin.deleteUser(authUserId).catch(() => {});
      throw existingTenantUserError;
    }

    let tenantUserQuery;
    if (existingTenantUser?.id) {
      tenantUserQuery = supabase
        .from('tenant_users')
        .update(tenantUserPayload)
        .eq('id', existingTenantUser.id);
    } else {
      tenantUserQuery = supabase
        .from('tenant_users')
        .insert(tenantUserPayload);
    }

    const { data: tenantUser, error: tenantUserError } = await tenantUserQuery
      .select('id, tenant_id, user_id, email, full_name, role, role_slug, is_active, status')
      .single();
    if (tenantUserError) {
      await supabase.auth.admin.deleteUser(authUserId).catch(() => {});
      throw tenantUserError;
    }
    if (!tenantUser?.user_id) {
      await supabase.auth.admin.deleteUser(authUserId).catch(() => {});
      throw new Error('Falha crítica: tenant_users persistido sem user_id.');
    }
    console.log('[ProvisionUser] tenant_users atualizado com user_id', {
      tenantUserId: tenantUser.id,
      userId: tenantUser.user_id,
      tenantId,
    });

    return {
      authUserId,
      tenantUser,
    };
  };
}
