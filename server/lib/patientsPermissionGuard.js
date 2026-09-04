/**
 * CLOUD.3 — Guard de permissão patients:read / patients:write.
 * Fail closed 403.
 */

import { isTenantAdminRole, normalizeRoleValue } from '../core/rbac/roles.js';
import { FORBIDDEN_TENANT_IDS } from './patientsApiList.js';

export class PatientsPermissionDeniedError extends Error {
  constructor(message = 'Sem permissão para pacientes.', code = 'PATIENTS_PERMISSION_DENIED') {
    super(message);
    this.name = 'PatientsPermissionDeniedError';
    this.code = code;
  }
}

const ADMIN_ROLE_BYPASS = new Set(['master', 'admin', 'gerente', 'owner']);

function normalizeText(value) {
  return String(value ?? '').trim();
}

function isAdminBypassRole(role) {
  const normalized = normalizeRoleValue(role, '');
  if (!normalized) return false;
  if (isTenantAdminRole(normalized)) return true;
  return ADMIN_ROLE_BYPASS.has(normalized);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ tenantId: string, userId: string, permission: 'patients:read' | 'patients:write' }} opts
 */
export async function assertPatientsPermission(supabase, { tenantId, userId, permission }) {
  const tid = normalizeText(tenantId);
  const uid = normalizeText(userId);
  const perm = normalizeText(permission);

  if (!tid || FORBIDDEN_TENANT_IDS.has(tid.toLowerCase())) {
    throw new PatientsPermissionDeniedError('tenant_id inválido.', 'TENANT_FORBIDDEN');
  }
  if (!uid) {
    throw new PatientsPermissionDeniedError('userId ausente.');
  }
  if (perm !== 'patients:read' && perm !== 'patients:write') {
    throw new PatientsPermissionDeniedError('permission inválida.');
  }

  const { data: tenantUser, error: tuError } = await supabase
    .from('tenant_users')
    .select('id, tenant_id, user_id, role, role_slug, is_active, status, has_system_access')
    .eq('tenant_id', tid)
    .eq('user_id', uid)
    .maybeSingle();

  if (tuError) {
    throw new PatientsPermissionDeniedError(
      'Falha ao validar membership.',
      'MEMBERSHIP_LOOKUP_FAILED',
    );
  }
  if (!tenantUser) {
    throw new PatientsPermissionDeniedError('Usuário sem membership no tenant.');
  }
  if (tenantUser.is_active === false) {
    throw new PatientsPermissionDeniedError('Membership inativa.');
  }
  const status = normalizeText(tenantUser.status).toLowerCase();
  if (status === 'inactive' || status === 'inativo') {
    throw new PatientsPermissionDeniedError('Membership inativa.');
  }

  const role = tenantUser.role_slug || tenantUser.role || '';
  if (isAdminBypassRole(role)) {
    return { ok: true, bypass: 'admin-role' };
  }

  const roleSlug = normalizeRoleValue(role, 'atendimento');

  const { data: defaults, error: defError } = await supabase
    .from('role_permission_defaults')
    .select('permission_id')
    .eq('role_slug', roleSlug)
    .eq('permission_id', perm);

  if (defError) {
    // Fail closed se catálogo indisponível
    throw new PatientsPermissionDeniedError(
      'Catálogo de permissões indisponível.',
      'PERMISSION_CATALOG_UNAVAILABLE',
    );
  }

  const allowed = Array.isArray(defaults) && defaults.length > 0;
  if (!allowed) {
    // Prefer patients:read — se catálogo não tem a permission, falha fechado
    throw new PatientsPermissionDeniedError(
      `Permissão ${perm} ausente para o papel ${roleSlug}.`,
    );
  }

  return { ok: true, bypass: null };
}
