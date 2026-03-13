import { loadDb, withDb } from '../db/index.js';
import { DEFAULT_EXPENSE_CATEGORIES } from '../db/migrations.js';
import { listSuppliers } from './suppliersService.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId } from './helpers.js';
import { getTodayCashRegister } from './cashRegisterService.js';

export const PAYABLE_STATUS = {
  PENDING: 'pending',
  SCHEDULED: 'scheduled',
  PAID: 'paid',
  OVERDUE: 'overdue',
};

export const PAYMENT_METHODS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'cartao_debito', label: 'Cartão débito' },
  { value: 'cartao_credito', label: 'Cartão crédito' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'outros', label: 'Outros' },
];

export const RECURRENCE_FREQUENCY = [
  { value: 'semanal', label: 'Semanal' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'anual', label: 'Anual' },
];

const TODAY = () => new Date().toISOString().slice(0, 10);

const computeStatus = (dueDate, paidDate) => {
  if (paidDate) return PAYABLE_STATUS.PAID;
  const today = TODAY();
  if (dueDate && dueDate < today) return PAYABLE_STATUS.OVERDUE;
  return PAYABLE_STATUS.PENDING;
};

export const listExpenseCategories = () => {
  const db = loadDb();
  let categories = Array.isArray(db.expenseCategories) ? db.expenseCategories : [];
  if (categories.length === 0) {
    const now = new Date().toISOString();
    categories = DEFAULT_EXPENSE_CATEGORIES.map((name, i) => ({
      id: `exp-cat-${i + 1}`,
      name,
      status: 'active',
      created_at: now,
      updated_at: now,
    }));
  }
  return categories.filter((c) => (c.status || 'active') === 'active');
};

export const listExpenseSuppliers = () => {
  const db = loadDb();
  return Array.isArray(db.expenseSuppliers) ? db.expenseSuppliers : [];
};

export const createExpenseSupplier = (user, { name, phone = '', email = '' }) => {
  requirePermission(user, 'finance:write');
  const now = new Date().toISOString();
  const id = createId('supplier');
  const record = { id, name: String(name || '').trim(), phone: String(phone || ''), email: String(email || ''), created_at: now };
  withDb((db) => {
    if (!Array.isArray(db.expenseSuppliers)) db.expenseSuppliers = [];
    db.expenseSuppliers.push(record);
    return db;
  });
  return record;
};

export const listPayables = (filters = {}) => {
  const db = loadDb();
  let items = Array.isArray(db.payables) ? [...db.payables] : [];
  const today = TODAY();

  items = items.map((p) => {
    const status = p.paidDate ? PAYABLE_STATUS.PAID : (p.dueDate && p.dueDate < today ? PAYABLE_STATUS.OVERDUE : (p.status || PAYABLE_STATUS.PENDING));
    return { ...p, status };
  });

  const { startDate, endDate, status, categoryId, supplierId } = filters;

  if (startDate) items = items.filter((p) => p.dueDate >= startDate);
  if (endDate) items = items.filter((p) => p.dueDate <= endDate);
  if (status) items = items.filter((p) => p.status === status);
  if (categoryId) items = items.filter((p) => p.categoryId === categoryId);
  if (supplierId) items = items.filter((p) => p.supplierId === supplierId);

  items.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

  return items;
};

export const getPayablesKPIs = (month, year) => {
  const db = loadDb();
  const items = Array.isArray(db.payables) ? db.payables : [];
  const today = TODAY();
  const y = year ?? new Date().getFullYear();
  const m = month ?? new Date().getMonth() + 1;
  const prefix = `${y}-${String(m).padStart(2, '0')}`;

  let totalToPay = 0;
  let totalPaid = 0;
  let totalOverdue = 0;

  items.forEach((p) => {
    const duePrefix = (p.dueDate || '').slice(0, 7);
    if (duePrefix !== prefix) return;

    const amt = Number(p.amount || 0);
    const isPaid = Boolean(p.paidDate);
    const isOverdue = !isPaid && p.dueDate && p.dueDate < today;

    if (isPaid) {
      totalPaid += amt;
    } else if (isOverdue) {
      totalOverdue += amt;
    } else {
      totalToPay += amt;
    }
  });

  return {
    totalToPay,
    totalPaid,
    totalOverdue,
    total: totalToPay + totalOverdue,
  };
};

