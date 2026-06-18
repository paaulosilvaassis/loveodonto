import { formatCurrencyBRL } from '../../../utils/currency.js';
import { calcOptionFinalValue } from './budgetUtils.js';
import { getFinancingSummaryForOption, INTEREST_TYPE_OPTIONS } from './budgetFinancingUtils.js';
import { calcEntryPercentFromAmount } from '../../../services/financialPartnersService.js';
import { getFinancialPartnerById } from '../../../services/financialPartnersService.js';

/** Nomenclatura padronizada em todo o módulo (card, lateral, PDF, contrato). */
export const FINANCING_LABELS = {
  treatment: 'Valor do tratamento',
  entry: 'Entrada',
  financedPrincipal: 'Valor financiado',
  appliedRate: 'Taxa aplicada',
  installmentPlan: 'Parcelamento',
  financedWithInterest: 'Total financiado com juros',
  contractTotal: 'Total final do contrato',
  partner: 'Parceiro financeiro',
  interestType: 'Tipo de juros',
};

export function resolvePartnerName(opt) {
  return (
    opt?.partner
    || opt?.customPartnerName
    || getFinancialPartnerById(opt?.partnerId)?.name
    || ''
  );
}

export function formatAppliedRateLabel(option = {}, summary = null) {
  const rate = Number(option.interestRate ?? summary?.interestRate ?? 0);
  const interestType = option.interestType || summary?.interestType || 'none';
  if (!Number.isFinite(rate) || rate <= 0 || interestType === 'none') return '0%';
  const formatted = rate % 1 === 0 ? String(rate) : rate.toFixed(2);
  if (interestType === 'fixed_percent') return `${formatted}%`;
  return `${formatted}% a.m.`;
}

export function formatEntryLabel(option, treatmentValue, summary) {
  const entryAmount = Number(summary?.entryAmount ?? option?.downPayment ?? 0);
  const base = Number(summary?.totalAmount ?? treatmentValue ?? 0);
  const pct = option?.downPaymentPercent ?? (
    base > 0 ? calcEntryPercentFromAmount(base, entryAmount) : 0
  );
  const pctLabel = pct % 1 === 0 ? pct : Number(pct).toFixed(1);
  if (entryAmount <= 0) return formatCurrencyBRL(0);
  return `${pctLabel}% · ${formatCurrencyBRL(entryAmount)}`;
}

/**
 * Monta linhas padronizadas para cards, lateral, PDF e contrato.
 */
export function buildFinancingDisplayLines(option, originalValue, summaryOverride = null) {
  const treatmentValue = calcOptionFinalValue(option, originalValue);
  const summary = summaryOverride || getFinancingSummaryForOption(option, originalValue);
  const partner = resolvePartnerName(option);

  if (!summary) {
    return {
      treatmentValue,
      summary: null,
      headline: 'Financiamento',
      lines: [
        { key: 'treatment', label: FINANCING_LABELS.treatment, value: formatCurrencyBRL(treatmentValue), emphasis: 'treatment' },
        { key: 'partner', label: FINANCING_LABELS.partner, value: partner || '—' },
      ],
    };
  }

  const interestLabel = INTEREST_TYPE_OPTIONS.find((i) => i.value === option.interestType)?.label;
  const lines = [];

  if (partner) {
    lines.push({ key: 'partner', label: FINANCING_LABELS.partner, value: partner });
  }

  lines.push({
    key: 'treatment',
    label: FINANCING_LABELS.treatment,
    value: formatCurrencyBRL(summary.totalAmount ?? treatmentValue),
    emphasis: 'treatment',
  });

  lines.push({
    key: 'entry',
    label: FINANCING_LABELS.entry,
    value: formatEntryLabel(option, treatmentValue, summary),
  });

  lines.push({
    key: 'financedPrincipal',
    label: FINANCING_LABELS.financedPrincipal,
    value: formatCurrencyBRL(summary.financedAmount),
  });

  if (interestLabel && option.interestType && option.interestType !== 'none') {
    lines.push({ key: 'interestType', label: FINANCING_LABELS.interestType, value: interestLabel });
  }

  lines.push({
    key: 'appliedRate',
    label: FINANCING_LABELS.appliedRate,
    value: formatAppliedRateLabel(option, summary),
  });

  lines.push({
    key: 'installmentPlan',
    label: FINANCING_LABELS.installmentPlan,
    value: `${summary.installmentsCount}x de ${formatCurrencyBRL(summary.installmentAmount)}`,
    emphasis: 'installment',
  });

  lines.push({
    key: 'financedWithInterest',
    label: FINANCING_LABELS.financedWithInterest,
    value: formatCurrencyBRL(summary.netFinancedAmount),
  });

  lines.push({
    key: 'contractTotal',
    label: FINANCING_LABELS.contractTotal,
    value: formatCurrencyBRL(summary.totalPayableAmount),
    emphasis: 'totalFinal',
  });

  return {
    treatmentValue: summary.totalAmount ?? treatmentValue,
    summary,
    headline: `${summary.installmentsCount}x de ${formatCurrencyBRL(summary.installmentAmount)}`,
    lines,
  };
}

/** Valida dados financeiros obrigatórios antes de contrato/PDF. */
export function validateFinancingDataComplete(option, originalValue) {
  const errors = [];
  const treatmentValue = calcOptionFinalValue(option, originalValue);
  const summary = getFinancingSummaryForOption(option, originalValue);

  if (!treatmentValue || treatmentValue <= 0) {
    errors.push('Valor do tratamento não definido.');
    return errors;
  }

  if (!summary) {
    errors.push('Resumo do financiamento indisponível.');
    return errors;
  }

  const entry = Number(summary.entryAmount ?? 0);
  if (!Number.isFinite(entry) || entry < 0) {
    errors.push('Entrada inválida.');
  }

  const financed = Number(summary.financedAmount ?? 0);
  const expectedFinanced = Math.max(0, treatmentValue - entry);
  if (Math.abs(financed - expectedFinanced) > 0.02) {
    errors.push('Valor financiado diverge do tratamento menos entrada.');
  }

  if (!summary.installmentsCount || summary.installmentsCount < 1) {
    errors.push('Número de parcelas inválido.');
  }

  if (!summary.installmentAmount || summary.installmentAmount <= 0) {
    errors.push('Valor da parcela inválido.');
  }

  if (!summary.totalPayableAmount || summary.totalPayableAmount <= 0) {
    errors.push('Total final do contrato inválido.');
  }

  const expectedTotal = entry + summary.netFinancedAmount;
  if (Math.abs(summary.totalPayableAmount - expectedTotal) > 0.05) {
    errors.push('Total final do contrato diverge de entrada + total financiado com juros.');
  }

  return errors;
}
