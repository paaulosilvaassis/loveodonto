/**
 * Phase 4.10 Wave 3C — POST /internal/app/collaborators/access-bundle.
 * Envelope V2: 400 { error }, 404 { error }, 200 { success, tenant_user_id, target_user_id }.
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createCollaboratorsAccessBundleHandler(deps) {
  const {
    supabase,
    identityService,
    getTenantAdminActorOrThrow,
    getValidAuthUserId,
    clearStaleTenantUserAuthReference,
    resolveAuthUserIdForTenantLink,
    assertAuthUserIdForTenantWrite,
    normalizeEmail,
    normalizeRoleValue,
    normalizeDatabaseError,
    resolveClientIp,
    nodeEnv = process.env.NODE_ENV,
  } = deps;

  return async function handleCollaboratorsAccessBundle(req, res) {
    try {
      const explicitTenantId = normalizeText(req.body?.tenant_id);
      const collaboratorId = normalizeText(req.body?.collaborator_id);
      const targetUserIdInput = normalizeText(req.body?.target_user_id);
      const emailFromBody = normalizeEmail(req.body?.email);
      const passwordRaw = normalizeText(req.body?.password);
      const roleSlug = normalizeRoleValue(req.body?.role);
      const hasSystemAccess = req.body?.has_system_access !== false;
      const rawOverrides = req.body?.permission_overrides;
      const permissionOverrides =
        rawOverrides && typeof rawOverrides === 'object' && !Array.isArray(rawOverrides) ? rawOverrides : {};
      const hasCustomPermissions = req.body?.has_custom_permissions === true;
      const rawCustomPermissions = req.body?.custom_permissions;
      const customPermissions = hasCustomPermissions
        && rawCustomPermissions
        && typeof rawCustomPermissions === 'object'
        && !Array.isArray(rawCustomPermissions)
        ? rawCustomPermissions
        : null;

      if (!targetUserIdInput) {
        return res.status(400).json({ error: 'target_user_id é obrigatório.' });
      }
      if (passwordRaw && passwordRaw.length > 0 && passwordRaw.length < 8) {
        return res.status(400).json({ error: 'password deve ter pelo menos 8 caracteres.' });
      }

      const actorTenantUser = req.tenantContext?.tenantUser
        || await getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId);
      const tenantId = req.tenantContext?.tenantId || actorTenantUser.tenant_id;

      let validTargetUserId = await getValidAuthUserId(targetUserIdInput);
      if (!validTargetUserId && emailFromBody) {
        await clearStaleTenantUserAuthReference(tenantId, emailFromBody);
      }

      const { data: tuByUserId, error: tuByUserErr } = await supabase
        .from('tenant_users')
        .select('id, user_id, tenant_id, full_name, email, collaborator_id')
        .eq('tenant_id', tenantId)
        .eq('user_id', validTargetUserId || targetUserIdInput)
        .maybeSingle();
      let resolvedTuRow = tuByUserId;
      let tuLookupErr = tuByUserErr;

      if (!resolvedTuRow?.id && emailFromBody) {
        const byEmail = await supabase
          .from('tenant_users')
          .select('id, user_id, tenant_id, full_name, email, collaborator_id')
          .eq('tenant_id', tenantId)
          .eq('email', emailFromBody)
          .maybeSingle();
        tuLookupErr = byEmail.error;
        resolvedTuRow = byEmail.data || null;
        if (resolvedTuRow?.user_id) {
          validTargetUserId = await getValidAuthUserId(resolvedTuRow.user_id);
        }
      }

      if (tuLookupErr) throw tuLookupErr;
      if (!resolvedTuRow?.id) {
        return res.status(404).json({
          error: 'Usuário não encontrado em tenant_users para esta clínica. Vincule o acesso em /configuracoes/usuarios antes de editar credenciais.',
        });
      }

      const email = emailFromBody || normalizeEmail(resolvedTuRow.email);
      if (!email) {
        return res.status(400).json({ error: 'email é obrigatório (informe no formulário ou em tenant_users).' });
      }

      validTargetUserId = validTargetUserId
        || await resolveAuthUserIdForTenantLink({
          normalizedEmail: email,
          explicitAuthUserId: targetUserIdInput,
          existingTenantUser: resolvedTuRow,
        });

      if (!validTargetUserId) {
        return res.status(400).json({
          error:
            'Não foi possível vincular o e-mail: conta no Auth ausente. '
            + 'Salve o acesso novamente na aba Acesso ao sistema para reenviar o convite.',
        });
      }

      const tuRow = resolvedTuRow;
      const targetUserId = assertAuthUserIdForTenantWrite(validTargetUserId, {
        email,
        tenantId,
        tenantUserId: tuRow.id,
        phase: 'access_bundle',
      });

      const baseTenantUpdate = {
        email,
        user_id: targetUserId,
        role: roleSlug,
        role_slug: roleSlug,
        is_active: hasSystemAccess,
        status: hasSystemAccess ? 'active' : 'inactive',
      };
      const tenantVariants = [];
      const withAccess = { ...baseTenantUpdate, has_system_access: hasSystemAccess };
      if (collaboratorId) {
        tenantVariants.push({ ...withAccess, collaborator_id: collaboratorId });
      }
      tenantVariants.push({ ...withAccess });
      if (collaboratorId) {
        tenantVariants.push({ ...baseTenantUpdate, collaborator_id: collaboratorId });
      }
      tenantVariants.push({ ...baseTenantUpdate });

      let lastTenantUpdErr = null;
      for (const variant of tenantVariants) {
        const { error: updErr } = await supabase
          .from('tenant_users')
          .update(variant)
          .eq('id', tuRow.id)
          .eq('tenant_id', tenantId);
        if (!updErr) {
          lastTenantUpdErr = null;
          break;
        }
        lastTenantUpdErr = updErr;
      }
      if (lastTenantUpdErr) throw lastTenantUpdErr;

      const { data: authData, error: authGetErr } = await supabase.auth.admin.getUserById(targetUserId);
      if (authGetErr || !authData?.user?.id) {
        throw authGetErr || new Error('Falha ao ler usuário no Auth.');
      }
      const prevMeta = authData.user.app_metadata && typeof authData.user.app_metadata === 'object'
        ? authData.user.app_metadata
        : {};
      const nextMeta = {
        ...prevMeta,
        tenant_id: tenantId,
        role: roleSlug,
        has_custom_permissions: hasCustomPermissions,
        permission_overrides: hasCustomPermissions ? permissionOverrides : {},
      };
      if (hasCustomPermissions && customPermissions) {
        nextMeta.custom_permissions = customPermissions;
      } else {
        delete nextMeta.custom_permissions;
      }
      const authUpdate = { app_metadata: nextMeta };
      const prevEmail = normalizeEmail(authData.user.email);
      if (email && email !== prevEmail) {
        authUpdate.email = email;
      }
      if (passwordRaw && passwordRaw.length >= 8) {
        authUpdate.password = passwordRaw;
      }
      const { error: authUpdErr } = await supabase.auth.admin.updateUserById(targetUserId, authUpdate);
      if (authUpdErr) throw authUpdErr;

      if (identityService) {
        try {
          const linkedIdentity = await identityService.resolveIdentityForCollaborator({
            tenantId,
            collaboratorId: collaboratorId || tuRow.collaborator_id,
            email,
          });
          if (linkedIdentity?.id) {
            await identityService.syncIdentity({
              identityId: linkedIdentity.id,
              tenantId,
              actor: { id: req.appAuthUser.id, email: req.appAuthUser.email, ip: resolveClientIp(req) },
            });
          } else if (collaboratorId || email) {
            await identityService.createIdentity({
              tenantId,
              email,
              fullName: tuRow.full_name || email,
              roleSlug,
              collaboratorId: collaboratorId || tuRow.collaborator_id,
              actor: { id: req.appAuthUser.id, email: req.appAuthUser.email },
            });
          }
        } catch (identityErr) {
          if (nodeEnv !== 'production') {
            console.debug('[access-bundle] identity sync skipped', identityErr?.message);
          }
        }
      }

      return res.status(200).json({
        success: true,
        tenant_user_id: tuRow.id,
        target_user_id: targetUserId,
      });
    } catch (err) {
      console.error('[app-collaborators-access-bundle]', err);
      return res.status(400).json({
        error: normalizeDatabaseError(err, 'Falha ao salvar credenciais e permissões.'),
      });
    }
  };
}
