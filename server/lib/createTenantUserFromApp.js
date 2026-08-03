/**
 * Phase 4.10 Wave 3D — domínio: criação de tenant_user via app (admin).
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createCreateTenantUserFromApp(deps) {
  const {
    supabase,
    getTenantAdminActorOrThrow,
    normalizeEmail,
    normalizeRoleValue,
    lookupAuthUserByEmail,
    requireAuthUserId,
    isAuthUserAlreadyRegisteredError,
    assertAuthUserIdForTenantWrite,
    upsertTenantUserAccess,
    sendCollaboratorInvite,
    isInviteEmailDelivered,
    upsertInvitationRecord,
  } = deps;

  return async function createTenantUserFromApp({
    actorAuthUserId,
    tenantId,
    collaboratorId,
    fullName,
    email,
    password,
    profileRole,
    status = 'active',
    sendInvite = false,
  }) {
    const actorTenantUser = await getTenantAdminActorOrThrow(actorAuthUserId, tenantId);
    const resolvedTenantId = actorTenantUser.tenant_id;
    const normalizedEmail = normalizeEmail(email);
    const normalizedRole = normalizeRoleValue(profileRole);
    const normalizedFullName = normalizeText(fullName);
    const passwordRaw = normalizeText(password);
    const isActive = String(status || 'active').toLowerCase() !== 'inactive';

    if (!normalizedEmail) throw new Error('email é obrigatório.');
    if (!passwordRaw || passwordRaw.length < 8) throw new Error('password deve ter pelo menos 8 caracteres.');
    if (!normalizedRole) throw new Error('profile_role é obrigatório.');
    if (!normalizedFullName) throw new Error('full_name é obrigatório.');

    const { data: existingByTenantEmail, error: existingByTenantEmailError } = await supabase
      .from('tenant_users')
      .select('id, user_id')
      .eq('tenant_id', resolvedTenantId)
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (existingByTenantEmailError) throw existingByTenantEmailError;
    if (existingByTenantEmail?.id) {
      const duplicateErr = new Error('Este e-mail já possui acesso nesta clínica.');
      duplicateErr.code = 'EMAIL_ALREADY_HAS_ACCESS';
      throw duplicateErr;
    }

    let authUser = await lookupAuthUserByEmail(supabase, normalizedEmail);
    if (!authUser?.id) {
      const { data: authCreateData, error: authCreateError } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: passwordRaw,
        email_confirm: true,
        user_metadata: { full_name: normalizedFullName },
        app_metadata: { tenant_id: resolvedTenantId, role: normalizedRole },
      });
      if (authCreateError) {
        if (isAuthUserAlreadyRegisteredError(authCreateError)) {
          authUser = await requireAuthUserId(supabase, normalizedEmail, { afterInviteError: authCreateError });
        } else {
          throw authCreateError;
        }
      } else {
        authUser = authCreateData?.user || null;
        authUser = await requireAuthUserId(supabase, normalizedEmail, { explicitUser: authUser });
      }
    }

    const tenantUser = await upsertTenantUserAccess({
      tenantId: resolvedTenantId,
      collaboratorId: normalizeText(collaboratorId) || null,
      fullName: normalizedFullName,
      email: normalizedEmail,
      role: normalizedRole,
      hasSystemAccess: isActive,
      invitationStatus: sendInvite ? 'pending' : 'none',
      authUserId: assertAuthUserIdForTenantWrite(authUser.id, { email: normalizedEmail, tenantId: resolvedTenantId }),
    });

    if (!tenantUser?.id) throw new Error('Falha ao criar vínculo do usuário no tenant.');

    let invitation = null;
    if (sendInvite) {
      const inviteDelivery = await sendCollaboratorInvite({
        email: normalizedEmail,
        tenantId: resolvedTenantId,
        role: normalizedRole,
        collaboratorId: normalizeText(collaboratorId) || null,
        collaboratorName: normalizedFullName,
        userName: normalizedFullName,
        profileRole: normalizedRole,
      });
      const invitationStatus = isInviteEmailDelivered(inviteDelivery) ? 'sent' : 'pending';
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      invitation = await upsertInvitationRecord({
        tenantId: resolvedTenantId,
        tenantUserId: tenantUser.id,
        collaboratorId: normalizeText(collaboratorId) || null,
        email: normalizedEmail,
        profileRole: normalizedRole,
        createdBy: actorAuthUserId,
        status: invitationStatus,
        expiresAt,
      });
      return { tenantUser, invitation, authUserId: authUser.id, inviteDelivery };
    }

    return { tenantUser, invitation, authUserId: authUser.id, inviteDelivery: null };
  };
}
