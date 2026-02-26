import { describe, expect, it, beforeEach } from 'vitest';
import { loadDb, initDb, resetDb } from '../db/index.js';
import { createInstallmentPlan, listTransactions } from '../services/financeService.js';

const admin = { id: 'user-admin', role: 'admin' };

describe('Financeiro - parcelas', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('gera parcelas para plano de tratamento', () => {
    createInstallmentPlan(admin, {
      patientId: 'patient-1',
      professionalId: 'prof-1',
      total: 300,
      installments: 3,
      startDate: '2026-01-18',
      intervalDays: 30,
      description: 'Ortodontia',
    });

    const transactions = listTransactions();
    expect(transactions.length).toBe(3);
    expect(transactions[0].amount).toBeCloseTo(100);
  });
});
