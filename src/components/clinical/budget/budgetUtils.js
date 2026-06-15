import { formatCurrencyBRL } from '../../../utils/currency.js';
import { getPaymentOptionTitle } from './budgetEventLabels.js';
import { getFinancingSummaryForOption } from './budgetFinancingUtils.js';
const CASH_METHODS = [
  { value: 'pix', label: 'Pix' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'cartao_debito', label: 'Débito' },
];

const CARD_BRANDS = [
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'elo', label: 'Elo' },
  { value: 'amex', label: 'Amex' },
  { value: 'hipercard', label: 'Hipercard' },
  { value: 'outro', label: 'Outro' },
];

export { CASH_METHODS, CARD_BRANDS };

export function calcProcedureTotal(proc) {
  const qty = Number(proc.quantity || 1);
  const unit = Number(proc.unitValue || 0);
  return Number(proc.totalValue ?? qty * unit);
}

export function calcPlannedValue(procedures = []) {
  return procedures.reduce((sum, proc) => sum + calcProcedureTotal(proc), 0);
}

export function calcOptionFinalValue(opt, originalValue) {
  const base = Number(opt?.total) > 0 ? Number(opt.total) : Number(originalValue ?? 0);
  const pct = Number(opt?.discountPercent || 0);
  if (pct > 0) return Math.max(0, base * (1 - pct / 100));
  const fixed = Number(opt?.discount || 0);
  if (fixed > 0) return Math.max(0, base - fixed);
  return base;
}

export function calcOptionDiscount(opt, originalValue) {
  const base = Number(opt?.total) > 0 ? Number(opt.total) : Number(originalValue ?? 0);
  return Math.max(0, base - calcOptionFinalValue(opt, originalValue));
}

export function formatPaymentOptionLabel(opt) {
  if (!opt) return 'Não definida';
  if (opt.type === 'a_vista') {
    const methods = (opt.methods || [opt.method]).filter(Boolean);
    const labels = methods.map((m) => CASH_METHODS.find((c) => c.value === m)?.label || m);
    const disc = opt.discountPercent ? ` · ${opt.discountPercent}% desc.` : '';
    return `À vista (${labels.join(', ') || '—'})${disc}`;
  }
  if (opt.type === 'parcelado_clinica') {
    const inst = Number(opt.installments || 1);
    const val = calcOptionFinalValue(opt);
    const parcel = inst > 0 ? val / inst : val;
    return `Parcelado clínica · ${inst}x de ${formatCurrencyBRL(parcel)}`;
  }
  if (opt.type === 'cartao') {
    const brand = CARD_BRANDS.find((b) => b.value === opt.cardBrand)?.label || opt.cardBrand || 'Cartão';
    return `${brand} · ${opt.installments || 1}x · ${formatCurrencyBRL(calcOptionFinalValue(opt))}`;
  }
  if (opt.type === 'financiamento') {
    const summary = getFinancingSummaryForOption(opt, calcOptionFinalValue(opt));
    const partner = opt.partner || 'Financiamento';
    if (summary) {
      return `${partner} · ${summary.installmentsCount}x de ${formatCurrencyBRL(summary.installmentAmount)} · Total ${formatCurrencyBRL(summary.totalPayableAmount)}`;
    }
    return `${partner} · ${opt.installments || 1}x`;
  }  return getPaymentOptionTitle(opt) || '—';
}

export function getAcceptedOption(budget) {
  return (budget?.paymentOptions || []).find((o) => o.accepted) || null;
}

export function resolveBudgetFinancials(budget) {
  const originalValue = calcPlannedValue(budget?.procedures || []);
  const accepted = getAcceptedOption(budget);
  const finalValue = accepted ? calcOptionFinalValue(accepted, originalValue) : originalValue;
  const discount = Math.max(0, originalValue - finalValue);
  return { originalValue, finalValue, discount, accepted };
}