export const createPayable = (user, payload) => {
  requirePermission(user, 'finance:write');

  const description = String(payload.description || '').trim();
  const categoryId = payload.categoryId || null;
  const supplierId = payload.supplierId || null;
  const amount = Number(payload.amount || 0);
  const dueDate = payload.dueDate || TODAY();
  const paymentMethod = payload.paymentMethod || 'outros';
  const originAccount = payload.originAccount || '';
  const note = payload.note || '';
  const isRecurring = Boolean(payload.isRecurring);
  const recurrenceFrequency = payload.recurrenceFrequency || 'mensal';

  if (!description) throw new Error('Descrição é obrigatória.');
  if (!amount || amount <= 0) throw new Error('Valor deve ser maior que zero.');
  if (!dueDate) throw new Error('Data de vencimento é obrigatória.');
  if (!paymentMethod) throw new Error('Forma de pagamento é obrigatória.');

  const now = new Date().toISOString();
  const id = createId('payable');
  const status = computeStatus(dueDate, null);

  const record = {
    id,
    description,
    categoryId,
    supplierId,
    amount,
    dueDate,
    paidDate: null,
    status,
    paymentMethod,
    originAccount,
    note,
    isRecurring,
    recurrenceFrequency,
    parentId: payload.parentId || null,
    created_at: now,
    updated_at: now,
  };

  withDb((db) => {
    if (!Array.isArray(db.payables)) db.payables = [];
    db.payables.push(record);

    // Geração automática de próximas parcelas para contas recorrentes (12 ocorrências totais)
    if (isRecurring && !payload.parentId) {
      const occurrences = 12;
      const baseDate = new Date(dueDate + 'T12:00:00');
      const addNextDate = (date, step) => {
        const d = new Date(date.getTime());
        if (recurrenceFrequency === 'semanal') {
          d.setDate(d.getDate() + 7 * step);
        } else if (recurrenceFrequency === 'anual') {
          d.setFullYear(d.getFullYear() + step);
        } else {
          // mensal (default)
          d.setMonth(d.getMonth() + step);
        }
        return d.toISOString().slice(0, 10);
      };

      for (let i = 1; i < occurrences; i += 1) {
        const nextDue = addNextDate(baseDate, i);
        const nextId = createId('payable');
        const nextStatus = computeStatus(nextDue, null);
        db.payables.push({
          ...record,
          id: nextId,
          dueDate: nextDue,
          status: nextStatus,
          parentId: id,
          paidDate: null,
          amountPaid: null,
          paidNote: '',
          created_at: now,
          updated_at: now,
        });
      }
    }

    return db;
  });

  return record;
};

