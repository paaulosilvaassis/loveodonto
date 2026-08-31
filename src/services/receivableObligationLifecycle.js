import { loadDb, withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { RECEIVABLE_STATUS } from './auditEventCatalog.js';
import { scheduleReceivableUpdatedDomainEvent } from './financialDomainEventPublisher.js';
import { scheduleFinancialV2ShadowWrite } from './financialV2ShadowWrite.js';
import { assertReceivableWriteOwnership } from './receivablePaymentLifecycle.js';
import {
  refreshFinancingFromReceivable,
  sumEffectivePaidCents,
} from './receivableReconciliation.js';
import { toCents } from './receivableMoney.js';

export const RECEIVABLE_UPDATE_PERMISSION = 'financeiro_contas_receber:edit';
export const RECEIVABLE_CANCEL_PERMISSION = 'financeiro_contas_receber:cancel';

function findReceivableRow(db, id) {
  const items = Array.isArray(db.accountsReceivable) ? db.accountsReceivable : [];
  const index = items.findIndex((row) => row.id === id);
  return { items, index, current: index >= 0 ? items[index] : null };
}

function effectivePaidCents(receivable, db) {
  return sumEffectivePaidCents(db.receivablePayments || [], receivable.id);
}

function remainingCents(receivable, paidCents) {
  return Math.max(toCents(receivable.net_amount || 0) - paidCents, 0);
}

/**
 * Cancela um título cobrável sem pagamento efetivo.
 * PARTIALLY_PAID / paid: FAIL CLOSED (não inventa refund/crédito/estorno).
 * Já cancelado: no-op idempotente.
 */
export function cancelReceivable(user, id, reason = '') {
  requirePermission(user, RECEIVABLE_CANCEL_PERMISSION);
  if (!id) throw new Error('Título é obrigatório para cancelamento.');

  let saved = null;
  let replayed = false;
  let fromStatus = null;

  withDb((db) => {
    if (!Array.isArray(db.accountsReceivable)) db.accountsReceivable = [];
    const { items, index, current } = findReceivableRow(db, id);
    if (!current) throw new Error('Título não encontrado.');

    assertReceivableWriteOwnership(user, current, db);

    if (current.status === RECEIVABLE_STATUS.CANCELED) {
      replayed = true;
      saved = current;
      return db;
    }

    const paidCents = effectivePaidCents(current, db);
    const openCents = remainingCents(current, paidCents);

    if (current.status === RECEIVABLE_STATUS.PAID || (paidCents > 0 && openCents <= 0)) {
      throw new Error('Não é possível cancelar título já pago. Utilize estorno/renegociação.');
    }
    if (paidCents > 0 && openCents > 0) {
      const error = new Error(
        'Cancelamento de título parcialmente pago exige decisão de produto (estorno, crédito ou baixa do saldo). Operação bloqueada.',
      );
      error.code = 'PARTIALLY_PAID_CANCEL_REQUIRES_PRODUCT_DECISION';
      throw error;
    }

    fromStatus = current.status;
    const now = new Date().toISOString();
    const updated = {
      ...current,
      status: RECEIVABLE_STATUS.CANCELED,
      canceled_at: now,
      canceled_reason: reason || '',
      canceled_by: user?.id || null,
      updated_at: now,
    };
    items[index] = updated;
    db.accountsReceivable = items;
    refreshFinancingFromReceivable(db, updated);
    saved = updated;
    return db;
  });

  if (!replayed) {
    scheduleReceivableUpdatedDomainEvent(user, saved, {
      status: RECEIVABLE_STATUS.CANCELED,
      from_status: fromStatus,
      canceled_reason: reason || '',
    });
  }
  scheduleFinancialV2ShadowWrite({ entityType: 'receivable', record: saved });
  return saved;
}

export function listPathAReceivablesForBudget(budgetId, db = loadDb()) {
  const oid = String(budgetId || '').trim();
  if (!oid) return [];
  return (db.accountsReceivable || []).filter((row) => {
    const origin = String(row.origin_id || row.budget_id || '').trim();
    const originType = row.origin_type || row.originType;
    if (origin !== oid) return false;
    return originType === 'treatment_plan';
  });
}
