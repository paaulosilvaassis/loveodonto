/**
 * Phase 4.10 Wave 3C — PATCH /internal/app/collaborators/:collaboratorId/access.
 * Envelope V2: 400/404 { error }, 200 { success, tenant_user, audit, sessions_revoked, identity? }.
 */

import {
  TENANT_USER_SELECT_BASE,
  TENANT_USER_SELECT_WITH_ACCESS,
  omitHasSystemAccess,
} from './tenantUserFieldUtils.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createCollaboratorAccessToggleHandler(deps) {
  const {
    supabase,
    identityService,
    getTenantAdminActorOrThrow,
    resolveTenantUserForCollaboratorAccess,
    linkCollaboratorToTenantUser,
    revokeAuthUserSessions,
    isMissingHasSystemAccessColumnError,
    isMissingIdentitiesTableError,
    normalizeEmail,
    normalizeRoleValue,
    normalizeDatabaseError,
    resolveClientIp,
    logCollaboratorAccessAudit,
    appendAccessAuditToAuthUser,
    nodeEnv = process.env.NODE_ENV,
  } = deps;

  return async function handleCollaboratorAccessToggle(req, res) {
    try {
      const explicitTenantId = normalizeText(req.body?.tenant_id);
      const collaboratorId = normalizeText(req.params?.collaboratorId);
      const hasSystemAccess = Boolean(req.body?.has_system_access);
      const targetEmail = normalizeEmail(req.body?.email);
      const fullName = normalizeText(req.body?.full_name);
      const explicitTenantUserId = normalizeText(req.body?.tenant_user_id);
      const clientIp = resolveClientIp(req);

      if (!collaboratorId) {
        return res.status(400).json({ error: 'collaboratorId é obrigatório.' });
      }

      const actorTenantUser = req.tenantContext?.tenantUser
        || await getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId);
      const tenantId = req.tenantContext?.tenantId || actorTenantUser.tenant_id;
      const actorName = actorTenantUser.full_name || req.appAuthUser.email || 'Administrador';

      let existingTenantUser = await resolveTenantUserForCollaboratorAccess({
        actorAuthUserId: req.appAuthUser.id,
        tenantId,
        collaboratorId,
        email: targetEmail,
        fullName,
      });

      if (!existingTenantUser?.id && targetEmail) {
        existingTenantUser = await resolveTenantUserForCollaboratorAccess({
          actorAuthUserId: req.appAuthUser.id,
          tenantId,
          collaboratorId,
          email: targetEmail,
          fullName,
        });
      }

      if (!existingTenantUser?.id && explicitTenantUserId) {
        const { data: byId, error: byIdError } = await supabase
          .from('tenant_users')
          .select('id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, is_active, status, has_system_access, invitation_status, created_at, updated_at')
          .eq('tenant_id', tenantId)
          .eq('id', explicitTenantUserId)
          .maybeSingle();
        if (byIdError) throw byIdError;
        existingTenantUser = byId || null;
        if (
          existingTenantUser?.id
          && collaboratorId
          && targetEmail
          && existingTenantUser.collaborator_id !== collaboratorId
        ) {
          try {
            const linked = await linkCollaboratorToTenantUser({
              actorAuthUserId: req.appAuthUser.id,
              tenantId,
              collaboratorId,
              email: targetEmail,
              fullName,
            });
            existingTenantUser = linked.tenantUser || existingTenantUser;
          } catch (linkErr) {
            if (nodeEnv !== 'production') {
              console.debug('[app-collaborator-access-toggle] link skipped', linkErr?.message);
            }
          }
        }
      }

      if (!existingTenantUser?.id) {
        return res.status(404).json({
          error: 'Nenhum usuário de acesso encontrado para este colaborador. Envie um convite primeiro.',
        });
      }

      const resolvedEmail = targetEmail || existingTenantUser.email;
      const linkedIdentity = await identityService.resolveIdentityForCollaborator({
        tenantId,
        collaboratorId,
        email: resolvedEmail,
      }).catch((err) => {
        if (isMissingIdentitiesTableError(err)) return null;
        throw err;
      });

      if (linkedIdentity?.id) {
        const actor = {
          id: req.appAuthUser.id,
          email: req.appAuthUser.email,
          ip: clientIp,
          name: actorName,
        };
        const disableReason = normalizeText(req.body?.reason) || 'admin_request';
        const disableDescription = normalizeText(req.body?.reason_description);
        const expectedReturnAt = req.body?.expected_return_at || null;
        const isSuspension = req.body?.suspended === true || disableReason === 'suspension';

        let updatedIdentity;
        if (!hasSystemAccess) {
          updatedIdentity = await identityService.deactivateIdentity({
            identityId: linkedIdentity.id,
            tenantId,
            actorAuthUserId: req.appAuthUser.id,
            reason: disableReason,
            reasonDescription: disableDescription,
            expectedReturnAt,
            suspended: isSuspension,
            actor,
          });
        } else {
          updatedIdentity = await identityService.reactivateIdentity({
            identityId: linkedIdentity.id,
            tenantId,
            actorAuthUserId: req.appAuthUser.id,
            reason: normalizeText(req.body?.reason) || 'admin_correction',
            actor,
          });
        }

        const { data: tenantUserAfterIdentity } = await supabase
          .from('tenant_users')
          .select(TENANT_USER_SELECT_WITH_ACCESS)
          .eq('id', existingTenantUser.id)
          .eq('tenant_id', tenantId)
          .maybeSingle();

        const auditEntry = {
          action: hasSystemAccess ? 'access_reactivated' : 'access_deactivated',
          label: hasSystemAccess ? 'Reativou acesso ao sistema' : 'Desativou acesso ao sistema',
          actor_name: actorName,
          actor_id: req.appAuthUser.id,
          ip: clientIp,
          tenant_id: tenantId,
          collaborator_id: collaboratorId,
          target_email: resolvedEmail,
          reason: disableReason,
        };
        logCollaboratorAccessAudit(auditEntry);

        return res.status(200).json({
          success: true,
          tenant_user: tenantUserAfterIdentity || existingTenantUser,
          identity: updatedIdentity,
          audit: auditEntry,
          sessions_revoked: !hasSystemAccess,
        });
      }

      const previousStatus = {
        has_system_access: existingTenantUser.has_system_access !== false,
        role: normalizeRoleValue(existingTenantUser.role || existingTenantUser.role_slug || 'atendimento'),
        is_active: existingTenantUser.is_active !== false,
      };

      const updatePayload = {
        has_system_access: hasSystemAccess,
        is_active: hasSystemAccess,
        status: hasSystemAccess ? 'active' : 'inactive',
      };
      let tenantUser;
      try {
        const result = await supabase
          .from('tenant_users')
          .update(updatePayload)
          .eq('id', existingTenantUser.id)
          .eq('tenant_id', tenantId)
          .select(TENANT_USER_SELECT_WITH_ACCESS)
          .single();
        if (result.error) throw result.error;
        tenantUser = result.data;
      } catch (error) {
        if (!isMissingHasSystemAccessColumnError(error)) throw error;
        const fallbackResult = await supabase
          .from('tenant_users')
          .update(omitHasSystemAccess(updatePayload))
          .eq('id', existingTenantUser.id)
          .eq('tenant_id', tenantId)
          .select(TENANT_USER_SELECT_BASE)
          .single();
        if (fallbackResult.error) throw fallbackResult.error;
        tenantUser = fallbackResult.data;
      }

      if (!hasSystemAccess && tenantUser?.user_id) {
        await revokeAuthUserSessions(tenantUser.user_id);
      }

      const auditEntry = {
        action: hasSystemAccess ? 'access_reactivated' : 'access_deactivated',
        label: hasSystemAccess ? 'Reativou acesso ao sistema' : 'Desativou acesso ao sistema',
        actor_name: actorName,
        actor_id: req.appAuthUser.id,
        ip: clientIp,
        tenant_id: tenantId,
        collaborator_id: collaboratorId,
        target_email: tenantUser?.email || targetEmail || null,
        before: previousStatus,
        after: {
          has_system_access: hasSystemAccess,
          role: normalizeRoleValue(tenantUser?.role || tenantUser?.role_slug || previousStatus.role),
          is_active: hasSystemAccess,
        },
      };
      logCollaboratorAccessAudit(auditEntry);
      if (tenantUser?.user_id) {
        await appendAccessAuditToAuthUser(tenantUser.user_id, auditEntry);
      }

      return res.status(200).json({
        success: true,
        tenant_user: tenantUser,
        audit: auditEntry,
        sessions_revoked: !hasSystemAccess,
      });
    } catch (err) {
      console.error('[app-collaborator-access-toggle]', err);
      return res.status(400).json({
        error: normalizeDatabaseError(err, 'Falha ao atualizar bloqueio de acesso do colaborador.'),
      });
    }
  };
}
