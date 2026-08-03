/**
 * Phase 4.10 Wave 3I — POST /internal/platform/tenants/provision
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createTenantProvisionHandler(deps) {
  const {
    supabase,
    normalizeOnboardingPayload,
    validateOnboardingPayload,
    normalizeEmail,
    normalizeStatus,
    normalizePlanCode,
    normalizeDatabaseError,
    provisionClinicOwnerAccess,
    createAcceptanceToken,
    sendClinicOnboardingEmail,
    emailAudit,
    planConfig,
    platformBilling,
    insertAuditLog,
  } = deps;

  return async function handleTenantProvision(req, res) {
    let createdTenantId = null;
    let createdAuthUserId = null;
    let createdAuthUser = false;

    try {
      const actor = req.platformActor;
      const onboarding = normalizeOnboardingPayload(req.body);
      const validationError = validateOnboardingPayload(onboarding);
      if (validationError) return res.status(400).json({ error: validationError });

      const tradeName = onboarding.tradeName;
      const legalName = onboarding.legalName;
      const responsibleName = onboarding.adminName || onboarding.legalRepresentativeName;
      const responsibleEmail = onboarding.adminEmail || onboarding.legalRepresentativeEmail;
      const responsiblePassword = onboarding.adminPassword;
      const accessEmail = onboarding.legalRepresentativeEmail || responsibleEmail;
      const city = onboarding.city;
      const status = normalizeStatus(onboarding.status || 'active') || 'active';
      const planCode = normalizePlanCode(onboarding.plan);

      if (!planCode) return res.status(400).json({ error: 'plan inválido. Use Start, Growth ou Scale.' });

      const { data: existingTenantByCnpj, error: existingTenantByCnpjError } = await supabase
        .from('tenants')
        .select('id, legal_name')
        .eq('cnpj', onboarding.cnpj)
        .maybeSingle();
      if (existingTenantByCnpjError) throw existingTenantByCnpjError;
      if (existingTenantByCnpj?.id) {
        return res.status(409).json({ error: 'Este CNPJ já está cadastrado em outra clínica.' });
      }

      const { data: existingTenantUserByEmail, error: existingTenantUserError } = await supabase
        .from('tenant_users')
        .select('id, tenant_id, user_id')
        .eq('email', accessEmail)
        .maybeSingle();
      if (existingTenantUserError) throw existingTenantUserError;
      if (existingTenantUserByEmail?.tenant_id) {
        return res.status(409).json({ error: 'Este e-mail já está vinculado a outra clínica em tenant_users.' });
      }

      const passwordWasGenerated = !responsiblePassword;

      emailAudit('iniciando provisionamento clínica', {
        accessEmail,
        passwordWasGenerated,
        hasExplicitPassword: Boolean(responsiblePassword),
      });

      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          legal_name: legalName,
          trade_name: tradeName,
          cnpj: onboarding.cnpj,
          phone: onboarding.clinicPhone,
          zip_code: onboarding.zipCode,
          street: onboarding.street,
          street_number: onboarding.streetNumber,
          address_complement: onboarding.addressComplement || null,
          neighborhood: onboarding.neighborhood,
          status,
          billing_status: 'ok',
          plan_code: planCode,
          owner_name: onboarding.legalRepresentativeName,
          owner_email: onboarding.legalRepresentativeEmail,
          city,
          state: onboarding.state,
          created_by: actor?.id || null,
          updated_by: actor?.id || null,
        })
        .select('id, legal_name, trade_name, cnpj, owner_name, owner_email, city, state, status, billing_status, plan_code, created_at, updated_at')
        .single();
      if (tenantError || !tenant?.id) throw tenantError || new Error('Falha ao criar tenant.');
      createdTenantId = tenant.id;
      console.log('[Provision] tenant criado', { tenantId: createdTenantId, planCode, accessEmail });

      const accessResult = await provisionClinicOwnerAccess(supabase, {
        email: accessEmail,
        password: responsiblePassword,
        fullName: responsibleName,
        tenantId: createdTenantId,
        roleSlug: 'master',
        cpf: onboarding.legalRepresentativeCpf || onboarding.adminCpf,
        phone: onboarding.legalRepresentativePhone || onboarding.adminPhone,
        passwordWasGenerated,
      });
      const {
        authUserId,
        tenantUser,
        emailDelivery,
        setupLink: accessSetupLink,
        accessEmailSent,
      } = accessResult;
      createdAuthUserId = authUserId;
      createdAuthUser = true;
      console.log('[Provision] acesso do responsável provisionado', {
        accessEmail,
        emailDelivery,
        accessEmailSent: Boolean(accessEmailSent),
      });

      const acceptanceToken = createAcceptanceToken();

      const { error: legalProfileError } = await supabase.from('tenant_legal_profiles').insert({
        tenant_id: createdTenantId,
        legal_representative_name: onboarding.legalRepresentativeName,
        legal_representative_cpf: onboarding.legalRepresentativeCpf,
        legal_representative_email: onboarding.legalRepresentativeEmail,
        legal_representative_phone: onboarding.legalRepresentativePhone,
        legal_representative_role: onboarding.legalRepresentativeRole || null,
        billing_contact_name: onboarding.billingContactName,
        billing_contact_email: onboarding.billingContactEmail,
        billing_contact_phone: onboarding.billingContactPhone,
        billing_same_as_legal: onboarding.billingSameAsLegal,
        liability_terms_version: acceptanceToken.termsVersion,
        liability_status: 'pending',
        liability_accepted_at: null,
        liability_acceptance_token_hash: acceptanceToken.tokenHash,
        liability_acceptance_expires_at: acceptanceToken.expiresAt,
        liability_accepted_by_admin_id: null,
        liability_accepted_by_name: null,
      });
      if (legalProfileError) throw legalProfileError;

      const { data: subscription, error: subscriptionError } = await supabase
        .from('tenant_subscriptions')
        .insert({
          tenant_id: createdTenantId,
          plan_code: planCode,
          status: status === 'active' ? 'active' : 'paused',
          amount_cents: planConfig[planCode].priceCents,
          cycle: 'monthly',
          next_billing_at: new Date(Date.now() + 30 * 86400000).toISOString(),
          updated_by: actor?.id || null,
        })
        .select('id, tenant_id, plan_code, status, amount_cents, cycle, next_billing_at, created_at, updated_at')
        .single();
      if (subscriptionError) throw subscriptionError;
      console.log('[Provision] assinatura criada', { subscriptionId: subscription.id, tenantId: createdTenantId });

      let platformBillingRecord = null;
      try {
        platformBillingRecord = await platformBilling.provisionBillingForTenant({
          tenantId: createdTenantId,
          planCode,
          actorId: actor?.id || null,
          amountCents: planConfig[planCode].priceCents,
        });
        console.log('[Provision] cobrança SaaS criada', {
          tenantId: createdTenantId,
          subscriptionId: platformBillingRecord?.subscription?.id,
          invoiceId: platformBillingRecord?.invoice?.id,
        });
      } catch (billingErr) {
        console.warn('[Provision] falha ao criar cobrança SaaS (migração 015 aplicada?)', billingErr?.message || billingErr);
      }

      const moduleRows = planConfig[planCode].modules.map((moduleKey) => ({
        tenant_id: createdTenantId,
        module_key: moduleKey,
        enabled: true,
        updated_by: actor?.id || null,
      }));
      const { data: tenantModules, error: tenantModulesError } = await supabase
        .from('tenant_modules')
        .insert(moduleRows)
        .select('id, tenant_id, module_key, enabled, created_at, updated_at');
      if (tenantModulesError) throw tenantModulesError;
      console.log('[Provision] módulos criados', { tenantId: createdTenantId, modules: planConfig[planCode].modules });

      const { error: tenantLimitsError } = await supabase.from('tenant_limits').upsert({
        tenant_id: createdTenantId,
        limits_json: planConfig[planCode].limits,
        updated_by: actor?.id || null,
      }, { onConflict: 'tenant_id' });
      if (tenantLimitsError) throw tenantLimitsError;

      await insertAuditLog({
        actor,
        action: 'tenant.provision.completed',
        targetType: 'tenant',
        targetId: createdTenantId,
        tenantId: createdTenantId,
        metadata: {
          responsible_email: accessEmail,
          responsible_user_id: createdAuthUserId,
          cnpj: onboarding.cnpj,
          legal_representative_cpf: onboarding.legalRepresentativeCpf,
          billing_contact_email: onboarding.billingContactEmail,
          liability_terms_version: acceptanceToken.termsVersion,
          liability_status: 'pending',
          plan: planCode,
          modules: planConfig[planCode].modules,
        },
      });
      console.log('[Provision] audit log criado', { tenantId: createdTenantId });

      let onboardingEmail = null;
      try {
        onboardingEmail = await sendClinicOnboardingEmail(supabase, {
          tenantId: createdTenantId,
          clinicName: tenant.trade_name || tenant.legal_name,
          planLabel: planConfig[planCode]?.label || planCode,
          userName: responsibleName,
          email: accessEmail,
          acceptTermsToken: acceptanceToken.token,
          setupLink: accessSetupLink,
          skipSetupLink: Boolean(accessEmailSent),
          accessEmailDelivery: emailDelivery,
        });
        onboardingEmail = {
          ...onboardingEmail,
          accessEmailDelivery: emailDelivery,
          accessEmailSent: Boolean(accessEmailSent) || Boolean(onboardingEmail?.sent),
        };
        if (onboardingEmail.accessEmailSent || onboardingEmail.sent) {
          await supabase
            .from('tenant_legal_profiles')
            .update({ onboarding_email_sent_at: new Date().toISOString() })
            .eq('tenant_id', createdTenantId);
        }
        if (onboardingEmail.accessEmailSent && emailDelivery === 'supabase_auth') {
          console.log('[Provision] e-mail de primeiro acesso enviado via Supabase Auth', { accessEmail });
        } else if (onboardingEmail.sent) {
          console.log('[Provision] e-mail de onboarding enviado', { accessEmail, provider: onboardingEmail.provider });
        } else {
          emailAudit('provisionamento sem e-mail entregue', {
            accessEmail,
            emailDelivery,
            reason: onboardingEmail.reason,
            setupLink: onboardingEmail.setupLink || accessSetupLink || null,
          });
        }
      } catch (emailErr) {
        console.warn('[Provision] falha ao enviar e-mail de onboarding', emailErr?.message || emailErr);
        onboardingEmail = {
          sent: false,
          accessEmailDelivery: emailDelivery,
          accessEmailSent: Boolean(accessEmailSent),
          reason: emailErr?.message || 'Falha ao enviar e-mail de onboarding.',
        };
      }

      return res.status(201).json({
        tenant,
        tenantUser,
        responsibleUser: {
          id: createdAuthUserId,
          email: accessEmail,
          full_name: responsibleName,
        },
        subscription,
        platformBilling: platformBillingRecord,
        tenantModules: tenantModules || [],
        onboarding_email: onboardingEmail,
        accessEmailDelivery: emailDelivery,
        access_email_sent: Boolean(accessEmailSent),
        access_setup_link: accessSetupLink || onboardingEmail?.setupLink || null,
      });
    } catch (err) {
      console.error('[Provision] erro detalhado', {
        message: normalizeDatabaseError(err, String(err || '')),
        tenantId: createdTenantId,
        authUserId: createdAuthUserId,
      });
      if (createdAuthUser && createdAuthUserId) {
        const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(createdAuthUserId);
        if (deleteAuthError) {
          console.error('[Provision] rollback auth user falhou', deleteAuthError.message);
        }
      }
      if (createdTenantId) {
        const { error: deleteTenantError } = await supabase.from('tenants').delete().eq('id', createdTenantId);
        if (deleteTenantError) {
          console.error('[Provision] rollback tenant falhou', deleteTenantError.message);
        }
      }
      res.status(400).json({
        error: normalizeDatabaseError(err, 'Falha ao provisionar clínica.'),
      });
    }
  };
}
