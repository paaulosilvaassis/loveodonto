/**
 * Phase 4.10 Wave 3F — orquestradores provisionCollaboratorAccess e sendPasswordResetFlow.
 */

import { sendPasswordResetEmail } from '../../email/sendPasswordResetEmail.js';
import { identityLog } from '../../identity/identityProvisionLog.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createProvisionCollaboratorAccess(deps) {
  const {
    supabase,
    getTenantAdminActorOrThrow,
    normalizeText: normalizeTextDep,
    normalizeEmail,
    normalizeRoleValue,
    maskEmail,
    resolveCollaboratorIdForTenantEmailAccess,
    clearStaleTenantUserAuthReference,
    assertEmailAvailableForTenantInvite,
    findAuthUserByEmail,
    resolveAuthUserForInvite,
    assertAuthUserIdForTenantWrite,
    upsertTenantUserAccess,
    isInviteEmailDelivered,
    upsertInvitationRecord,
    tenantUserSelectBase,
    isMissingInvitationStatusColumnError,
    logAccessEmailAudit,
    appendAccessAuditToAuthUser,
  } = deps;

  const normText = normalizeTextDep || normalizeText;

  return async function provisionCollaboratorAccess({
    actorAuthUserId,
    tenantId,
    collaboratorId,
    collaboratorFullName,
    email,
    profileRole,
    sendInvite = true,
    repairStaleAuth = false,
    requestedAction = 'provision',
  }) {
    const audit = {
      tenantId: normText(tenantId) || null,
      collaboratorId: normText(collaboratorId) || null,
      email: maskEmail(email),
      requestedAction,
      repairStaleAuth: Boolean(repairStaleAuth),
      existingTenantUserId: null,
      existingCollaboratorAccessUserId: null,
      authUserFound: false,
      authUserId: null,
      linkType: null,
      inviteSent: false,
      recoverySent: false,
      repairedBrokenLink: false,
      finalStatus: null,
      error: null,
      emailDelivery: null,
    };

    let repairedBrokenLink = false;

    try {
      const actorTenantUser = await getTenantAdminActorOrThrow(actorAuthUserId, tenantId);
      const resolvedTenantId = actorTenantUser.tenant_id;
      audit.tenantId = resolvedTenantId;
      const normalizedEmail = normalizeEmail(email);
      const normalizedRole = normalizeRoleValue(profileRole);

      if (!normalizedEmail) throw new Error('E-mail é obrigatório para criar acesso.');
      if (!normalizedRole) throw new Error('Perfil de acesso é obrigatório.');

      const { data: existingTenantUserRow } = await supabase
        .from('tenant_users')
        .select('id, user_id, collaborator_id')
        .eq('tenant_id', resolvedTenantId)
        .eq('email', normalizedEmail)
        .maybeSingle();
      audit.existingTenantUserId = existingTenantUserRow?.id || null;
      audit.existingCollaboratorAccessUserId = existingTenantUserRow?.user_id || null;

      let resolvedCollaboratorId = await resolveCollaboratorIdForTenantEmailAccess(supabase, {
        tenantId: resolvedTenantId,
        tenantUserId: existingTenantUserRow?.id || null,
        tenantUserCollaboratorId: existingTenantUserRow?.collaborator_id,
        requestedCollaboratorId: collaboratorId,
        email: normalizedEmail,
      }) || collaboratorId;

      const shouldRepairStale = repairStaleAuth
        || sendInvite
        || Boolean(existingTenantUserRow?.user_id);
      if (shouldRepairStale) {
        repairedBrokenLink = await clearStaleTenantUserAuthReference(resolvedTenantId, normalizedEmail);
        audit.repairedBrokenLink = repairedBrokenLink;
      }

      await assertEmailAvailableForTenantInvite(resolvedTenantId, normalizedEmail, {
        collaboratorId: resolvedCollaboratorId,
      });

      const authBeforeInvite = await findAuthUserByEmail(normalizedEmail);
      audit.authUserFound = Boolean(authBeforeInvite?.id);

      const {
        authUser,
        inviteDelivery: earlyInviteDelivery,
        authUserExisted = false,
      } = await resolveAuthUserForInvite({
        normalizedEmail,
        sendInvite,
        tenantId: resolvedTenantId,
        role: normalizedRole,
        collaboratorId: resolvedCollaboratorId,
        collaboratorFullName,
        requestedAction,
      });

      audit.authUserFound = Boolean(authBeforeInvite?.id) || Boolean(authUserExisted);
      audit.authUserId = assertAuthUserIdForTenantWrite(authUser?.id, {
        email: normalizedEmail,
        tenantId: resolvedTenantId,
        phase: 'before_tenant_upsert',
      });

      const tenantUser = await upsertTenantUserAccess({
        tenantId: resolvedTenantId,
        collaboratorId: resolvedCollaboratorId,
        fullName: collaboratorFullName || normalizedEmail,
        email: normalizedEmail,
        role: normalizedRole,
        hasSystemAccess: true,
        invitationStatus: sendInvite ? 'pending' : 'none',
        authUserId: authUser?.id || null,
      });

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const inviteDelivery = earlyInviteDelivery;
      let invitationStatus = sendInvite ? 'pending' : 'none';

      if (sendInvite) {
        invitationStatus = isInviteEmailDelivered(inviteDelivery) ? 'sent' : 'pending';
      }
      audit.inviteSent = isInviteEmailDelivered(inviteDelivery);
      audit.emailDelivery = inviteDelivery?.emailDelivery || null;
      audit.linkType = inviteDelivery?.emailDelivery || null;
      audit.finalStatus = audit.inviteSent ? 'invite_sent' : (inviteDelivery?.setupLink ? 'setup_link' : 'access_linked');

      const invitation = await upsertInvitationRecord({
        tenantId: resolvedTenantId,
        tenantUserId: tenantUser.id,
        collaboratorId: resolvedCollaboratorId,
        email: normalizedEmail,
        profileRole: normalizedRole,
        createdBy: actorAuthUserId,
        status: sendInvite ? invitationStatus : 'pending',
        expiresAt,
      });

      let finalTenantUser = tenantUser;
      if (sendInvite) {
        const { data: updatedTenantUser, error: updatedTenantUserError } = await supabase
          .from('tenant_users')
          .update({ invitation_status: invitationStatus })
          .eq('id', tenantUser.id)
          .select(tenantUserSelectBase)
          .single();
        if (updatedTenantUserError) {
          if (!isMissingInvitationStatusColumnError(updatedTenantUserError)) throw updatedTenantUserError;
        } else {
          finalTenantUser = updatedTenantUser;
        }
      }

      logAccessEmailAudit(audit);

      if (sendInvite && !isInviteEmailDelivered(inviteDelivery)) {
        const err = new Error(
          inviteDelivery?.message
          || 'Não foi possível enviar o convite por e-mail. Verifique SUPABASE_ANON_KEY, SMTP do Supabase Auth ou EMAIL_API_KEY no Railway.',
        );
        err.code = 'INVITE_EMAIL_NOT_SENT';
        err.setupLink = inviteDelivery?.setupLink || null;
        throw err;
      }

      if (sendInvite && authUser?.id) {
        await appendAccessAuditToAuthUser(authUser.id, {
          action: requestedAction === 'resend' ? 'invite_resent' : 'invite_sent',
          label: requestedAction === 'resend' ? 'Reenviou convite de acesso' : 'Enviou convite de acesso',
          actor_id: actorAuthUserId,
          tenant_id: resolvedTenantId,
          collaborator_id: resolvedCollaboratorId,
          target_email: normalizedEmail,
          email_sent: audit.inviteSent,
          repaired_broken_link: repairedBrokenLink,
        });
      }

      return {
        tenantUser: finalTenantUser,
        invitation,
        inviteDelivery: inviteDelivery || null,
        authUserExisted,
        repairedBrokenLink,
      };
    } catch (err) {
      audit.error = String(err?.message || err || 'unknown');
      audit.finalStatus = 'error';
      logAccessEmailAudit(audit);
      throw err;
    }
  };
}

