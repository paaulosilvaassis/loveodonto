/**
 * Phase 4.10 Wave 3I — bootstrap do domínio Platform (DI, sem imports circulares).
 */

import { createPlatformBillingService } from '../../platformBillingService.js';
import {
  normalizeOnboardingPayload,
  validateOnboardingPayload,
} from '../../platformValidators.js';
import { sendClinicOnboardingEmail } from '../../email/sendClinicOnboardingEmail.js';
import { emailAudit } from '../../email/emailAuditLog.js';
import { provisionClinicOwnerAccess } from '../../clinicOwnerAccessDispatch.js';
import {
  acceptTermsByToken,
  buildTermsPreview,
  createAcceptanceToken,
  findLegalProfileByToken,
} from '../../onboardingTerms.js';
import { formatBillingOverviewResponse } from '../../platformRevenueMetrics.js';
import { buildModuleMap } from './moduleMap.js';
import { createBuildFeatureFlags } from './featureFlags.js';
import { createFormatProvisionErrorResponse } from './provisionErrorFormatter.js';
import { createInsertAuditLog } from './consoleAudit.js';
import { createAuthUserAndTenantLink } from './authTenantLink.js';
import { createConsoleAccess } from './consoleAccess.js';
import { createConsoleProfileHandler } from './consoleProfileApi.js';
import { createResetConsoleAdminHandler } from './resetConsoleAdminApi.js';
import { createProvisionUserHandler } from './provisionUserApi.js';
import { createTenantProvisionHandler } from './tenantProvisionApi.js';
import { createResendAccessHandler } from './resendAccessApi.js';
import { createPlatformBillingRouteHandlers } from './platformBillingRoutesApi.js';
import { createOnboardingPublicHandlers } from './onboardingPublicApi.js';
import { registerPlatformRoutes } from './registerPlatformRoutes.js';
import { assertPlatformExternalDeps } from './platformDeps.js';

export function createPlatformDependencies(deps) {
  assertPlatformExternalDeps(deps);

  const {
    supabase,
    normalizeText,
    normalizeEmail,
    normalizeDatabaseError,
    explainJwtVerifyFailure,
    normalizeStatus,
    normalizePlanCode,
    assertAuthUserIdForTenantWrite,
    identityLog,
    isIdentityProvisionError,
    planConfig,
    platformApiKey,
    ensureConsoleAdminCredentials,
    nodeEnv,
  } = deps;

  const buildFeatureFlags = createBuildFeatureFlags({ normalizeText });
  const formatProvisionErrorResponse = createFormatProvisionErrorResponse({
    normalizeDatabaseError,
    isIdentityProvisionError,
  });
  const insertAuditLog = createInsertAuditLog({ supabase });
  const createAuthUserAndTenantLinkFn = createAuthUserAndTenantLink({
    supabase,
    assertAuthUserIdForTenantWrite,
    identityLog,
  });
  const { getConsoleActorFromBearerToken, requireConsoleAccess } = createConsoleAccess({
    supabase,
    explainJwtVerifyFailure,
    platformApiKey,
  });

  const platformBilling = createPlatformBillingService({
    supabase,
    planConfig,
    insertAuditLog,
  });

  const handleConsoleProfile = createConsoleProfileHandler({
    supabase,
    explainJwtVerifyFailure,
    normalizeDatabaseError,
  });
  const handleResetConsoleAdmin = createResetConsoleAdminHandler({
    ensureConsoleAdminCredentials,
    normalizeEmail,
    normalizeDatabaseError,
    platformApiKey,
    nodeEnv,
  });
  const handleProvisionUser = createProvisionUserHandler({
    createAuthUserAndTenantLink: createAuthUserAndTenantLinkFn,
    normalizeEmail,
    normalizeDatabaseError,
  });
  const handleTenantProvision = createTenantProvisionHandler({
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
  });
  const handleResendAccess = createResendAccessHandler({
    supabase,
    normalizeEmail,
    normalizeDatabaseError,
    insertAuditLog,
    getSupabaseHost: () => {
      try {
        return new URL(String(process.env.SUPABASE_URL || '')).hostname || null;
      } catch {
        return null;
      }
    },
  });

  const billingHandlers = createPlatformBillingRouteHandlers({
    platformBilling,
    normalizeDatabaseError,
    formatBillingOverviewResponse,
  });

  const onboardingHandlers = createOnboardingPublicHandlers({
    supabase,
    findLegalProfileByToken,
    buildTermsPreview,
    acceptTermsByToken,
  });

  function mountPlatformRoutes(app) {
    registerPlatformRoutes(app, {
      requireConsoleAccess,
      handleConsoleProfile,
      handleProvisionUser,
      handleResetConsoleAdmin,
      handleTenantProvision,
      handleResendAccess,
      ...billingHandlers,
      ...onboardingHandlers,
    });
  }

  return {
    buildModuleMap,
    buildFeatureFlags,
    formatProvisionErrorResponse,
    insertAuditLog,
    createAuthUserAndTenantLink: createAuthUserAndTenantLinkFn,
    getConsoleActorFromBearerToken,
    requireConsoleAccess,
    platformBilling,
    mountPlatformRoutes,
  };
}
