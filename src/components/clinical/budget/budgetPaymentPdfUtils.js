import { formatCurrencyBRL } from '../../../utils/currency.js';
import {
  calcOptionFinalValue,
  CASH_METHODS,
  CARD_BRANDS,
} from './budgetUtils.js';
import {
  getFinancingSummaryForOption,
  INTEREST_TYPE_OPTIONS,
  calcEntryPercentFromAmount,
} from './budgetFinancingUtils.js';
import { getFinancialPartnerById } from '../../../services/financialPartnersService.js';
import { getPaymentOptionTitle } from './budgetEventLabels.js';

export const PAYMENT_PRESENTATION_STATUS = {
  APRESENTADA: 'apresentada',
  ESCOLHIDA: 'escolhida',
};

export function isPaymentOptionPresented(opt) {
  if (!opt) return false;
  return Boolean(
    opt.presentToPatient
    || opt.presentedAt
    || opt.presentationStatus === PAYMENT_PRESENTATION_STATUS.APRESENTADA,
  );
}

export function isPaymentOptionChosen(opt) {
  if (!opt) return false;
  return Boolean(
    opt.accepted
    || opt.presentationStatus === PAYMENT_PRESENTATION_STATUS.ESCOLHIDA,
  );
}

export function getChosenPaymentOption(budget) {
  return (budget?.paymentOptions || []).find(isPaymentOptionChosen) || null;
}

export function getPresentedPaymentOptions(budget) {
  return (budget?.paymentOptions || []).filter(isPaymentOptionPresented);
}

export function getOtherPresentedOptions(budget, excludeId) {
  return getPresentedPaymentOptions(budget).filter((opt) => opt.id !== excludeId);
}

function calcInstallment(total, down, installments) {
  const rest = Math.max(0, Number(total || 0) - Number(down || 0));
  const n = Math.max(1, Number(installments || 1));
  return rest / n;
}

function interestTypeLabel(type) {
  return INTEREST_TYPE_OPTIONS.find((item) => item.value === type)?.label || '';
}

function resolvePartnerName(opt) {
  return (
    opt.partner
    || opt.customPartnerName
    || getFinancialPartnerById(opt.partnerId)?.name
    || ''
  );
}

export function buildPaymentOptionSnapshot(opt, originalValue, user) {
  const treatmentValue = calcOptionFinalValue(opt, originalValue);
  const summary = opt.type === 'financiamento'
    ? getFinancingSummaryForOption(opt, originalValue)
    : null;

  const entryPercent = opt.downPaymentPercent ?? (
    treatmentValue > 0
      ? calcEntryPercentFromAmount(treatmentValue, opt.downPayment)
      : 0
  );

  return {
    type: opt.type,
    title: getPaymentOptionTitle(opt),
    treatmentValue,
    finalValue: treatmentValue,
    methods: opt.methods || [opt.method].filter(Boolean),
    discountPercent: Number(opt.discountPercent || 0),
    downPayment: Number(opt.downPayment || 0),
    downPaymentPercent: entryPercent,
    installments: Number(opt.installments || 1),
    cardBrand: opt.cardBrand || null,
    partnerId: opt.partnerId || null,
    partnerName: resolvePartnerName(opt),
    interestType: opt.interestType || null,
    interestRate: Number(opt.interestRate || 0),
    firstDueDate: opt.firstDueDate || null,
    financing: summary
      ? {
          financedAmount: summary.financedAmount,
          installmentAmount: summary.installmentAmount,
          installmentsCount: summary.installmentsCount,
          netFinancedAmount: summary.netFinancedAmount,
          totalPayableAmount: summary.totalPayableAmount,
          totalInterest: summary.totalInterest,
          adminFee: summary.adminFee,
        }
      : null,
    capturedAt: new Date().toISOString(),
    capturedBy: user?.id || null,
    capturedByName: user?.name || user?.nome || null,
  };
}

