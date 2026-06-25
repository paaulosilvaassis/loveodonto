import {
  IDENTITY_EVENTS,
  IDENTITY_HEALTH,
  IDENTITY_STATUS,
  INVITATION_STATUS,
  PASSWORD_STATUS,
} from './constants.js';
import { logIdentityAudit } from './identityAudit.js';
import { createIdentityRepository, isMissingIdentitiesTableError } from './identityRepository.js';
import { createIdentityHealthEvaluator, mapTenantUserToIdentityFields } from './identityHealth.js';

function ctx(actor = {}) {
  return {
    actorUserId: actor.id || actor.userId || null,
    actorEmail: actor.email || null,
    ip: actor.ip || null,
    userAgent: actor.userAgent || null,
    origin: actor.origin || 'identity_service',
  };
}

export function createIdentityService(deps) {
  const repo = createIdentityRepository(deps.supabase);
  const health = createIdentityHealthEvaluator(deps);

  async function safeRecordEvent(event) {
    try {
      return await repo.recordEvent(event);
    } catch (err) {
      if (isMissingIdentitiesTableError(err)) return null;
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[IdentityService] recordEvent skipped', err?.message);
      }
      return null;
    }
  }

  async function safeUpsertIdentity(payload) {
    try {
      return await repo.upsertIdentity(payload);
    } catch (err) {
      if (isMissingIdentitiesTableError(err)) return null;
      throw err;
    }
  }

  async function syncFromTenantUser(tenantUser, { collaboratorId = null, patch = {} } = {}) {
    if (!tenantUser?.id || !tenantUser?.tenant_id) return null;
    const base = mapTenantUserToIdentityFields(tenantUser, { collaboratorId });
    return safeUpsertIdentity({ ...base, ...patch });
  }

  async function recordIdentityEvent(identity, action, {
    actor = {},
    previousStatus = null,
    newStatus = null,
    previousRole = null,
    newRole = null,
    result = 'success',
    message = null,
    details = {},
  } = {}) {
    const c = ctx(actor);
    logIdentityAudit({
      tenantId: identity?.tenant_id,
      identityId: identity?.id,
      collaboratorId: identity?.collaborator_id,
      email: identity?.email,
      action,
      previousStatus,
      newStatus,
      health: identity?.identity_health,
      authUserId: identity?.auth_user_id,
      tenantUserId: identity?.tenant_user_id,
      result,
      error: result === 'error' ? message : null,
    });
    return safeRecordEvent({
      tenant_id: identity?.tenant_id,
      identity_id: identity?.id,
      collaborator_id: identity?.collaborator_id,
      tenant_user_id: identity?.tenant_user_id,
      auth_user_id: identity?.auth_user_id,
      actor_user_id: c.actorUserId,
      actor_email: c.actorEmail,
      action,
      previous_status: previousStatus,
      new_status: newStatus,
      previous_role: previousRole,
      new_role: newRole,
      result,
      message,
      ip_address: c.ip,
      user_agent: c.userAgent,
      origin: c.origin,
      details,
    });
  }

  async function createIdentity({
    tenantId,
    email,
    fullName,
    roleSlug,
    collaboratorId = null,
    actor = {},
  }) {
    const normalizedEmail = deps.normalizeEmail(email);
    const identity = await safeUpsertIdentity({
      tenant_id: tenantId,
      email: normalizedEmail,
      full_name: fullName || normalizedEmail,
      role_slug: deps.normalizeRoleValue(roleSlug) || 'atendimento',
      collaborator_id: collaboratorId,
      status: IDENTITY_STATUS.INVITATION_PENDING,
      invitation_status: INVITATION_STATUS.NONE,
      password_status: PASSWORD_STATUS.PENDING,
      identity_health: IDENTITY_HEALTH.WAITING_SYNC,
    });
    if (identity) {
      await recordIdentityEvent(identity, IDENTITY_EVENTS.CREATED, { actor, newStatus: identity.status });
    }
    return identity;
  }

  async function provisionIdentity({
    actorAuthUserId,
    tenantId,
    collaboratorId,
    collaboratorFullName,
    email,
    profileRole,
    sendInvite = true,
    repairStaleAuth = true,
    actor = {},
    requestedAction = 'provision',
  }) {
    const provisioned = await deps.provisionCollaboratorAccess({
      actorAuthUserId,
      tenantId,
      collaboratorId,
      collaboratorFullName,
      email,
      profileRole,
      sendInvite,
      repairStaleAuth,
      requestedAction,
    });

    const tu = provisioned.tenantUser;
    const emailSent = deps.isInviteEmailDelivered(provisioned.inviteDelivery);
    const identityPatch = {
      tenant_id: tu?.tenant_id || tenantId,
      email: deps.normalizeEmail(email),
      full_name: collaboratorFullName || tu?.full_name,
      role_slug: deps.normalizeRoleValue(profileRole),
      collaborator_id: collaboratorId || tu?.collaborator_id,
      tenant_user_id: tu?.id || null,
      auth_user_id: tu?.user_id || null,
      status: emailSent ? IDENTITY_STATUS.INVITATION_PENDING : IDENTITY_STATUS.WAITING_SYNC,
      invitation_status: emailSent ? INVITATION_STATUS.SENT : INVITATION_STATUS.NONE,
      password_status: tu?.user_id ? PASSWORD_STATUS.CREATED : PASSWORD_STATUS.PENDING,
      identity_health: IDENTITY_HEALTH.HEALTHY,
      last_invite_sent_at: emailSent ? new Date().toISOString() : undefined,
    };

    if (tu?.user_id && provisioned.inviteDelivery) {
      const invStatus = String(tu.invitation_status || '').toLowerCase();
      if (invStatus === 'accepted') {
        identityPatch.status = IDENTITY_STATUS.ACTIVE;
        identityPatch.invitation_status = INVITATION_STATUS.ACCEPTED;
      }
    }

    const identity = tu ? await syncFromTenantUser(tu, { collaboratorId, patch: identityPatch }) : null;
    if (identity) {
      await recordIdentityEvent(identity, IDENTITY_EVENTS.PROVISIONED, {
        actor: { ...actor, id: actorAuthUserId },
        newStatus: identity.status,
        details: { email_sent: emailSent, requested_action: requestedAction },
      });
    }

    return {
      identity,
      provisioned,
      formatted: deps.formatCollaboratorProvisionResponse(provisioned, {
        authUserExisted: provisioned.authUserExisted,
        requestedAction,
      }),
    };
  }

  async function repairIdentity({
    identityId = null,
    tenantId,
    email = null,
    collaboratorId = null,
    actorAuthUserId,
    actor = {},
  }) {
    let identity = null;
    if (identityId) identity = await repo.findById(identityId, tenantId);
    else if (email) identity = await repo.findByEmail(tenantId, email);
    else if (collaboratorId) identity = await repo.findByCollaborator(tenantId, collaboratorId);

    const targetEmail = deps.normalizeEmail(email || identity?.email);
    const targetCollaboratorId = collaboratorId || identity?.collaborator_id;
    const targetRole = identity?.role_slug || 'atendimento';
    const targetName = identity?.full_name || targetEmail;

    if (identity?.tenant_user_id && identity?.auth_user_id) {
      await deps.clearStaleTenantUserAuthReference(tenantId, targetEmail);
    }

    const result = await provisionIdentity({
      actorAuthUserId,
      tenantId,
      collaboratorId: targetCollaboratorId,
      collaboratorFullName: targetName,
      email: targetEmail,
      profileRole: targetRole,
      sendInvite: true,
      repairStaleAuth: true,
      actor,
      requestedAction: 'repair',
    });

    const repaired = result.identity
      ? await repo.updateIdentity(result.identity.id, tenantId, {
        identity_health: IDENTITY_HEALTH.HEALTHY,
        status: IDENTITY_STATUS.REPAIRED,
      })
      : result.identity;

    if (repaired) {
      await recordIdentityEvent(repaired, IDENTITY_EVENTS.REPAIRED, {
        actor: { ...actor, id: actorAuthUserId },
        previousStatus: identity?.status,
        newStatus: repaired.status,
      });
    }

    return { identity: repaired || result.identity, ...result };
  }

  async function resendInvite({ identityId, tenantId, actorAuthUserId, actor = {} }) {
    const identity = await repo.findById(identityId, tenantId);
    if (!identity) throw new Error('Identidade não encontrada para reenvio de convite.');

    const result = await provisionIdentity({
      actorAuthUserId,
      tenantId,
      collaboratorId: identity.collaborator_id,
      collaboratorFullName: identity.full_name || identity.email,
      email: identity.email,
      profileRole: identity.role_slug,
      sendInvite: true,
      repairStaleAuth: true,
      actor,
      requestedAction: 'resend',
    });

    const updated = result.identity
      ? await repo.updateIdentity(result.identity.id, tenantId, {
        last_invite_sent_at: new Date().toISOString(),
        invitation_status: INVITATION_STATUS.SENT,
      })
      : result.identity;

    if (updated) {
      await recordIdentityEvent(updated, IDENTITY_EVENTS.INVITE_SENT, {
        actor: { ...actor, id: actorAuthUserId },
        message: result.formatted?.message,
      });
    }

    return { identity: updated, ...result };
  }

  async function resetPassword({ identityId, tenantId, actorAuthUserId, actor = {} }) {
    const identity = await repo.findById(identityId, tenantId);
    if (!identity) throw new Error('Identidade não encontrada.');

    const resetResult = await deps.sendPasswordResetFlow({
      actorAuthUserId,
      tenantId,
      email: identity.email,
      collaboratorId: identity.collaborator_id,
      fullName: identity.full_name,
      actor,
    });

    const updated = await repo.updateIdentity(identity.id, tenantId, {
      last_password_reset_sent_at: new Date().toISOString(),
      password_status: PASSWORD_STATUS.RESET_SENT,
      status: IDENTITY_STATUS.PASSWORD_RESET_SENT,
    });

    await recordIdentityEvent(updated, IDENTITY_EVENTS.PASSWORD_RESET_SENT, {
      actor: { ...actor, id: actorAuthUserId },
      message: resetResult?.message,
    });

    return { identity: updated, ...resetResult };
  }

  async function resetPasswordByEmail({
    tenantId,
    email,
    collaboratorId = null,
    actorAuthUserId,
    actor = {},
    collaboratorFullName = null,
    profileRole = null,
  }) {
    const normalizedEmail = deps.normalizeEmail(email);
    const identity = await resolveIdentityForCollaborator({
      tenantId,
      collaboratorId,
      email: normalizedEmail,
    });

    if (identity?.id) {
      return resetPassword({
        identityId: identity.id,
        tenantId,
        actorAuthUserId,
        actor,
      });
    }

    const resetResult = await deps.sendPasswordResetFlow({
      actorAuthUserId,
      tenantId,
      email: normalizedEmail,
      collaboratorId,
      fullName: collaboratorFullName || normalizedEmail,
      actor,
    });

    const synced = await syncFromTenantUser(
      resetResult?.tenant_user || null,
      { collaboratorId, patch: { email: normalizedEmail } },
    ).catch(() => null);

    if (synced) {
      await recordIdentityEvent(synced, IDENTITY_EVENTS.PASSWORD_RESET_SENT, {
        actor: { ...actor, id: actorAuthUserId },
        message: resetResult?.message,
      });
    }

    return { identity: synced, ...resetResult };
  }

  async function deactivateIdentity({
    identityId,
    tenantId,
    actorAuthUserId,
    reason,
    reasonDescription = '',
    expectedReturnAt = null,
    suspended = false,
    actor = {},
  }) {
    const identity = await repo.findById(identityId, tenantId);
    if (!identity) throw new Error('Identidade não encontrada.');

    await deps.setCollaboratorAccessState({
      collaboratorId: identity.collaborator_id,
      tenantId,
      email: identity.email,
      fullName: identity.full_name,
      tenantUserId: identity.tenant_user_id,
      hasSystemAccess: false,
      actorAuthUserId,
    });

    if (identity.auth_user_id) {
      await deps.revokeAuthUserSessions(identity.auth_user_id);
    }

    const newStatus = suspended ? IDENTITY_STATUS.SUSPENDED : IDENTITY_STATUS.DISABLED;
    const updated = await repo.updateIdentity(identity.id, tenantId, {
      status: newStatus,
      disabled_at: new Date().toISOString(),
      disabled_by: actorAuthUserId,
      disabled_reason: reason,
      disabled_reason_description: reasonDescription || null,
      expected_return_at: expectedReturnAt || null,
    });

    await recordIdentityEvent(updated, IDENTITY_EVENTS.DISABLED, {
      actor: { ...actor, id: actorAuthUserId },
      previousStatus: identity.status,
      newStatus,
      details: { reason, expected_return_at: expectedReturnAt },
    });

    return updated;
  }

  async function reactivateIdentity({
    identityId,
    tenantId,
    actorAuthUserId,
    reason,
    actor = {},
  }) {
    const identity = await repo.findById(identityId, tenantId);
    if (!identity) throw new Error('Identidade não encontrada.');

    await deps.setCollaboratorAccessState({
      collaboratorId: identity.collaborator_id,
      tenantId,
      email: identity.email,
      fullName: identity.full_name,
      tenantUserId: identity.tenant_user_id,
      hasSystemAccess: true,
      actorAuthUserId,
    });

    const updated = await repo.updateIdentity(identity.id, tenantId, {
      status: IDENTITY_STATUS.ACTIVE,
      identity_health: IDENTITY_HEALTH.HEALTHY,
      reactivated_at: new Date().toISOString(),
      reactivated_by: actorAuthUserId,
      reactivation_reason: reason,
      disabled_at: null,
      disabled_by: null,
      disabled_reason: null,
      disabled_reason_description: null,
    });

    await recordIdentityEvent(updated, IDENTITY_EVENTS.REACTIVATED, {
      actor: { ...actor, id: actorAuthUserId },
      previousStatus: identity.status,
      newStatus: updated.status,
      details: { reason },
    });

    return updated;
  }

  async function activateIdentity(params) {
    return reactivateIdentity(params);
  }

  async function deactivateIdentityAlias(params) {
    return deactivateIdentity(params);
  }

  async function revokeSessions({ identityId, tenantId, actorAuthUserId, actor = {} }) {
    const identity = await repo.findById(identityId, tenantId);
    if (!identity?.auth_user_id) return { revoked: false, identity };
    const revoked = await deps.revokeAuthUserSessions(identity.auth_user_id);
    await recordIdentityEvent(identity, IDENTITY_EVENTS.SESSION_REVOKED, {
      actor: { ...actor, id: actorAuthUserId },
      details: { revoked },
    });
    return { revoked, identity };
  }

  async function syncIdentity({ identityId, tenantId, actor = {} }) {
    const identity = await repo.findById(identityId, tenantId);
    if (!identity) return null;
    let tu = null;
    if (identity.tenant_user_id) {
      const { data } = await deps.supabase
        .from('tenant_users')
        .select('*')
        .eq('id', identity.tenant_user_id)
        .maybeSingle();
      tu = data;
    }
    if (!tu && identity.email) {
      const { data } = await deps.supabase
        .from('tenant_users')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('email', identity.email)
        .maybeSingle();
      tu = data;
    }
    if (!tu) return identity;
    const synced = await syncFromTenantUser(tu, { collaboratorId: identity.collaborator_id });
    await recordIdentityEvent(synced || identity, IDENTITY_EVENTS.HEALTH_CHECKED, {
      actor,
      message: 'Sincronização concluída',
    });
    return synced;
  }

  async function validateIdentity({ identityId, tenantId }) {
    const evaluation = await health.evaluateIdentityHealth(identityId, tenantId);
    return evaluation;
  }

  async function getIdentityHealth({ identityId, tenantId }) {
    return validateIdentity({ identityId, tenantId });
  }

  async function evaluateIdentityHealthBulk({ tenantId, actor = {} }) {
    const results = await health.evaluateTenantHealth(tenantId);
    let updated = 0;
    for (const row of results) {
      if (!row.identity_id) continue;
      await repo.updateIdentity(row.identity_id, tenantId, {
        identity_health: row.identity_health,
        status: row.suggested_status || undefined,
      }).catch(() => {});
      updated += 1;
      await safeRecordEvent({
        tenant_id: tenantId,
        identity_id: row.identity_id,
        action: IDENTITY_EVENTS.HEALTH_CHECKED,
        result: 'success',
        message: row.issues?.join(', ') || 'healthy',
        details: { issues: row.issues },
        actor_user_id: actor.id || null,
      });
    }
    return { evaluated: results.length, updated, results };
  }

  async function resolveIdentityForCollaborator({ tenantId, collaboratorId, email }) {
    try {
      let identity = collaboratorId
        ? await repo.findByCollaborator(tenantId, collaboratorId)
        : null;
      if (!identity && email) identity = await repo.findByEmail(tenantId, email);
      return identity;
    } catch (err) {
      if (isMissingIdentitiesTableError(err)) return null;
      throw err;
    }
  }

  return {
    createIdentity,
    provisionIdentity,
    repairIdentity,
    resendInvite,
    resetPassword,
    resetPasswordByEmail,
    activateIdentity,
    deactivateIdentity,
    reactivateIdentity,
    syncIdentity,
    validateIdentity,
    revokeSessions,
    getIdentityHealth,
    recordIdentityEvent,
    evaluateIdentityHealth: evaluateIdentityHealthBulk,
    resolveIdentityForCollaborator,
    repo,
    health,
  };
}
