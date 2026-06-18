import { describe, expect, it } from 'vitest';
import { formatCurrencyBRL } from '../utils/currency.js';
import {
  buildFinancingDisplayLines,
  validateFinancingDataComplete,
  FINANCING_LABELS,
} from '../components/clinical/budget/financingDisplayUtils.js';

describe('financingDisplayUtils', () => {
  const baseOption = {
    type: 'financiamento',
    partnerId: 'partner-1',
    partner: 'Financeira Teste',
    downPayment: 7500,
    downPaymentPercent: 30,
    installments: 48,
    interestType: 'compound',
    interestRate: 15,
  };

  it('exibe valor do tratamento derivado do orçamento', () => {
    const display = buildFinancingDisplayLines(baseOption, 25000);
    const treatment = display.lines.find((l) => l.key === 'treatment');
    expect(treatment?.label).toBe(FINANCING_LABELS.treatment);
    expect(treatment?.value).toBe(formatCurrencyBRL(25000));
    expect(treatment?.emphasis).toBe('treatment');
  });

  it('calcula valor financiado como tratamento menos entrada', () => {
    const display = buildFinancingDisplayLines(baseOption, 25000);
    const financed = display.lines.find((l) => l.key === 'financedPrincipal');
    expect(financed?.value).toBe(formatCurrencyBRL(17500));
    expect(display.summary.financedAmount).toBe(17500);
  });

  it('inclui parcelamento e total final do contrato', () => {
    const display = buildFinancingDisplayLines(baseOption, 25000);
    expect(display.lines.some((l) => l.key === 'installmentPlan')).toBe(true);
    expect(display.lines.some((l) => l.key === 'contractTotal')).toBe(true);
    const totalFinal = display.lines.find((l) => l.key === 'contractTotal');
    expect(totalFinal?.emphasis).toBe('totalFinal');
    expect(display.summary.totalPayableAmount).toBe(
      display.summary.entryAmount + display.summary.netFinancedAmount,
    );
  });

  it('valida campos obrigatórios para contrato', () => {
    const errors = validateFinancingDataComplete(baseOption, 25000);
    expect(errors).toEqual([]);
  });

  it('bloqueia quando valor do tratamento está vazio', () => {
    const errors = validateFinancingDataComplete(baseOption, 0);
    expect(errors.some((e) => e.includes('tratamento'))).toBe(true);
  });
});
