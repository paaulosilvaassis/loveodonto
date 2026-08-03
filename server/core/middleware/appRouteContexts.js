/**
 * Phase 4.10 Wave 3A — contextos de middleware /internal/app (Core Auth + Tenant).
 * Única fábrica de middleware app; index.js permanece orquestrador de rotas.
 */

import { createRequireAppUser } from '../auth/requireAppUser.js';
import { createRequireTenantMembership } from '../tenant/requireTenantMembership.js';
import { createRequireTenantAdmin } from '../tenant/requireTenantAdmin.js';
import { createRequireLegacyTenantAdmin } from '../tenant/legacyTenantMiddleware.js';
import { createAssertNonProductionDebug } from '../../lib/debugUserContextApi.js';

/**
 * @param {object} deps
 * @param {import('@supabase/supabase-js').SupabaseClient} deps.supabase
 * @param {Function} deps.explainJwtVerifyFailure
 * @param {Function} deps.normalizeDatabaseError
 * @param {Function} deps.isSupabaseNetworkError
 * @param {Function} deps.resolveActiveTenantUser
 * @param {Function} deps.isActiveTenantUserRow
 * @param {string} deps.permissionsAdminForbiddenMessage
 * @param {string} [deps.nodeEnv]
 * @param {string} [deps.supabaseUrl]
 */
export function createAppRouteContexts(deps) {
  const {
    supabase,
    explainJwtVerifyFailure,
    normalizeDatabaseError,
    isSupabaseNetworkError,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
    permissionsAdminForbiddenMessage,
    nodeEnv = process.env.NODE_ENV,
    supabaseUrl = process.env.SUPABASE_URL,
  } = deps;

  const authDeps = {
    supabase,
    explainJwtVerifyFailure,
    normalizeDatabaseError,
    isSupabaseNetworkError,
  };

  /** Auth Context — singleton Core para todas as rotas /internal/app */
  const requireAppUser = createRequireAppUser(authDeps);

  /** Tenant Context — membership (Phase 4 read) */
  const requireTenantMembership = createRequireTenantMembership({
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  });

  /** Tenant Context — admin (permissions/assets) */
  const requireTenantAdmin = createRequireTenantAdmin({
    resolveActiveTenantUser,
    adminForbiddenMessage: permissionsAdminForbiddenMessage,
  });

  /** Tenant Context — admin (debug default message) */
  const requireTenantAdminDefault = createRequireTenantAdmin({
    resolveActiveTenantUser,
  });

  /** Debug Context — gate non-prod */
  const assertNonProductionDebug = createAssertNonProductionDebug({
    nodeEnv,
    supabaseUrl,
  });

  /** Legacy Tenant Context — admin com envelope V2 (400 { error }) e ?tenant_id/body */
  const requireLegacyTenantAdminBody = createRequireLegacyTenantAdmin({
    resolveActiveTenantUser,
    tenantIdSource: 'body',
  });
  const requireLegacyTenantAdminQuery = createRequireLegacyTenantAdmin({
    resolveActiveTenantUser,
    tenantIdSource: 'query',
  });

  return {
    auth: {
      requireAppUser,
    },
    collaborators: {
      list: {
        requireAppUser,
        requireTenantMembership,
      },
      permissions: {
        requireAppUser,
        requireTenantAdmin,
      },
    },
    assets: {
      write: {
        requireAppUser,
        requireTenantAdmin,
      },
      read: {
        requireAppUser,
        requireTenantMembership,
      },
    },
    debug: {
      assertNonProductionDebug,
      requireAppUser,
      requireTenantAdmin: requireTenantAdminDefault,
    },
    access: {
      requireAppUser,
    },
    legacy: {
      requireTenantAdminBody: requireLegacyTenantAdminBody,
      requireTenantAdminQuery: requireLegacyTenantAdminQuery,
    },
  };
}
