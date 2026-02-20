import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';

export const USAGE_METRICS = ['agenda_create', 'patient_create', 'budget_create', 'appointment_create'];

export function trackUsage(tenantId, metricKey, quantity = 1) {
  return withDb((db) => {
    const event = { id: createId('evt'), tenant_id: tenantId, metric_key: metricKey, quantity: Number(quantity) || 1, occurred_at: new Date().toISOString() };
    db.usage_events = db.usage_events || [];
    db.usage_events.push(event);
    return event;
  });
}

export function getUsageByTenant(tenantId, sinceDays = 30) {
  const db = loadDb();
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const events = (db.usage_events || []).filter((e) => e.tenant_id === tenantId && new Date(e.occurred_at) >= since);
  const byMetric = {};
  for (const e of events) {
    byMetric[e.metric_key] = (byMetric[e.metric_key] || 0) + (e.quantity || 1);
  }
  return byMetric;
}
