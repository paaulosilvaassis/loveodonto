import {
  calculateFinancingSummary,
  FINANCING_INTEREST_TYPES,
} from '../../../services/financingCalculator.js';
import { calcOptionFinalValue } from './budgetUtils.js';
import {
  computeMinEntryAmount,
  getFinancialPartnerById,
  calcEntryPercentFromAmount,
  getPartnerMinEntryPercent,
  validateEntryPercent,
} from '../../../services/financialPartnersService.js';

export {
  ENTRY_QUICK_PERCENTS,
  roundMoney,
  calcEntryAmountFromPercent,
  calcEntryPercentFromAmount,
  getPartnerMinEntryPercent,
  isQuickPercentAllowed,
  validateEntryPercent,
  resolveEntryPercentMode,
} from '../../../services/financialPartnersService.js';

export const INTEREST_TYPE_OPTIONS = [
  { value: FINANCING_INTEREST_TYPES.NONE, label: 'Sem juros' },
  { value: FINANCING_INTEREST_TYPES.SIMPLE, label: 'Juros simples' },
  { value: FINANCING_INTEREST_TYPES.COMPOUND, label: 'Juros compostos' },
  { value: FINANCING_INTEREST_TYPES.FIXED_PERCENT, label: 'Percentual fixo sobre o valor' },
];

export function buildFinancingPayloadFromPaymentOption(option, originalValue) {
  const total = calcOptionFinalValue(option, originalValue);
  return {
    total_amount: total,
    entry_amount: Number(option.downPayment || 0),
    installments_count: Math.max(1, Number(option.installments || 1)),
    interest_type: option.interestType || option.interest_type || FINANCING_INTEREST_TYPES.NONE,
    interest_rate: Number(option.interestRate ?? option.interest_rate ?? 0),
    discount_amount: Number(option.discountAmount || 0),
    admin_fee_amount: Number(option.adminFeeAmount || 0),
    admin_fee_rate: Number(option.adminFeeRate || 0),
  };
}

export function getFinancingSummaryForOption(option, originalValue) {
  try {
    return calculateFinancingSummary(buildFinancingPayloadFromPaymentOption(option, originalValue));
  } catch {
    return null;
  }
}

export function mapFinancingSummaryToPaymentOption(summary) {
  if (!summary) return {};
  return {
    downPayment: summary.entryAmount,
    installments: summary.installmentsCount,
    installmentValue: summary.installmentAmount,
    interestType: summary.interestType,
    interestRate: summary.interestRate,
    financedAmount: summary.financedAmount,
    netFinancedAmount: summary.netFinancedAmount,
    totalPayableAmount: summary.totalPayableAmount,
    totalInterest: summary.totalInterest,
    adminFee: summary.adminFee,
  };
}

export function validateFinancingPaymentOption(option, originalValue) {
  const errors = [];
  if (!option?.partnerId) {
    errors.push('Selecione um parceiro financeiro.');
    return errors;
  }
  const partner = option.partnerId ? getFinancialPartnerById(option.partnerId) : null;
  const total = calcOptionFinalValue(option, originalValue);
  const down = Number(option.downPayment || 0);
  const installments = Number(option.installments || 1);

  if (partner && !partner.is_manual) {
    const minEntry = computeMinEntryAmount(partner, total);
    const minPercent = getPartnerMinEntryPercent(partner, total);
    const percentError = validateEntryPercent(calcEntryPercentFromAmount(total, down), partner, total);
    if (percentError) {
      errors.push(percentError);
    } else if (down + 0.009 < minEntry) {
      const label = minPercent % 1 === 0 ? `${minPercent}%` : `${minPercent.toFixed(1)}%`;
      errors.push(`A entrada mínima para este parceiro é de ${label}.`);
    }
    if (installments > Number(partner.max_installments || 1)) {
      errors.push(`Máximo de ${partner.max_installments} parcelas para este parceiro.`);
    }
  } else if (installments > 60) {
    errors.push('Máximo de 60 parcelas.');
  }

  if (down > total) {
    errors.push('Entrada não pode ser maior que o valor do tratamento.');
  }

  return errors;
}

export function buildFinancingHistoryPayload(option, originalValue) {
  const summary = getFinancingSummaryForOption(option, originalValue);
  const partner = option.partnerId ? getFinancialPartnerById(option.partnerId) : null;
  return {
    partnerId: option.partnerId || null,
    partnerName: option.partner || partner?.name || null,
    interestType: option.interestType || null,
    interestRate: option.interestRate ?? null,
    downPayment: option.downPayment ?? 0,
    downPaymentPercent: option.downPaymentPercent ?? calcEntryPercentFromAmount(
      summary?.totalAmount ?? calcOptionFinalValue(option, originalValue),
      option.downPayment,
    ),
    installments: option.installments ?? null,
    installmentValue: summary?.installmentAmount ?? null,
    adminFee: summary?.adminFee ?? null,
    financedAmount: summary?.financedAmount ?? null,
    netFinancedAmount: summary?.netFinancedAmount ?? null,
    totalPayableAmount: summary?.totalPayableAmount ?? null,
    treatmentValue: summary?.totalAmount ?? calcOptionFinalValue(option, originalValue),
  };
}

export function isPartnerManualMode(option) {
  if (!option?.partnerId) return true;
  const partner = getFinancialPartnerById(option.partnerId);
  return Boolean(partner?.is_manual);
}

export function getPartnerMaxInstallments(option) {
  const partner = option?.partnerId ? getFinancialPartnerById(option.partnerId) : null;
  if (partner?.is_manual) return 60;
  if (partner?.max_installments) return partner.max_installments;
  return 60;
}
