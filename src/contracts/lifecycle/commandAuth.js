/**
 * Reason, actor, tenant e autorização dos writers 10.23E.
 * Não persiste senha, token ou secret.
 */
import { can } from '../../permissions/permissions.js';
import {
  CANCEL_NOT_ALLOWED,
  LIFECYCLE_ACTOR_REQUIRED,
  LIFECYCLE_REASON_REQUIRED,
  LIFECYCLE_TENANT_MISMATCH,
  REISSUE_NOT_ALLOWED,
  RESEND_NOT_ALLOWED,
  ROTATE_NOT_ALLOWED,
  VOID_NOT_ALLOWED,
} from './constants.js';
import { createLifecycleError } from './errors.js';

export function readLegalReason(input) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return {
      reasonText: String(input.reasonText || input.reason || '').trim(),
      reasonCode: input.reasonCode ? String(input.reasonCode).trim() : null,
    };
  }
  return {
    reasonText: String(input || '').trim(),
    reasonCode: null,
  };
}

export function assertLegalReason(input, extra = {}) {
  const parsed = readLegalReason(input);
  if (!parsed.reasonText) {
    throw createLifecycleError(
      LIFECYCLE_REASON_REQUIRED,
      'Motivo jurídico obrigatório.',
      extra,
    );
  }
  return parsed;
}

export function assertLifecycleActor(user, extra = {}) {
  const actorUserId = user?.id || user?.userId || null;
  if (!actorUserId) {
    throw createLifecycleError(
      LIFECYCLE_ACTOR_REQUIRED,
      'Ator autenticado obrigatório.',
      extra,
    );
  }
  return {
    actorUserId,
    actorRole: user.role || user.actorRole || null,
    actorName: user.name || user.nome || user.email || null,
  };
}

export function actorTenantId(user) {
  return user?.tenantId || user?.tenant_id || null;
}

export function entityTenantId(entity) {
  if (!entity) return null;
  return entity.tenantId || entity.tenant_id || null;
}

export function assertLifecycleTenant(user, entity, extra = {}) {
  const actorTenant = actorTenantId(user);
  const rowTenant = entityTenantId(entity);
  if (rowTenant && actorTenant && String(rowTenant) !== String(actorTenant)) {
    throw createLifecycleError(
      LIFECYCLE_TENANT_MISMATCH,
      'Tenant do ator não corresponde ao registro.',
      extra,
    );
  }
  if (rowTenant && !actorTenant) {
    throw createLifecycleError(
      LIFECYCLE_TENANT_MISMATCH,
      'Tenant do ator não estabelecido.',
      extra,
    );
  }
  return rowTenant || actorTenant || null;
}

export function canPerformSensitiveLifecycle(user) {
  return Boolean(
    user?.role === 'admin'
    || user?.isMaster
    || can(user, 'admin_contratos:cancel'),
  );
}

export function assertSensitiveLifecycleAuth(user, extra = {}) {
  if (canPerformSensitiveLifecycle(user)) return true;
  throw createLifecycleError(
    CANCEL_NOT_ALLOWED,
    'Somente administradores autorizados podem executar esta ação jurídica.',
    extra,
  );
}

export function canPerformLegalHighImpact(user, permissionBit = null) {
  return Boolean(
    user?.role === 'admin'
    || user?.isMaster
    || (permissionBit && can(user, permissionBit)),
  );
}

export function assertLegalHighImpactAuth(user, extra = {}, permissionBit = null) {
  if (canPerformLegalHighImpact(user, permissionBit)) return true;
  const code = extra.failureCode
    || (extra.action === 'REISSUE' ? REISSUE_NOT_ALLOWED : VOID_NOT_ALLOWED);
  throw createLifecycleError(
    extra.failureCode || code,
    'Somente admin ou master podem executar esta ação jurídica de alto impacto.',
    extra,
  );
}

const OPERATIONAL_SIGNING_ROLES = new Set([
  'admin', 'gerente', 'recepcao', 'profissional', 'professional', 'dentista', 'atendimento',
]);

export function canPerformOperationalSigningAccess(user) {
  if (canPerformSensitiveLifecycle(user)) return true;
  const role = String(user?.role || '').toLowerCase();
  return OPERATIONAL_SIGNING_ROLES.has(role);
}

export function assertOperationalSigningAccess(user, extra = {}) {
  if (canPerformOperationalSigningAccess(user)) return true;
  throw createLifecycleError(
    extra.failureCode || RESEND_NOT_ALLOWED,
    'Sem autorização operacional para reenviar o convite de assinatura.',
    extra,
  );
}

export function canPerformRotateSigningAccess(user) {
  if (canPerformSensitiveLifecycle(user)) return true;
  const role = String(user?.role || '').toLowerCase();
  return role === 'profissional' || role === 'professional' || role === 'dentista';
}

export function assertRotateSigningAccessAuth(user, extra = {}) {
  if (canPerformRotateSigningAccess(user)) return true;
  throw createLifecycleError(
    extra.failureCode || ROTATE_NOT_ALLOWED,
    'Sem autorização para rotacionar o link de assinatura.',
    extra,
  );
}
