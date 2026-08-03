/**
 * Phase 4.10 Wave 3B — middleware tenant legado (envelope V2: 400 { error }).
 * Rotas que historicamente retornam 400 em falhas de admin/membership.
 */

import { resolveAdminTenantContext } from './resolveTenantContext.js';
import { TenantCoreForbiddenError } from './errors.js';
import {
  LEGACY_ADMIN_FORBIDDEN_MESSAGE,
  LEGACY_MEMBERSHIP_MESSAGE,
  readExplicitTenantId,
} from '../../lib/tenantAdminActor.js';

function legacyForbiddenResponse(res, err) {
  let message = err.message;
  if (err.code === 'TENANT_MEMBERSHIP_REQUIRED') {
    message = LEGACY_MEMBERSHIP_MESSAGE;
  } else if (err.code === 'ADMIN_REQUIRED') {
    message = LEGACY_ADMIN_FORBIDDEN_MESSAGE;
  }
  return res.status(400).json({ error: message });
}

/**
 * @param {object} deps
 * @param {Function} deps.resolveActiveTenantUser
 * @param {'query'|'body'|'both'} [deps.tenantIdSource]
 */
export function createRequireLegacyTenantAdmin(deps = {}) {
  const { resolveActiveTenantUser, tenantIdSource = 'both' } = deps;

  return async function requireLegacyTenantAdmin(req, res, next) {
    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }

      const explicitTenantId = readExplicitTenantId(req, tenantIdSource);
      req.tenantContext = await resolveAdminTenantContext({
        authUserId: req.appAuthUser.id,
        resolveActiveTenantUser,
        explicitTenantId,
        adminForbiddenMessage: LEGACY_ADMIN_FORBIDDEN_MESSAGE,
      });
      next();
    } catch (err) {
      if (err instanceof TenantCoreForbiddenError) {
        return legacyForbiddenResponse(res, err);
      }
      console.error('[requireLegacyTenantAdmin]', err);
      return res.status(400).json({ error: err?.message || 'Falha ao validar contexto da clínica.' });
    }
  };
}