export function buildPaymentDetailRows(opt, originalValue) {
  if (!opt) return [];

  const snapshot = opt.presentationSnapshot;
  const treatmentValue = snapshot?.treatmentValue ?? calcOptionFinalValue(opt, originalValue);
  const finalVal = treatmentValue;
  const rows = [];

  if (opt.type === 'a_vista') {
    const methods = (snapshot?.methods || opt.methods || [opt.method])
      .filter(Boolean)
      .map((m) => CASH_METHODS.find((c) => c.value === m)?.label || m);
    const discountPct = snapshot?.discountPercent ?? Number(opt.discountPercent || 0);
    rows.push({ label: 'Forma', value: methods.join(', ') || 'À vista' });
    rows.push({ label: 'Valor original', value: formatCurrencyBRL(originalValue) });
    if (discountPct > 0) rows.push({ label: 'Desconto', value: `${discountPct}%` });
    rows.push({ label: 'Valor final', value: formatCurrencyBRL(finalVal), highlight: true });
    return rows;
  }

  if (opt.type === 'parcelado_clinica') {
    const down = snapshot?.downPayment ?? Number(opt.downPayment || 0);
    const inst = Math.max(1, snapshot?.installments ?? Number(opt.installments || 1));
    const parcel = calcInstallment(finalVal, down, inst);
    if (down > 0) rows.push({ label: 'Entrada', value: formatCurrencyBRL(down) });
    rows.push({ label: 'Quantidade de parcelas', value: `${inst}x` });
    rows.push({ label: 'Valor da parcela', value: formatCurrencyBRL(parcel), highlight: true });
    rows.push({ label: 'Total', value: formatCurrencyBRL(finalVal) });
    return rows;
  }

  if (opt.type === 'cartao') {
    const brand = CARD_BRANDS.find((b) => b.value === (snapshot?.cardBrand || opt.cardBrand))?.label || '—';
    const inst = Math.max(1, snapshot?.installments ?? Number(opt.installments || 1));
    const parcel = finalVal / inst;
    rows.push({ label: 'Bandeira', value: brand });
    rows.push({ label: 'Quantidade de parcelas', value: `${inst}x` });
    rows.push({ label: 'Valor da parcela', value: formatCurrencyBRL(parcel), highlight: true });
    rows.push({ label: 'Total', value: formatCurrencyBRL(finalVal) });
    return rows;
  }

  if (opt.type === 'financiamento') {
    const summary = snapshot?.financing
      ? {
          financedAmount: snapshot.financing.financedAmount,
          installmentAmount: snapshot.financing.installmentAmount,
          installmentsCount: snapshot.financing.installmentsCount,
          netFinancedAmount: snapshot.financing.netFinancedAmount,
          totalPayableAmount: snapshot.financing.totalPayableAmount,
        }
      : getFinancingSummaryForOption(opt, originalValue);

    const partner = snapshot?.partnerName || resolvePartnerName(opt);
    const entryAmount = snapshot?.downPayment ?? Number(opt.downPayment || 0);
    const entryPct = snapshot?.downPaymentPercent ?? (
      summary?.totalAmount > 0
        ? calcEntryPercentFromAmount(summary.totalAmount, entryAmount)
        : calcEntryPercentFromAmount(treatmentValue, entryAmount)
    );
    const pctLabel = entryPct % 1 === 0 ? entryPct : Number(entryPct).toFixed(1);

    if (partner) rows.push({ label: 'Parceiro financeiro', value: partner });
    rows.push({ label: 'Valor do tratamento', value: formatCurrencyBRL(treatmentValue) });
    if (entryAmount > 0) {
      rows.push({ label: 'Entrada', value: `${formatCurrencyBRL(entryAmount)} (${pctLabel}%)` });
    }
    if (summary) {
      rows.push({ label: 'Valor financiado', value: formatCurrencyBRL(summary.financedAmount) });
      const typeLabel = interestTypeLabel(snapshot?.interestType || opt.interestType);
      if (typeLabel) rows.push({ label: 'Tipo de juros', value: typeLabel });
      const rate = snapshot?.interestRate ?? opt.interestRate;
      if (Number(rate) > 0) rows.push({ label: 'Taxa aplicada', value: `${rate}%` });
      rows.push({
        label: 'Parcelamento',
        value: `${summary.installmentsCount}x de ${formatCurrencyBRL(summary.installmentAmount)}`,
        highlight: true,
      });
      rows.push({ label: 'Total financiado', value: formatCurrencyBRL(summary.netFinancedAmount) });
      rows.push({
        label: 'Total geral',
        value: formatCurrencyBRL(summary.totalPayableAmount),
        highlight: true,
      });
    }
    return rows;
  }

  return [{ label: 'Valor', value: formatCurrencyBRL(finalVal), highlight: true }];
}

export function buildPaymentCardTitle(opt) {
  if (opt.type === 'financiamento') {
    const partner = resolvePartnerName(opt);
    return partner || 'Financiamento';
  }
  return getPaymentOptionTitle(opt);
}

export function resolvePaymentStatusLabel(opt) {
  if (isPaymentOptionChosen(opt)) return 'Escolhida pelo paciente';
  if (isPaymentOptionPresented(opt)) return 'Apresentada ao paciente';
  return '';
}

export function resolvePdfPaymentSections(budget) {
  const chosen = getChosenPaymentOption(budget);
  const presented = getPresentedPaymentOptions(budget);

  if (chosen) {
    return {
      mode: 'chosen',
      sectionTitle: 'Condição de pagamento escolhida pelo paciente',
      primary: [chosen],
      secondary: getOtherPresentedOptions(budget, chosen.id),
      secondaryTitle: presented.length > 1 ? 'Outras condições apresentadas' : null,
    };
  }

  if (presented.length) {
    return {
      mode: 'presented',
      sectionTitle: 'Condições de pagamento apresentadas',
      primary: presented,
      secondary: [],
      secondaryTitle: null,
    };
  }

  return {
    mode: 'fallback',
    sectionTitle: 'Condição de pagamento',
    primary: [],
    secondary: [],
    secondaryTitle: null,
  };
}
