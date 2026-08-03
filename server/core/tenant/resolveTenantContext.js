/**
 * Phase 4.10 Wave 1 — resolução de tenant/membership (Phase 4 backend-only).
 */

import { normalizeRoleValue, isTenantAdminRole } from '../rbac/roles.js';
import { TenantCoreForbiddenError } from './errors.js';

export const FORBIDDEN_TENANT_IDS = new Set(['tenant-1', 'tenant_1']);
export const PRODUCTION_PROJECT_REF = 'uoepkwhqztmsjnzirpev';

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function assertForbiddenTenantId(tenantId) {
  const normalized = normalizeText(tenantId).toLowerCase();
  if (!normalized || FORBIDDEN_TENANT_IDS.has(normalized)) {
    throw new TenantCoreForbiddenError('tenant_id proibido.', 'TENANT_FORBIDDEN');
  }
}

export async function resolveMembershipTenantContext({
  authUserId,
  emailHint = '',
  resolveActiveTenantUser,
  isActiveTenantUserRow,
}) {
  if (!authUserId) {
    throw new TenantCoreForbiddenError('Sessão ausente.', 'AUTH_REQUIRED');
  }

  let tenantUser;
  try {
    tenantUser = await resolveActiveTenantUser(authUserId, '', emailHint);
  } catch (err) {
    if (err?.code === 'TENANT_AMBIGUOUS') {
      throw new TenantCoreForbiddenError(
        'Usuário vinculado a múltiplas clínicas. Resolução automática indisponível para este endpoint.',
        'TENANT_AMBIGUOUS',
      );
    }
    throw err;
  }

  if (!tenantUser?.tenant_id || !isActiveTenantUserRow(tenantUser)) {
    throw new TenantCoreForbiddenError(
      'Usuário sem vínculo ativo em tenant_users.',
      'TENANT_MEMBERSHIP_REQUIRED',
    );
  }

  const tenantId = normalizeText(tenantUser.tenant_id);
  assertForbiddenTenantId(tenantId);

  const role = normalizeRoleValue(tenantUser.role || tenantUser.role_slug);

  return {
    tenantId,
    tenantUser,
    role,
    authUserId,
    mode: 'membership',
  };
}

export async function resolveAdminTenantContext({
  authUserId,
  resolveActiveTenantUser,
  explicitTenantId = '',
  adminForbiddenMessage = 'Apenas administradores da clínica podem executar esta ação.',
}) {
  if (!authUserId) {
    throw new TenantCoreForbiddenError('Sessão ausente.', 'AUTH_REQUIRED');
  }

  let tenantUser;
  try {
    tenantUser = await resolveActiveTenantUser(authUserId, explicitTenantId);
  } catch (err) {
    if (err?.code === 'TENANT_AMBIGUOUS') {
      throw new TenantCoreForbiddenError(
        'Usuário vinculado a múltiplas clínicas.',
        'TENANT_AMBIGUOUS',
      );
    }
    throw err;
  }

  if (!tenantUser?.tenant_id) {
    throw new TenantCoreForbiddenError(
      'Usuário sem vínculo ativo em tenant_users.',
      'TENANT_MEMBERSHIP_REQUIRED',
    );
  }

  if (explicitTenantId && explicitTenantId !== tenantUser.tenant_id) {
    throw new TenantCoreForbiddenError('tenant_id inválido para o usuário autenticado.', 'TENANT_FORBIDDEN');
  }

  const role = normalizeRoleValue(tenantUser.role || tenantUser.role_slug);
  if (!isTenantAdminRole(role)) {
    throw new TenantCoreForbiddenError(
      adminForbiddenMessage,
      'ADMIN_REQUIRED',
    );
  }

  const tenantId = normalizeText(tenantUser.tenant_id);
  assertForbiddenTenantId(tenantId);

  return {
    tenantId,
    tenantUser,
    role,
    authUserId,
    mode: 'admin',
  };
}
