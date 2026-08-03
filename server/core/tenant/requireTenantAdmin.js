/**
 * Phase 4.10 Wave 1 — middleware: admin/owner/master → req.tenantContext.
 */

import { resolveAdminTenantContext } from './resolveTenantContext.js';
import { TenantCoreForbiddenError } from './errors.js';

export function createRequireTenantAdmin(deps) {
  const {
    resolveActiveTenantUser,
    explicitTenantId = '',
    adminForbiddenMessage,
  } = deps;

  return async function requireTenantAdmin(req, res, next) {
    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }

      req.tenantContext = await resolveAdminTenantContext({
        authUserId: req.appAuthUser.id,
        resolveActiveTenantUser,
        explicitTenantId,
        adminForbiddenMessage,
      });

      next();
    } catch (err) {
      if (err instanceof TenantCoreForbiddenError) {
        return res.status(403).json({
          ok: false,
          error: err.message,
          code: err.code,
        });
      }

      console.error('[TENANT_ADMIN_MIDDLEWARE]', err);
      return res.status(500).json({
        ok: false,
        error: 'Falha ao resolver tenant administrador.',
      });
    }
  };
}
