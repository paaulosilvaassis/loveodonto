import { FINANCING_STATUS, RECEIVABLE_STATUS } from './auditEventCatalog.js';
import { clampNonNegativeCents, toCents, fromCents } from './receivableMoney.js';

function isLinkedReceivableCollectible(row) {
  return row?.status !== RECEIVABLE_STATUS.CANCELED && row?.status !== RECEIVABLE_STATUS.RENEGOTIATED;
}

export function listReceivablesForFinancing(db, financingId) {
  const fid = String(financingId || '').trim();
  if (!fid) return [];
  return (db.accountsReceivable || []).filter((row) => (
    String(row.financing_id || '') === fid
    || (row.origin_type === 'financing' && String(row.origin_id || '') === fid)
  ));
}

export function reconcileFinancingFromReceivables(financing, db) {
  const linked = listReceivablesForFinancing(db, financing?.id);
  let paidCents = 0;
  let dueCents = 0;
  let openCents = 0;
  let hasOverdue = false;
  let hasPartial = false;
  let collectible = 0;
  let collectiblePaid = 0;

  for (const row of linked) {
    const net = toCents(row.net_amount || 0);
    const received = toCents(row.received_amount || 0);
    dueCents += net;
    if (!isLinkedReceivableCollectible(row)) {
      paidCents += received;
      continue;
    }
    collectible += 1;
    paidCents += received;
    openCents += clampNonNegativeCents(net - received);
    if (row.status === RECEIVABLE_STATUS.OVERDUE) hasOverdue = true;
    if (row.status === RECEIVABLE_STATUS.PARTIALLY_PAID || (received > 0 && received < net)) hasPartial = true;
    if (received >= net && net > 0) collectiblePaid += 1;
  }

  const current = financing?.status;
  let nextStatus = current || FINANCING_STATUS.ACTIVE;
  if (current === FINANCING_STATUS.CANCELED || current === FINANCING_STATUS.RENEGOTIATED) {
    nextStatus = current;
  } else if (collectible > 0 && collectiblePaid === collectible && openCents <= 0) {
    nextStatus = FINANCING_STATUS.PAID_OFF;
  } else if (hasOverdue) {
    nextStatus = FINANCING_STATUS.OVERDUE;
  } else if (hasPartial || (paidCents > 0 && openCents > 0)) {
    nextStatus = FINANCING_STATUS.PARTIALLY_PAID;
  } else if (linked.length > 0) {
    nextStatus = FINANCING_STATUS.ACTIVE;
  }

  return {
    total_paid_amount: fromCents(paidCents),
    total_open_amount: fromCents(openCents),
    total_due_cents: dueCents,
    status: nextStatus,
  };
}

export function applyFinancingReconciliation(db, financingId) {
  if (!Array.isArray(db.financings)) return null;
  const index = db.financings.findIndex((item) => item.id === financingId);
  if (index < 0) return null;
  const current = db.financings[index];
  const recon = reconcileFinancingFromReceivables(current, db);
  const next = {
    ...current,
    status: recon.status,
    total_paid_amount: recon.total_paid_amount,
    total_open_amount: recon.total_open_amount,
    updated_at: new Date().toISOString(),
  };
  db.financings[index] = next;
  return next;
}
