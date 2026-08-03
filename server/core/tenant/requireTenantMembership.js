/**
 * Phase 4.10 Wave 1 — middleware: membership ativa → req.tenantContext.
 */

import { resolveMembershipTenantContext } from './resolveTenantContext.js';
import { TenantCoreForbiddenError } from './errors.js';

export function createRequireTenantMembership(deps) {
  const { resolveActiveTenantUser, isActiveTenantUserRow } = deps;

  return async function requireTenantMembership(req, res, next) {
    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }

      req.tenantContext = await resolveMembershipTenantContext({
        authUserId: req.appAuthUser.id,
        emailHint: req.appAuthUser.email || '',
        resolveActiveTenantUser,
        isActiveTenantUserRow,
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

      console.error('[TENANT_MEMBERSHIP_MIDDLEWARE]', err);
      return res.status(500).json({
        ok: false,
        error: 'Falha ao resolver tenant do usuário.',
      });
    }
  };
}
