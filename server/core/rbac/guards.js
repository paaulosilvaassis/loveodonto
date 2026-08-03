/**
 * Phase 4.10 Wave 0 — Guards RBAC (throws ApiError 403).
 */

import { ApiError } from '../api/errors.js';
import { isActiveMembership, isTenantAdminRole, normalizeRoleValue } from './roles.js';

export function assertTenantMember(tenantContext, {
  message = 'Usuário sem vínculo ativo em tenant_users.',
  code = 'TENANT_MEMBERSHIP_REQUIRED',
} = {}) {
  if (!tenantContext?.tenantUser || !isActiveMembership(tenantContext.tenantUser)) {
    throw new ApiError(message, { status: 403, code });
  }
  return tenantContext;
}

export function assertTenantAdmin(tenantContext, {
  message = 'Apenas administradores da clínica podem executar esta ação.',
  code = 'ADMIN_REQUIRED',
} = {}) {
  assertTenantMember(tenantContext);
  const role = normalizeRoleValue(
    tenantContext.tenantUser?.role || tenantContext.tenantUser?.role_slug,
  );
  if (!isTenantAdminRole(role)) {
    throw new ApiError(message, { status: 403, code });
  }
  return tenantContext;
}
