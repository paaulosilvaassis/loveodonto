import { loadDb, withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId } from './helpers.js';
import { TRANSACTION_STATUS } from './financeService.js';

const TODAY = () => new Date().toISOString().slice(0, 10);

export const CASH_STATUS = {
  OPEN: 'open',
  CLOSED: 'closed',
};

export const listCashRegisters = () => {
  const db = loadDb();
  return Array.isArray(db.cashRegisters) ? db.cashRegisters : [];
};

export const getTodayCashRegister = () => {
  const today = TODAY();
  return (
    listCashRegisters()
      .filter((c) => c.date === today)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null
  );
};

export const openCashRegister = (user, { initialCash, note = '' }) => {
  requirePermission(user, 'finance:write');
  const date = TODAY();

  const existing = getTodayCashRegister();
  if (existing && existing.status === CASH_STATUS.OPEN) {
    throw new Error('Já existe um caixa aberto para hoje.');
  }

  const now = new Date().toISOString();
  const record = {
    id: createId('cash'),
    date,
    user_id: user?.id || null,
    initial_cash: Number(initialCash || 0),
    status: CASH_STATUS.OPEN,
    note: String(note || ''),
    created_at: now,
  };

  withDb((db) => {
    if (!Array.isArray(db.cashRegisters)) db.cashRegisters = [];
    db.cashRegisters.push(record);
    return db;
  });

  return record;
};

export const getCashSummaryForDate = (date) => {
  const db = loadDb();
  const targetDate = date || TODAY();
  const registers = Array.isArray(db.cashRegisters) ? db.cashRegisters : [];
  const cash = registers.find((c) => c.date === targetDate && c.status === CASH_STATUS.OPEN) || null;

  const transactions = Array.isArray(db.transactions) ? db.transactions : [];
  const cashTransactions = Array.isArray(db.cashTransactions) ? db.cashTransactions : [];

  const isSameDay = (isoDate) => isoDate && isoDate.slice(0, 10) === targetDate;

  const entries = transactions.filter(
    (t) => t.type === 'receber' && (isSameDay(t.paidDate) || isSameDay(t.dueDate))
  );
  const exitsLegacy = transactions.filter(
    (t) => t.type === 'pagar' && (isSameDay(t.paidDate) || isSameDay(t.dueDate))
  );
  const exitsCash = cashTransactions.filter(
    (t) => (t.type === 'expense' || t.type === 'saida') && isSameDay(t.date)
  );

  const sum = (items) => items.reduce((acc, t) => acc + Number(t.amount || 0), 0);

  const totalEntries = sum(entries);
  const totalExits = sum(exitsLegacy) + sum(exitsCash);
  const initial = cash ? Number(cash.initial_cash || 0) : 0;

  return {
    date: targetDate,
    cashRegister: cash,
    initialCash: initial,
    entries: totalEntries,
    exits: totalExits,
    currentBalance: initial + totalEntries - totalExits,
  };
};

