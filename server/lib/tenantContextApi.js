/**
 * Phase 4.10 Wave 3B — GET /internal/app/tenant-context.
 * Membership via ?tenant_id (legado); envelope V2 preservado.
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createTenantContextHandler(deps) {
  const {
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
    isOptionalTenantLimitsError,
    isMissingHasSystemAccessColumnError,
    resolveClinicProfileForTenant,
    enrichTeamRosterWithPermissionFields,
    getAuthUserMeta,
    extractPermissionFieldsFromAppMetadata,
    buildModuleMap,
    buildFeatureFlags,
    normalizeStatus,
    normalizeDatabaseError,
  } = deps;

  return async function handleTenantContext(req, res) {
    try {
      const authUserId = req.appAuthUser.id;
      const explicitTenantId = normalizeText(req.query?.tenant_id);
      const tenantUser = await resolveActiveTenantUser(
        authUserId,
        explicitTenantId,
        req.appAuthUser.email,
      );
      if (!tenantUser?.tenant_id) {
        return res.status(403).json({
          error:
            'Usuário sem vínculo ativo em tenant_users. '
            + 'Entre em contato com o administrador da clínica.',
          code: 'TENANT_MEMBERSHIP_REQUIRED',
        });
      }

      console.log('[TENANT_AUDIT]', {
        user_id: authUserId,
        email: req.appAuthUser.email,
        tenant_id: tenantUser.tenant_id,
        role: tenantUser.role || tenantUser.role_slug,
        link_source: 'tenant_users',
        status: tenantUser.status,
        at: new Date().toISOString(),
      });

      const tenantId = tenantUser.tenant_id;
      const [
        tenantResult,
        modulesResult,
        globalFlagsResult,
        tenantFlagsResult,
        subscriptionResult,
        limitsResult,
      ] = await Promise.all([
        supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle(),
        supabase.from('tenant_modules').select('module_key, enabled').eq('tenant_id', tenantId),
        supabase.from('feature_flags').select('flag_key, enabled').eq('scope_type', 'global'),
        supabase.from('feature_flags').select('flag_key, enabled').eq('scope_type', 'tenant').eq('scope_ref', tenantId),
        supabase.from('tenant_subscriptions').select('*').eq('tenant_id', tenantId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('tenant_limits').select('limits_json').eq('tenant_id', tenantId).maybeSingle(),
      ]);

      if (tenantResult.error) throw tenantResult.error;
      if (modulesResult.error) throw modulesResult.error;
      if (globalFlagsResult.error) throw globalFlagsResult.error;
      if (tenantFlagsResult.error) throw tenantFlagsResult.error;
      if (subscriptionResult.error) throw subscriptionResult.error;
      if (limitsResult.error && !isOptionalTenantLimitsError(limitsResult.error)) {
        throw limitsResult.error;
      }

      const tenant = tenantResult.data || null;
      if (!tenant) {
        return res.status(404).json({
          error:
            'Clínica não encontrada em `tenants` para o vínculo em tenant_users. '
            + 'O provisionamento pode estar incompleto — refaça ou corrija na Platform Console (5177).',
        });
      }
      const subscription = subscriptionResult.data || null;
      const warnings = [];
      const tenantStatus = normalizeStatus(tenant?.status);
      const billingStatus = normalizeStatus(tenant?.billing_status || subscription?.status);
      if (['blocked', 'billing_blocked', 'suspended', 'cancelled', 'canceled'].includes(tenantStatus)) {
        warnings.push(`Status da clínica: ${tenantStatus}`);
      }
      if (tenantStatus === 'billing_blocked') {
        warnings.push('Acesso suspenso por inadimplência SaaS');
      }
      if (['overdue', 'past_due', 'block_recommended', 'due_today'].includes(billingStatus)) {
        warnings.push('Existem pendências de cobrança');
      }

      let teamRoster = [];
      const rosterSelects = [
        'id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, is_active, status, has_system_access',
        'id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, is_active, status',
      ];
      for (const sel of rosterSelects) {
        const { data: rosterRows, error: rosterErr } = await supabase
          .from('tenant_users')
          .select(sel)
          .eq('tenant_id', tenantId)
          .order('full_name', { ascending: true });
        if (!rosterErr) {
          teamRoster = await enrichTeamRosterWithPermissionFields(
            (rosterRows || []).filter(isActiveTenantUserRow),
          );
          break;
        }
        if (!isMissingHasSystemAccessColumnError(rosterErr)) throw rosterErr;
      }

      let clinicProfile = null;
      try {
        clinicProfile = await resolveClinicProfileForTenant(supabase, tenantId, tenant);
      } catch (profileErr) {
        if (profileErr?.code === 'TENANT_PROFILE_MISMATCH') {
          console.error('[TENANT_PROFILE_MISMATCH]', {
            tenant_id: tenantId,
            user_id: authUserId,
            email: req.appAuthUser.email,
          });
          return res.status(403).json({
            error: 'Perfil da clínica inconsistente com o vínculo do usuário.',
            code: 'TENANT_PROFILE_MISMATCH',
          });
        }
        throw profileErr;
      }

      if (!clinicProfile?.tenant_id) {
        console.error('[TENANT_PROFILE_MISSING]', {
          tenant_id: tenantId,
          user_id: authUserId,
          email: req.appAuthUser.email,
        });
        return res.status(422).json({
          error: 'Clínica não configurada para este usuário.',
          code: 'TENANT_PROFILE_MISSING',
        });
      }

      const authMeta = req.appAuthUser?.app_metadata && typeof req.appAuthUser.app_metadata === 'object'
        ? req.appAuthUser.app_metadata
        : {};
      const currentUserAuthMeta = await getAuthUserMeta(authUserId);
      const permissionFields = extractPermissionFieldsFromAppMetadata(
        currentUserAuthMeta?.app_metadata || authMeta,
      );
      const tenantHasCustom = tenantUser.has_custom_permissions === true;

      res.json({
        tenant,
        clinicProfile,
        modules: buildModuleMap(modulesResult.data || []),
        flags: buildFeatureFlags(globalFlagsResult.data || [], tenantFlagsResult.data || []),
        limits: limitsResult.data?.limits_json || {},
        subscription,
        warnings,
        access: {
          tenantId,
          role: tenantUser.role || tenantUser.role_slug || 'atendimento',
          isActive: tenantUser.is_active ?? tenantUser.status === 'active',
          invitationStatus: tenantUser.invitation_status || 'none',
          collaboratorId: tenantUser.collaborator_id || null,
          clinicId: clinicProfile.clinic_id || null,
        },
        currentUser: {
          id: authUserId,
          fullName: tenantUser.full_name || req.appAuthUser.user_metadata?.full_name || '',
          email: tenantUser.email || req.appAuthUser.email || '',
          role: tenantUser.role || tenantUser.role_slug || 'atendimento',
          isActive: tenantUser.is_active ?? true,
          collaboratorId: tenantUser.collaborator_id || null,
          permissionOverrides: tenantHasCustom ? permissionFields.permission_overrides : {},
          has_custom_permissions: tenantHasCustom,
          custom_permissions: tenantHasCustom ? permissionFields.custom_permissions : null,
        },
        teamRoster,
      });
    } catch (err) {
      console.error('[tenant-context]', err);
      const raw = normalizeDatabaseError(err, 'Falha ao carregar contexto da clínica.');
      const lower = String(raw || '').toLowerCase();
      const hint =
        lower.includes('relation') && lower.includes('does not exist')
          ? ' Rode as migrations do schema SaaS no Supabase (mesmo projeto que app e backend).'
          : '';
      res.status(400).json({
        error: `${raw}${hint}`,
      });
    }
  };
}