export function createSendPasswordResetFlow(deps) {
  const {
    supabase,
    normalizeEmail,
    normalizeRoleValue,
    normalizeInvitationStatus,
    provisionCollaboratorAccess,
    formatCollaboratorProvisionResponse,
    clearStaleTenantUserAuthReference,
    getValidAuthUserId,
    findAuthUserByEmail,
    createAuthUserForCollaboratorInvite,
    assertAuthUserIdForTenantWrite,
    sendCollaboratorInvite,
    isInviteEmailDelivered,
    getPasswordResetRedirectTo,
  } = deps;

  return async function sendPasswordResetFlow({
    actorAuthUserId,
    tenantId,
    email,
    collaboratorId,
    fullName,
    actor = {},
  }) {
    const targetEmail = normalizeEmail(email);

    const { data: tenantUser, error: tenantUserError } = await supabase
      .from('tenant_users')
      .select('id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, invitation_status')
      .eq('tenant_id', tenantId)
      .eq('email', targetEmail)
      .maybeSingle();
    if (tenantUserError) throw tenantUserError;

    if (!tenantUser?.id) {
      if (!collaboratorId) {
        throw new Error('Salve o acesso do colaborador antes de redefinir a senha.');
      }
      const provisioned = await provisionCollaboratorAccess({
        actorAuthUserId,
        tenantId,
        collaboratorId,
        collaboratorFullName: fullName || targetEmail,
        email: targetEmail,
        profileRole: 'atendimento',
        sendInvite: true,
        repairStaleAuth: true,
        requestedAction: 'provision',
      });
      const formatted = formatCollaboratorProvisionResponse(provisioned);
      return { message: formatted.message, auth_recreated: true, email_sent: formatted.emailSent };
    }

    await clearStaleTenantUserAuthReference(tenantId, targetEmail);

    let authUserId = await getValidAuthUserId(tenantUser.user_id);
    let authRecreated = false;
    if (!authUserId) authUserId = (await findAuthUserByEmail(targetEmail))?.id || null;
    if (!authUserId) {
      const role = normalizeRoleValue(tenantUser.role || tenantUser.role_slug || 'atendimento');
      const recreated = await createAuthUserForCollaboratorInvite({
        normalizedEmail: targetEmail,
        tenantId,
        role,
        collaboratorId: collaboratorId || tenantUser.collaborator_id,
        collaboratorFullName: tenantUser.full_name || targetEmail,
      });
      authUserId = recreated?.id || null;
      authRecreated = Boolean(authUserId);
      if (authUserId && authUserId !== tenantUser.user_id) {
        const safeUserId = assertAuthUserIdForTenantWrite(authUserId, {
          email: targetEmail,
          tenantId,
          tenantUserId: tenantUser.id,
          phase: 'password_reset_relink',
        });
        await supabase.from('tenant_users').update({ user_id: safeUserId }).eq('id', tenantUser.id);
        identityLog('tenant_user atualizado', { tenantUserId: tenantUser.id, userId: safeUserId });
      }
    }

    assertAuthUserIdForTenantWrite(authUserId, {
      email: targetEmail,
      tenantId,
      phase: 'password_reset',
    });

    if (authRecreated) {
      const role = normalizeRoleValue(tenantUser.role || tenantUser.role_slug || 'atendimento');
      const inviteDelivery = await sendCollaboratorInvite({
        email: targetEmail,
        tenantId,
        role,
        collaboratorId: collaboratorId || tenantUser.collaborator_id,
        collaboratorName: tenantUser.full_name,
        userName: tenantUser.full_name || targetEmail,
        profileRole: role,
      });
      return {
        message: 'Encontramos um problema na conta. Ela foi recriada automaticamente. Um novo convite foi enviado.',
        auth_recreated: true,
        email_sent: isInviteEmailDelivered(inviteDelivery),
      };
    }

    const invStatus = normalizeInvitationStatus(tenantUser.invitation_status || 'none');
    if (['sent', 'pending', 'expired'].includes(invStatus)) {
      const provisioned = await provisionCollaboratorAccess({
        actorAuthUserId,
        tenantId,
        collaboratorId: collaboratorId || tenantUser.collaborator_id || '',
        collaboratorFullName: tenantUser.full_name || targetEmail,
        email: targetEmail,
        profileRole: tenantUser.role || tenantUser.role_slug || 'atendimento',
        sendInvite: true,
        repairStaleAuth: true,
        requestedAction: 'resend',
      });
      const formatted = formatCollaboratorProvisionResponse(provisioned, { requestedAction: 'resend' });
      return {
        message: 'O colaborador ainda não concluiu o primeiro acesso. Reenviamos o convite por e-mail.',
        invite_resent: true,
        email_sent: formatted.emailSent,
      };
    }

    const resetDelivery = await sendPasswordResetEmail(supabase, {
      email: targetEmail,
      userName: tenantUser.full_name || targetEmail,
      redirectTo: getPasswordResetRedirectTo(),
      tenantId,
      collaboratorId: collaboratorId || tenantUser.collaborator_id || null,
    });

    return {
      message: `Link de redefinição enviado para: ${targetEmail}`,
      email_sent: Boolean(resetDelivery?.emailSent),
      auth_user_id: authUserId,
    };
  };
}
