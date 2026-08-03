/**
 * Phase 4.10 Wave 3B — resolução admin legada via Core Tenant/RBAC.
 * Preserva mensagens de erro V2 para handlers que respondem 400 { error }.
 */

import { resolveAdminTenantContext } from '../core/tenant/resolveTenantContext.js';
import { TenantCoreForbiddenError } from '../core/tenant/errors.js';

export const LEGACY_ADMIN_FORBIDDEN_MESSAGE =
  'Apenas administradores da clínica podem executar esta operação.';

export const LEGACY_MEMBERSHIP_MESSAGE = 'Usuário sem vínculo em tenant_users.';

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function readExplicitTenantId(req, source = 'both') {
  const fromQuery = source === 'query' || source === 'both'
    ? normalizeText(req.query?.tenant_id)
    : '';
  const fromBody = source === 'body' || source === 'both'
    ? normalizeText(req.body?.tenant_id)
    : '';
  return fromQuery || fromBody || '';
}

function mapTenantCoreErrorToLegacyError(err) {
  if (!(err instanceof TenantCoreForbiddenError)) return err;

  const code = err.code;
  let message = err.message;

  if (code === 'TENANT_MEMBERSHIP_REQUIRED') {
    message = LEGACY_MEMBERSHIP_MESSAGE;
  } else if (code === 'ADMIN_REQUIRED') {
    message = LEGACY_ADMIN_FORBIDDEN_MESSAGE;
  }

  const legacy = new Error(message);
  legacy.code = code;
  return legacy;
}

/**
 * @param {string} authUserId
 * @param {string} [explicitTenantId]
 * @param {object} deps
 * @param {Function} deps.resolveActiveTenantUser
 */
export async function getTenantAdminActorOrThrow(
  authUserId,
  explicitTenantId = '',
  deps = {},
) {
  const { resolveActiveTenantUser } = deps;
  if (!resolveActiveTenantUser) {
    throw new Error('resolveActiveTenantUser é obrigatório.');
  }

  try {
    const ctx = await resolveAdminTenantContext({
      authUserId,
      resolveActiveTenantUser,
      explicitTenantId,
      adminForbiddenMessage: LEGACY_ADMIN_FORBIDDEN_MESSAGE,
    });
    return ctx.tenantUser;
  } catch (err) {
    throw mapTenantCoreErrorToLegacyError(err);
  }
}
