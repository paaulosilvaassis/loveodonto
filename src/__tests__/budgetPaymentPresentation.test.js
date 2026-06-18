import { describe, expect, it } from 'vitest';
import { DEFAULT_PAYMENT_OPTIONS } from '../components/clinical/clinicalAppointmentConfig.js';
import { presentPaymentCondition, markPaymentConditionAsChosen } from '../components/clinical/budget/budgetPaymentPresentationService.js';
import {
  buildPaymentOptionSnapshot,
  getPresentedPaymentOptions,
  PAYMENT_PRESENTATION_STATUS,
} from '../components/clinical/budget/budgetPaymentPdfUtils.js';

const user = { id: 'user-1', name: 'Dr. Teste' };
const ORIGINAL = 25000;

function buildBudget() {
  return {
    id: 'budget-1',
    paymentOptions: DEFAULT_PAYMENT_OPTIONS().map((opt) => ({ ...opt, total: ORIGINAL })),
  };
}

describe('presentPaymentCondition', () => {
  it('apresenta à vista com snapshot e status sem erro', () => {
    const budget = buildBudget();
    const result = presentPaymentCondition(budget, 'pay-a-vista', {
      originalValue: ORIGINAL,
      user,
    });

    expect(result.ok).toBe(true);
    expect(result.action).toBe('presented');
    expect(result.option.presentToPatient).toBe(true);
    expect(result.option.presentationStatus).toBe(PAYMENT_PRESENTATION_STATUS.APRESENTADA);
    expect(result.option.presentedAt).toBeTruthy();
    expect(result.option.presentedBy).toBe('user-1');
    expect(() => buildPaymentOptionSnapshot(result.option, ORIGINAL, user)).not.toThrow();

    const presented = getPresentedPaymentOptions(result.nextBudget);
    expect(presented).toHaveLength(1);
    expect(presented[0].id).toBe('pay-a-vista');
  });

  it('apresenta parcelado pela clínica', () => {
    const budget = buildBudget();
    const result = presentPaymentCondition(budget, 'pay-parcelado', {
      originalValue: ORIGINAL,
      user,
    });

    expect(result.ok).toBe(true);
    expect(getPresentedPaymentOptions(result.nextBudget)).toHaveLength(1);
    expect(result.option.id).toBe('pay-parcelado');
  });

  it('apresenta cartão', () => {
    const budget = buildBudget();
    const result = presentPaymentCondition(budget, 'pay-cartao', {
      originalValue: ORIGINAL,
      user,
    });

    expect(result.ok).toBe(true);
    expect(getPresentedPaymentOptions(result.nextBudget)[0].type).toBe('cartao');
  });

  it('permite múltiplas condições apresentadas simultaneamente', () => {
    let budget = buildBudget();
    budget = presentPaymentCondition(budget, 'pay-a-vista', { originalValue: ORIGINAL, user }).nextBudget;
    budget = presentPaymentCondition(budget, 'pay-cartao', { originalValue: ORIGINAL, user }).nextBudget;

    expect(getPresentedPaymentOptions(budget)).toHaveLength(2);
  });

  it('remove apresentação ao clicar novamente', () => {
    const budget = buildBudget();
    const presented = presentPaymentCondition(budget, 'pay-a-vista', {
      originalValue: ORIGINAL,
      user,
    });
    const removed = presentPaymentCondition(presented.nextBudget, 'pay-a-vista', {
      originalValue: ORIGINAL,
      user,
    });

    expect(removed.ok).toBe(true);
    expect(removed.action).toBe('unpresented');
    expect(getPresentedPaymentOptions(removed.nextBudget)).toHaveLength(0);
  });
});

describe('markPaymentConditionAsChosen', () => {
  it('delega onChoose quando condição é válida', () => {
    const budget = buildBudget();
    const presented = presentPaymentCondition(budget, 'pay-a-vista', {
      originalValue: ORIGINAL,
      user,
    });
    const opt = presented.option;
    let chosen = null;

    const result = markPaymentConditionAsChosen(opt, {
      originalValue: ORIGINAL,
      onChoose: (item) => { chosen = item; },
    });

    expect(result.ok).toBe(true);
    expect(chosen?.id).toBe('pay-a-vista');
  });

  it('bloqueia financiamento inválido e reporta erros', () => {
    const budget = buildBudget();
    const finOpt = budget.paymentOptions.find((o) => o.type === 'financiamento');
    const errors = [];
    const result = markPaymentConditionAsChosen(finOpt, {
      originalValue: ORIGINAL,
      onChoose: () => {},
      onFinancingErrors: (list) => errors.push(...list),
    });

    expect(result.ok).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });
});
