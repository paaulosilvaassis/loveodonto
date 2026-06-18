import { describe, expect, it } from 'vitest';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { validateBudgetForApproval } from '../components/clinical/budget/budgetCommercialUtils.js';

const baseBudget = {
  id: 'budget-1',
  status: BUDGET_STATUS.NEGOCIACAO,
  professionalId: 'pro-1',
  procedures: [{ id: 'p1', quantity: 1, unitValue: 1000, totalValue: 1000 }],
  paymentOptions: [{ id: 'opt-1', type: 'a_vista', accepted: true, method: 'pix' }],
};

const baseFinancials = {
  originalValue: 1000,
  finalValue: 1000,
  accepted: baseBudget.paymentOptions[0],
};

describe('validateBudgetForApproval', () => {
  it('retorna vazio quando todos os requisitos estão ok', () => {
    const errors = validateBudgetForApproval({
      budget: baseBudget,
      financials: baseFinancials,
      patient: { id: 'patient-1' },
      appointment: { professionalId: 'pro-1' },
    });
    expect(errors).toEqual([]);
  });

  it('exige condição de pagamento escolhida', () => {
    const errors = validateBudgetForApproval({
      budget: { ...baseBudget, paymentOptions: [{ id: 'opt-1', accepted: false }] },
      financials: { ...baseFinancials, accepted: null },
      patient: { id: 'patient-1' },
      appointment: { professionalId: 'pro-1' },
    });
    expect(errors[0]).toMatch(/condição de pagamento/i);
  });

  it('exige paciente vinculado', () => {
    const errors = validateBudgetForApproval({
      budget: baseBudget,
      financials: baseFinancials,
      patient: null,
      appointment: {},
    });
    expect(errors[0]).toMatch(/paciente/i);
  });

  it('exige valor final maior que zero', () => {
    const errors = validateBudgetForApproval({
      budget: baseBudget,
      financials: { ...baseFinancials, finalValue: 0 },
      patient: { id: 'patient-1' },
      appointment: { professionalId: 'pro-1' },
    });
    expect(errors[0]).toMatch(/valor final/i);
  });
});
