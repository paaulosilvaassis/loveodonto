import { loadDb, withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId, assertRequired, normalizeText } from './helpers.js';
import { logAction } from './logService.js';

export const TRANSACTION_STATUS = {
  OPEN: 'aberto',
  PAID: 'pago',
  OVERDUE: 'vencido',
};

export const listTransactions = () => loadDb().transactions;
export const listInstallmentPlans = () => loadDb().installmentPlans;

export const createTransaction = (user, payload) => {
  requirePermission(user, 'finance:write');
  const transaction = {
    id: createId('txn'),
    type: normalizeText(payload.type),
    amount: Number(payload.amount || 0),
    dueDate: normalizeText(payload.dueDate),
    paidDate: normalizeText(payload.paidDate),
    status: normalizeText(payload.status || TRANSACTION_STATUS.OPEN),
    patientId: normalizeText(payload.patientId),
    professionalId: normalizeText(payload.professionalId),
    description: normalizeText(payload.description),
    category: normalizeText(payload.category),
    installmentGroupId: normalizeText(payload.installmentGroupId),
    boletoData: payload.boletoData || null,
  };

  assertRequired(transaction.type, 'Tipo é obrigatório (pagar/receber).');
  assertRequired(transaction.amount, 'Valor é obrigatório.');
  assertRequired(transaction.dueDate, 'Vencimento é obrigatório.');

  withDb((db) => {
    db.transactions.push(transaction);
    return db;
  });
  logAction('finance:transaction:create', { transactionId: transaction.id, userId: user.id });
  return transaction;
};

export const createInstallmentPlan = (user, payload) => {
  requirePermission(user, 'finance:write');
  const plan = {
    id: createId('plan'),
    patientId: normalizeText(payload.patientId),
    professionalId: normalizeText(payload.professionalId),
    total: Number(payload.total || 0),
    installments: Number(payload.installments || 1),
    startDate: normalizeText(payload.startDate),
    intervalDays: Number(payload.intervalDays || 30),
    description: normalizeText(payload.description),
  };

  assertRequired(plan.patientId, 'Paciente é obrigatório.');
  assertRequired(plan.total, 'Total é obrigatório.');
  assertRequired(plan.startDate, 'Data inicial é obrigatória.');

  const perInstallment = Number((plan.total / plan.installments).toFixed(2));
  const installmentGroupId = plan.id;

  withDb((db) => {
    db.installmentPlans.push(plan);
    for (let i = 0; i < plan.installments; i += 1) {
      const dueDate = new Date(plan.startDate);
      dueDate.setDate(dueDate.getDate() + plan.intervalDays * i);
      db.transactions.push({
        id: createId('txn'),
        type: 'receber',
        amount: perInstallment,
        dueDate: dueDate.toISOString().slice(0, 10),
        status: TRANSACTION_STATUS.OPEN,
        patientId: plan.patientId,
        professionalId: plan.professionalId,
        description: `Parcela ${i + 1}/${plan.installments} - ${plan.description}`,
        category: 'tratamento',
        installmentGroupId,
        boletoData: null,
      });
    }
    return db;
  });

  logAction('finance:installment:create', { planId: plan.id, userId: user.id });
  return plan;
};

export const getCashflow = ({ startDate, endDate }) => {
  const transactions = listTransactions();
  const filtered = transactions.filter((txn) => {
    if (!txn.dueDate) return false;
    if (startDate && txn.dueDate < startDate) return false;
    if (endDate && txn.dueDate > endDate) return false;
    return true;
  });

  const entries = filtered.filter((txn) => txn.type === 'receber');
  const exits = filtered.filter((txn) => txn.type === 'pagar');
  const totalEntries = entries.reduce((sum, txn) => sum + txn.amount, 0);
  const totalExits = exits.reduce((sum, txn) => sum + txn.amount, 0);

  return {
    entries,
    exits,
    totalEntries,
    totalExits,
    balance: totalEntries - totalExits,
  };
};

export const getDelinquency = () => {
  const today = new Date().toISOString().slice(0, 10);
  return listTransactions().filter(
    (txn) =>
      txn.type === 'receber' &&
      txn.status !== TRANSACTION_STATUS.PAID &&
      txn.dueDate < today
  );
};

export const getCommissions = () => {
  const db = loadDb();
  const paid = db.transactions.filter(
    (txn) => txn.type === 'receber' && txn.status === TRANSACTION_STATUS.PAID
  );
  const financeMap = db.collaboratorFinance?.reduce((acc, item) => {
    acc[item.collaboratorId] = Number(item.percentualComissao || 0);
    return acc;
  }, {}) || {};
  return paid.reduce((acc, txn) => {
    const collaboratorRate = financeMap[txn.professionalId];
    if (collaboratorRate !== undefined) {
      acc[txn.professionalId] = (acc[txn.professionalId] || 0) + txn.amount * collaboratorRate;
      return acc;
    }
    const professional = db.users.find((user) => user.id === txn.professionalId);
    if (!professional) return acc;
    const rate = Number(professional.commissionRate || 0);
    acc[professional.id] = (acc[professional.id] || 0) + txn.amount * rate;
    return acc;
  }, {});
};
