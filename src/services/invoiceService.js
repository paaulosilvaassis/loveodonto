import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';

function requirePlatformMaster(actor) {
  if (!actor || (actor.role !== 'master' && actor.role !== 'admin')) {
    const err = new Error('Apenas o administrador (MASTER) pode gerenciar faturas.');
    err.code = 'FORBIDDEN';
    throw err;
  }
}

export function listInvoices(filters = {}) {
  const db = loadDb();
  let list = (db.invoices || []).slice();
  if (filters.tenant_id) list = list.filter((i) => i.tenant_id === filters.tenant_id);
  if (filters.status) list = list.filter((i) => i.status === filters.status);
  list.sort((a, b) => new Date(b.due_date || 0) - new Date(a.due_date || 0));
  return list;
}

export function getInvoice(invoiceId) {
  const db = loadDb();
  return (db.invoices || []).find((i) => i.id === invoiceId) || null;
}

export function createInvoice(actor, tenantId, amount) {
  requirePlatformMaster(actor);
  return withDb((db) => {
    const now = new Date();
    const due = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const inv = { id: createId('inv'), tenant_id: tenantId, amount: Number(amount) || 0, status: 'pending', due_date: due.toISOString().slice(0, 10), paid_at: null, created_at: now.toISOString() };
    db.invoices = db.invoices || [];
    db.invoices.push(inv);
    return inv;
  });
}

export function markInvoicePaid(actor, invoiceId) {
  requirePlatformMaster(actor);
  return withDb((db) => {
    const idx = (db.invoices || []).findIndex((i) => i.id === invoiceId);
    if (idx < 0) throw new Error('Fatura não encontrada.');
    db.invoices[idx].status = 'paid';
    db.invoices[idx].paid_at = new Date().toISOString();
    return db.invoices[idx];
  });
}

export function getOverdueInvoices() {
  const db = loadDb();
  const today = new Date().toISOString().slice(0, 10);
  return (db.invoices || []).filter((i) => i.status === 'pending' && i.due_date && i.due_date < today);
}
