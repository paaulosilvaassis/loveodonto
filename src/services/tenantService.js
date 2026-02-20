import { loadDb, withDb } from '../db/index.js';
import { ROLE_MASTER } from '../constants/tenantRoles.js';
import { logAction } from './logService.js';

export function getDefaultTenant() {
  const db = loadDb();
  const tenant = (db.tenants || [])[0];
  if (!tenant) return null;
  return { ...tenant };
}

export function getTenant(tenantId) {
  const db = loadDb();
  const t = (db.tenants || []).find((x) => x.id === tenantId);
  return t ? { ...t } : null;
}

export function listTenants(filters = {}) {
  const db = loadDb();
  let list = (db.tenants || []).slice();
  if (filters.status) list = list.filter((t) => t.status === filters.status);
  return list.map((t) => ({ ...t }));
}

export function updateTenantFromMaster(actor, tenantId, payload) {
  if (!actor || (actor.role !== 'master' && actor.role !== 'admin')) {
    const err = new Error('Apenas o administrador (MASTER) pode gerenciar clínicas.');
    err.code = 'FORBIDDEN';
    throw err;
  }
  return withDb((db) => {
    const idx = (db.tenants || []).findIndex((t) => t.id === tenantId);
    if (idx < 0) throw new Error('Clínica não encontrada.');
    const now = new Date().toISOString();
    db.tenants[idx] = { ...db.tenants[idx], ...payload, updated_at: now };
    return db.tenants[idx];
  });
}

export function updateTenant(actor, tenantId, payload) {
  if (!actor || actor.role !== ROLE_MASTER) {
    const err = new Error('Apenas o administrador (MASTER) pode alterar os dados da clínica.');
    err.code = 'FORBIDDEN';
    throw err;
  }
  const db = loadDb();
  const membership = (db.memberships || []).find(
    (m) => m.tenant_id === tenantId && m.user_id === actor.id && m.status === 'active'
  );
  if (!membership) {
    const err = new Error('Você não pertence a esta clínica.');
    err.code = 'FORBIDDEN';
    throw err;
  }

  return withDb((db) => {
    const idx = (db.tenants || []).findIndex((t) => t.id === tenantId);
    if (idx < 0) throw new Error('Clínica não encontrada.');
    const before = { ...db.tenants[idx] };
    const now = new Date().toISOString();
    db.tenants[idx] = {
      ...db.tenants[idx],
      name: (payload.name !== undefined ? String(payload.name).trim() : db.tenants[idx].name) || before.name,
      logo_url: payload.logo_url !== undefined ? (payload.logo_url || null) : db.tenants[idx].logo_url,
      updated_at: now,
    };
    logAction('tenant:update', { actorId: actor.id, tenantId, before, after: db.tenants[idx] });
    return db.tenants[idx];
  });
}
