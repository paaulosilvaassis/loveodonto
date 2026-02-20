import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';

function requirePlatformMaster(actor) {
  if (!actor || (actor.role !== 'master' && actor.role !== 'admin')) {
    const err = new Error('Apenas o administrador (MASTER) pode gerenciar planos.');
    err.code = 'FORBIDDEN';
    throw err;
  }
}

export function listPlans(onlyActive = true) {
  const db = loadDb();
  let list = (db.plans || []).slice();
  if (onlyActive) list = list.filter((p) => p.is_active !== false);
  return list.map((p) => ({ ...p, limits: p.limits_json || {}, features: p.features_json || [] }));
}

export function getPlan(planId) {
  const db = loadDb();
  const p = (db.plans || []).find((x) => x.id === planId);
  return p ? { ...p, limits: p.limits_json || {}, features: p.features_json || [] } : null;
}

export function createPlan(actor, payload) {
  requirePlatformMaster(actor);
  return withDb((db) => {
    const plan = {
      id: createId('plan'),
      name: (payload.name || '').trim(),
      price: Number(payload.price) || 0,
      interval: payload.interval || 'month',
      limits_json: payload.limits || {},
      features_json: payload.features || [],
      is_active: payload.is_active !== false,
      created_at: new Date().toISOString(),
    };
    db.plans = db.plans || [];
    db.plans.push(plan);
    return plan;
  });
}

export function updatePlan(actor, planId, payload) {
  requirePlatformMaster(actor);
  return withDb((db) => {
    const idx = (db.plans || []).findIndex((p) => p.id === planId);
    if (idx < 0) throw new Error('Plano não encontrado.');
    const p = db.plans[idx];
    db.plans[idx] = { ...p, ...payload };
    return db.plans[idx];
  });
}
