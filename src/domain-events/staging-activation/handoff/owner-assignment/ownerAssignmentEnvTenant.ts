/**
 * @module domain-events/staging-activation/handoff/owner-assignment/ownerAssignmentEnvTenant
 */

import { PRODUCTION_SUPABASE_PROJECT_REF } from '../../../domainEventFlags.js';
import type {
  OwnerEnvironmentValidation,
  OwnerTenantValidation,
} from './ownerAssignmentTypes.js';

export function validateOwnerEnvironmentReference(
  env: Readonly<Record<string, unknown>> | null,
): OwnerEnvironmentValidation {
  if (!env) {
    return Object.freeze({
      status: 'missing',
      blockers: Object.freeze(['environmentReference ausente']),
      warnings: Object.freeze([] as string[]),
    });
  }
  const blockers: string[] = [];
  const host = String(env.host || '').trim().toLowerCase();
  const ref = String(env.projectRef || '').trim().toLowerCase();
  const prod = PRODUCTION_SUPABASE_PROJECT_REF.toLowerCase();
  if (!host) blockers.push('host ausente');
  if (!ref) blockers.push('projectRef ausente');
  if (!String(env.environmentOwner || env.owner || '').trim()) {
    blockers.push('environmentOwner ausente');
  }
  if (!String(env.declaredBy || '').trim()) blockers.push('declaredBy ausente');
  if (env.isProduction === true || String(env.environmentType) === 'production'
    || ref === prod || host.includes(prod)) {
    return Object.freeze({
      status: 'production_rejected',
      blockers: Object.freeze(['produção rejeitada']),
      warnings: Object.freeze([] as string[]),
    });
  }
  if (env.expiresAt && Date.parse(String(env.expiresAt)) < Date.now()) {
    blockers.push('ambiente expirado');
  }
  if (blockers.length) {
    return Object.freeze({
      status: 'invalid',
      blockers: Object.freeze(blockers),
      warnings: Object.freeze([] as string[]),
    });
  }
  return Object.freeze({
    status: 'declared_unverified_remote',
    blockers: Object.freeze([] as string[]),
    warnings: Object.freeze(['remote existence not verified — sem conexão nesta phase']),
  });
}

export function validateOwnerTenantReference(
  tenants: Readonly<Record<string, unknown>> | null,
): OwnerTenantValidation {
  if (!tenants) {
    return Object.freeze({
      status: 'missing',
      blockers: Object.freeze(['tenantReference ausente']),
      warnings: Object.freeze([] as string[]),
    });
  }
  const blockers: string[] = [];
  const pilot = Array.isArray(tenants.pilotTenantIds)
    ? tenants.pilotTenantIds.map(String)
    : [];
  const control = Array.isArray(tenants.controlTenantIds)
    ? tenants.controlTenantIds.map(String)
    : [];
  const excluded = Array.isArray(tenants.excludedTenantIds)
    ? tenants.excludedTenantIds.map(String)
    : [];
  if (pilot.length === 0) blockers.push('piloto ausente');
  if (pilot.some((id) => /^(all|\*|everyone)$/i.test(id))) blockers.push('wildcard rejeitado');
  const all = [...pilot, ...control];
  if (new Set(all).size !== all.length) blockers.push('duplicidade');
  if (pilot.some((id) => control.includes(id))) blockers.push('overlap piloto/controle');
  if (excluded.some((id) => all.includes(id))) blockers.push('excluded overlap');
  if (!String(tenants.tenantOwner || tenants.selectedBy || '').trim()) {
    blockers.push('tenantOwner/selectedBy ausente');
  }
  if (blockers.length) {
    return Object.freeze({
      status: 'invalid',
      blockers: Object.freeze(blockers),
      warnings: Object.freeze([] as string[]),
    });
  }
  return Object.freeze({
    status: 'structurally_valid_remote_unverified',
    blockers: Object.freeze([] as string[]),
    warnings: Object.freeze(['remote tenant existence unverified']),
  });
}

/**
 * Approval role references — NÃO transformam em aprovação. Status permanece pending.
 */
export function validateApprovalRoleReferences(
  refs: ReadonlyArray<Readonly<Record<string, unknown>>> | null,
): { ok: boolean; pendingCount: number; blockers: readonly string[] } {
  if (!refs || refs.length === 0) {
    return { ok: true, pendingCount: 0, blockers: Object.freeze([]) };
  }
  const blockers: string[] = [];
  for (const r of refs) {
    if (!String(r.approvalRole || '').trim()) blockers.push('approvalRole ausente');
    if (!String(r.assignedPerson || '').trim()) blockers.push('approval assignedPerson ausente');
    // Nunca considerar approved aqui
    if (String(r.status || 'pending') === 'approved') {
      blockers.push('approval status não pode ser aprovado neste contrato de role assignment');
    }
  }
  return {
    ok: blockers.length === 0,
    pendingCount: refs.length,
    blockers: Object.freeze(blockers),
  };
}
