import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';

function requireMaster(actor) {
  if (!actor || (actor.role !== 'master' && actor.role !== 'admin')) throw new Error('Apenas MASTER pode gerenciar assinaturas.');
}

export function getSubscriptionByTenant(tenantId) {
  const db = loadDb();
  return (db.subscriptions || []).find((s) => s.tenant_id === tenantId) || null;
}

export function listSubscriptions(filters = {}) {
  const db = loadDb();
  let list = (db.subscriptions || []).slice();
  if (filters.tenant_id) list = list.filter((s) => s.tenant_id === filters.tenant_id);
  return list;
}

export function createSubscription(actor, tenantId, planId) {
  requireMaster(actor);
  return withDb((db) => {
    const existing = (db.subscriptions || []).find((s) => s.tenant_id === tenantId);
    if (existing) throw new Error('Tenant já possui assinatura.');
    const now = new Date();
    const end = new Date(now);
    end.setMonth(end.getMonth() + 1);
    const sub = { id: createId('sub'), tenant_id: tenantId, plan_id: planId, status: 'active', current_period_end: end.toISOString(), provider: 'internal', created_at: now.toISOString() };
    db.subscriptions = db.subscriptions || [];
    db.subscriptions.push(sub);
    const t = (db.tenants || []).find((x) => x.id === tenantId);
    if (t) t.plan_id = planId;
    return sub;
  });
}

export function updateSubscriptionStatus(actor, subscriptionId, status) {
  requireMaster(actor);
  return withDb((db) => {
    const idx = (db.subscriptions || []).findIndex((s) => s.id === subscriptionId);
    if (idx < 0) throw new Error('Assinatura não encontrada.');
    db.subscriptions[idx].status = status;
    const tenantId = db.subscriptions[idx].tenant_id;
    const t = (db.tenants || []).find((x) => x.id === tenantId);
    if (t && ['suspended', 'canceled'].includes(status)) t.status = 'suspended';
    return db.subscriptions[idx];
  });
}
