import { describe, expect, it } from 'vitest';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import {
  canAccessContract,
  isBudgetApprovedStatus,
  isPaymentConditionChosen,
} from '../components/clinical/contract/contractAccessUtils.js';

describe('contractAccessUtils', () => {
  const approvedBudget = {
    status: BUDGET_STATUS.APROVADO,
    paymentOptions: [{ id: 'p1', accepted: true }],
  };

  const contractGeneratedBudget = {
    status: BUDGET_STATUS.CONTRATO_GERADO,
    paymentOptions: [{ id: 'p1', presentationStatus: 'escolhida' }],
  };

  it('considera APROVADO e CONTRATO_GERADO como aprovado', () => {
    expect(isBudgetApprovedStatus(BUDGET_STATUS.APROVADO)).toBe(true);
    expect(isBudgetApprovedStatus(BUDGET_STATUS.CONTRATO_GERADO)).toBe(true);
    expect(isBudgetApprovedStatus(BUDGET_STATUS.RASCUNHO)).toBe(false);
  });

  it('libera contrato com orçamento aprovado e condição escolhida', () => {
    expect(canAccessContract(approvedBudget, {})).toBe(true);
  });

  it('mantém contrato acessível após CONTRATO_GERADO', () => {
    const lockCtx = { hasActiveContract: true, contract: { id: 'c1' } };
    expect(canAccessContract(contractGeneratedBudget, lockCtx)).toBe(true);
  });

  it('reconhece condição escolhida por presentationStatus', () => {
    const budget = {
      paymentOptions: [{ id: 'p1', presentationStatus: 'escolhida' }],
    };
    expect(isPaymentConditionChosen(budget)).toBe(true);
  });

  it('bloqueia sem condição escolhida', () => {
    const budget = {
      status: BUDGET_STATUS.APROVADO,
      paymentOptions: [{ id: 'p1', presentToPatient: true }],
    };
    expect(canAccessContract(budget, {})).toBe(false);
  });
});