export const updatePayable = (user, id, payload) => {
  requirePermission(user, 'finance:write');

  const db = loadDb();
  const idx = (db.payables || []).findIndex((p) => p.id === id);
  if (idx < 0) throw new Error('Conta não encontrada.');

  const current = db.payables[idx];
  if (current.paidDate) throw new Error('Não é possível editar conta já paga.');

  const description = payload.description !== undefined ? String(payload.description || '').trim() : current.description;
  const categoryId = payload.categoryId !== undefined ? payload.categoryId : current.categoryId;
  const supplierId = payload.supplierId !== undefined ? payload.supplierId : current.supplierId;
  const amount = payload.amount !== undefined ? Number(payload.amount || 0) : current.amount;
  const dueDate = payload.dueDate !== undefined ? payload.dueDate : current.dueDate;
  const paymentMethod = payload.paymentMethod !== undefined ? payload.paymentMethod : current.paymentMethod;
  const originAccount = payload.originAccount !== undefined ? payload.originAccount : current.originAccount;
  const note = payload.note !== undefined ? payload.note : current.note;
  const isRecurring = payload.isRecurring !== undefined ? Boolean(payload.isRecurring) : current.isRecurring;
  const recurrenceFrequency = payload.recurrenceFrequency !== undefined ? payload.recurrenceFrequency : current.recurrenceFrequency;

  if (!description) throw new Error('Descrição é obrigatória.');
  if (!amount || amount <= 0) throw new Error('Valor deve ser maior que zero.');
  if (!dueDate) throw new Error('Data de vencimento é obrigatória.');
  if (!paymentMethod) throw new Error('Forma de pagamento é obrigatória.');

  const now = new Date().toISOString();
  const status = computeStatus(dueDate, null);

  const updated = {
    ...current,
    description,
    categoryId,
    supplierId,
    amount,
    dueDate,
    paymentMethod,
    originAccount,
    note,
    isRecurring,
    recurrenceFrequency,
    status,
    updated_at: now,
  };

  withDb((d) => {
    d.payables[idx] = updated;
    return d;
  });

  return updated;
};

export const deletePayable = (user, id) => {
  requirePermission(user, 'finance:write');

  const db = loadDb();
  const idx = (db.payables || []).findIndex((p) => p.id === id);
  if (idx < 0) throw new Error('Conta não encontrada.');

  const current = db.payables[idx];
  if (current.paidDate) throw new Error('Não é possível excluir conta já paga. Considere manter o histórico.');

  withDb((d) => {
    d.payables.splice(idx, 1);
    return d;
  });

  return { deleted: true };
};

export const payPayable = (user, id, payload) => {
  requirePermission(user, 'finance:write');

  const db = loadDb();
  const idx = (db.payables || []).findIndex((p) => p.id === id);
  if (idx < 0) throw new Error('Conta não encontrada.');

  const current = db.payables[idx];
  if (current.paidDate) throw new Error('Esta conta já foi paga.');

  const paidDate = payload.paidDate || TODAY();
  const paymentMethod = payload.paymentMethod || current.paymentMethod;
  const originAccount = payload.originAccount || current.originAccount || '';
  const amountPaid = Number(payload.amountPaid || current.amount || 0);
  const note = payload.note || '';

  const now = new Date().toISOString();
  const updated = {
    ...current,
    paidDate,
    paymentMethod,
    originAccount,
    amountPaid: amountPaid > 0 ? amountPaid : current.amount,
    paidNote: note,
    status: PAYABLE_STATUS.PAID,
    updated_at: now,
  };

  withDb((d) => {
    d.payables[idx] = updated;

    const cashReg = getTodayCashRegister();
    if (cashReg && cashReg.status === 'open') {
      if (!Array.isArray(d.cashTransactions)) d.cashTransactions = [];
      d.cashTransactions.push({
        id: createId('cashtxn'),
        type: 'expense',
        amount: updated.amountPaid || updated.amount,
        description: `Pagamento: ${updated.description}`,
        date: paidDate,
        payable_id: id,
        created_at: now,
      });
    }

    return d;
  });

  return updated;
};

export const getCategoryName = (categoryId) => {
  const cats = listExpenseCategories();
  const c = cats.find((x) => x.id === categoryId);
  return c ? c.name : (categoryId || '—');
};

export const getSupplierName = (supplierId) => {
  if (!supplierId) return '—';
  const fullSuppliers = listSuppliers();
  const s = fullSuppliers.find((x) => x.id === supplierId);
  if (s) return s.trade_name || s.name || s.legal_name || '—';
  const expenseSupps = listExpenseSuppliers();
  const es = expenseSupps.find((x) => x.id === supplierId);
  return es ? es.name : '—';
};
