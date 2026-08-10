import { loadDb } from '../../../db/index.js';
import { formatCurrencyBRL } from '../../../utils/currency.js';
import {
  calcOptionFinalValue,
  CASH_METHODS,
  CARD_BRANDS,
} from '../budget/budgetUtils.js';
import { buildPaymentDetailRows } from '../budget/budgetPaymentPdfUtils.js';
import { getPaymentOptionTitle } from '../budget/budgetEventLabels.js';
import {
  getFinancingSummaryForOption,
  INTEREST_TYPE_OPTIONS,
  calcEntryPercentFromAmount,
} from '../budget/budgetFinancingUtils.js';
import { getFinancialPartnerById } from '../../../services/financialPartnersService.js';
import { RECEIVABLE_STATUS } from '../../../services/receivablesService.js';

const RECEIVABLE_STATUS_LABELS = {
  [RECEIVABLE_STATUS.PENDING]: 'Pendente',
  [RECEIVABLE_STATUS.DUE_TODAY]: 'Vence hoje',
  [RECEIVABLE_STATUS.UPCOMING]: 'A vencer',
  [RECEIVABLE_STATUS.OVERDUE]: 'Em atraso',
  [RECEIVABLE_STATUS.PARTIALLY_PAID]: 'Parcialmente pago',
  [RECEIVABLE_STATUS.PAID]: 'Pago',
  [RECEIVABLE_STATUS.CANCELED]: 'Cancelado',
  [RECEIVABLE_STATUS.RENEGOTIATED]: 'Renegociado',
};

function addMonths(dateStr, months) {
  const base = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function formatDateBR(value) {
  if (!value) return '';
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [y, m, d] = str.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const parsed = new Date(str.includes('T') ? str : `${str}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return str.replace(/\s+00:00:00/g, '').trim();
  return parsed.toLocaleDateString('pt-BR');
}

function interestTypeLabel(type) {
  return INTEREST_TYPE_OPTIONS.find((item) => item.value === type)?.label || '';
}

function resolvePaymentMethodLabel(accepted) {
  if (!accepted) return '';
  const snapshot = accepted.presentationSnapshot;

  if (accepted.type === 'a_vista') {
    const methods = (snapshot?.methods || accepted.methods || [accepted.method])
      .filter(Boolean)
      .map((m) => CASH_METHODS.find((c) => c.value === m)?.label || m);
    return methods.join(', ') || 'À vista';
  }

  if (accepted.type === 'cartao') {
    const brand = CARD_BRANDS.find((b) => b.value === (snapshot?.cardBrand || accepted.cardBrand))?.label;
    return brand ? `Cartão de crédito (${brand})` : 'Cartão de crédito';
  }

  if (accepted.type === 'parcelado_clinica') {
    const methods = (accepted.methods || [accepted.method]).filter(Boolean);
    const labels = methods.map((m) => CASH_METHODS.find((c) => c.value === m)?.label || m);
    return labels.join(', ') || 'Parcelamento na clínica';
  }

  if (accepted.type === 'financiamento') {
    return (
      snapshot?.partnerName
      || accepted.partner
      || accepted.customPartnerName
      || getFinancialPartnerById(accepted.partnerId)?.name
      || 'Financiamento'
    );
  }

  if (accepted.type === 'installments' || accepted.type === 'parcelado') {
    return accepted.label || getPaymentOptionTitle(accepted) || 'Parcelado';
  }

  return getPaymentOptionTitle(accepted);
}

function resolveReceivableStatusLabel(receivable) {
  const status = receivable?.status || RECEIVABLE_STATUS.PENDING;
  return RECEIVABLE_STATUS_LABELS[status] || 'A vencer';
}

function buildParcelLabel(index, total, isEntry) {
  if (isEntry) return 'Entrada';
  return `Parcela ${String(index).padStart(2, '0')}/${String(total).padStart(2, '0')}`;
}

function enrichScheduleRow(row, index, total, paymentMethod, isEntry) {
  return {
    ...row,
    parcelLabel: buildParcelLabel(index, total, isEntry),
    paymentMethod: row.paymentMethod || paymentMethod,
    statusLabel: row.statusLabel || 'A vencer',
    isEntry,
  };
}

export function buildInstallmentSchedule(accepted, originalValue, patientId, originIds = []) {
  const db = loadDb();
  const ids = new Set(originIds.filter(Boolean).map(String));
  const paymentMethod = resolvePaymentMethodLabel(accepted);
  const receivables = (db.accountsReceivable || [])
    .filter((r) => r.patient_id === patientId)
    .filter((r) => !ids.size || ids.has(String(r.origin_id || '')))
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));

  if (receivables.length) {
    const installmentTotal = receivables.filter((r) => !/entrada/i.test(r.description || '')).length
      || receivables.length;
    let installmentIndex = 0;
    return receivables.map((r) => {
      const isEntry = /entrada/i.test(r.description || '');
      if (!isEntry) installmentIndex += 1;
      const index = isEntry ? 0 : installmentIndex;
      const total = isEntry ? installmentTotal : installmentTotal;
      return enrichScheduleRow({
        label: r.description || buildParcelLabel(index, total, isEntry),
        dueDate: r.due_date,
        dueDateFormatted: formatDateBR(r.due_date),
        amount: Number(r.net_amount || 0),
        amountFormatted: formatCurrencyBRL(Number(r.net_amount || 0)),
        paymentMethod: r.payment_method_label || paymentMethod,
        statusLabel: resolveReceivableStatusLabel(r),
      }, index, total, paymentMethod, isEntry);
    });
  }

  if (!accepted) return [];

  const finalVal = calcOptionFinalValue(accepted, originalValue);
  const rows = [];

  if (accepted.type === 'a_vista') {
    rows.push(enrichScheduleRow({
      label: 'Pagamento à vista',
      dueDate: new Date().toISOString().slice(0, 10),
      dueDateFormatted: formatDateBR(new Date()),
      amount: finalVal,
      amountFormatted: formatCurrencyBRL(finalVal),
      statusLabel: 'Previsto',
    }, 1, 1, paymentMethod, false));
    return rows;
  }

  const down = Number(accepted.entry ?? accepted.downPayment ?? 0);
  const installments = accepted.type === 'financiamento'
    ? (getFinancingSummaryForOption(accepted, originalValue)?.installmentsCount || 0)
    : Math.max(1, Number(accepted.installments || 1));
  const totalParcels = installments + (down > 0 ? 0 : 0);
  let installmentIndex = 0;

  if (down > 0) {
    rows.push(enrichScheduleRow({
      label: 'Entrada',
      dueDate: accepted.entryDueDate || new Date().toISOString().slice(0, 10),
      dueDateFormatted: formatDateBR(accepted.entryDueDate || new Date()),
      amount: down,
      amountFormatted: formatCurrencyBRL(down),
      statusLabel: 'Previsto',
    }, 0, installments, paymentMethod, true));
  }

  if (accepted.type === 'financiamento') {
    const summary = getFinancingSummaryForOption(accepted, originalValue);
    if (!summary) return rows;
    const firstDue = accepted.firstDueDate || addMonths(new Date().toISOString().slice(0, 10), 1);
    for (let i = 0; i < summary.installmentsCount; i += 1) {
      installmentIndex += 1;
      rows.push(enrichScheduleRow({
        label: `Parcela ${String(i + 1).padStart(2, '0')}`,
        dueDate: addMonths(firstDue, i),
        dueDateFormatted: formatDateBR(addMonths(firstDue, i)),
        amount: summary.installmentAmount,
        amountFormatted: formatCurrencyBRL(summary.installmentAmount),
        statusLabel: 'A vencer',
      }, installmentIndex, summary.installmentsCount, paymentMethod, false));
    }
    return rows;
  }

  const rest = Math.max(0, finalVal - down);
  const parcelAmount = rest / installments;
  const firstDue = addMonths(new Date().toISOString().slice(0, 10), 1);

  for (let i = 0; i < installments; i += 1) {
    installmentIndex += 1;
    rows.push(enrichScheduleRow({
      label: `Parcela ${String(i + 1).padStart(2, '0')}`,
      dueDate: addMonths(firstDue, i),
      dueDateFormatted: formatDateBR(addMonths(firstDue, i)),
      amount: parcelAmount,
      amountFormatted: formatCurrencyBRL(parcelAmount),
      statusLabel: 'A vencer',
    }, installmentIndex, installments, paymentMethod, false));
  }

  return rows;
}

function buildFinancialSummaryLines(accepted, originalValue) {
  if (!accepted) {
    return [{ label: 'Valor do tratamento', value: formatCurrencyBRL(originalValue) }];
  }

  const snapshot = accepted.presentationSnapshot;
  const finalVal = calcOptionFinalValue(accepted, originalValue);
  const discount = Math.max(0, originalValue - finalVal);
  const discountPct = originalValue > 0 ? ((discount / originalValue) * 100) : 0;
  const lines = [
    { label: 'Valor do tratamento', value: formatCurrencyBRL(originalValue) },
  ];

  if (discount > 0) {
    lines.push({ label: 'Desconto concedido', value: formatCurrencyBRL(discount) });
    lines.push({
      label: 'Percentual de desconto',
      value: `${discountPct % 1 === 0 ? discountPct : discountPct.toFixed(1)}%`,
    });
  }

  lines.push({ label: 'Valor final do contrato', value: formatCurrencyBRL(finalVal) });
  lines.push({ label: 'Forma de pagamento', value: resolvePaymentMethodLabel(accepted) });

  const down = Number(snapshot?.downPayment ?? accepted.entry ?? accepted.downPayment ?? 0);
  if (down > 0) {
    const entryPct = snapshot?.downPaymentPercent ?? (
      finalVal > 0 ? calcEntryPercentFromAmount(finalVal, down) : 0
    );
    const pctLabel = entryPct % 1 === 0 ? entryPct : Number(entryPct).toFixed(1);
    lines.push({ label: 'Entrada', value: formatCurrencyBRL(down) });
    lines.push({ label: 'Percentual da entrada', value: `${pctLabel}%` });
  }

  if (accepted.type === 'financiamento') {
    const summary = snapshot?.financing
      ? {
          financedAmount: snapshot.financing.financedAmount,
          installmentAmount: snapshot.financing.installmentAmount,
          installmentsCount: snapshot.financing.installmentsCount,
          netFinancedAmount: snapshot.financing.netFinancedAmount,
          totalPayableAmount: snapshot.financing.totalPayableAmount,
        }
      : getFinancingSummaryForOption(accepted, originalValue);

    const partner = snapshot?.partnerName
      || accepted.partner
      || accepted.customPartnerName
      || getFinancialPartnerById(accepted.partnerId)?.name;

    if (partner) lines.push({ label: 'Parceiro financeiro', value: partner });
    if (summary) {
      lines.push({ label: 'Valor financiado', value: formatCurrencyBRL(summary.financedAmount) });
      const typeLabel = interestTypeLabel(snapshot?.interestType || accepted.interestType);
      if (typeLabel) lines.push({ label: 'Tipo de financiamento', value: typeLabel });
      const rate = snapshot?.interestRate ?? accepted.interestRate;
      if (Number(rate) > 0) lines.push({ label: 'Taxa aplicada', value: `${rate}%` });
      lines.push({ label: 'Quantidade de parcelas', value: String(summary.installmentsCount) });
      lines.push({ label: 'Valor de cada parcela', value: formatCurrencyBRL(summary.installmentAmount) });
      lines.push({ label: 'Total financiado', value: formatCurrencyBRL(summary.netFinancedAmount) });
      lines.push({ label: 'Total geral do contrato', value: formatCurrencyBRL(summary.totalPayableAmount) });
      const firstDue = snapshot?.firstDueDate || accepted.firstDueDate;
      if (firstDue) lines.push({ label: 'Primeiro vencimento', value: formatDateBR(firstDue) });
    }
  } else if (accepted.type === 'cartao' || accepted.type === 'parcelado_clinica') {
    const inst = Math.max(1, snapshot?.installments ?? Number(accepted.installments || 1));
    const parcel = (finalVal - down) / inst;
    lines.push({ label: 'Quantidade de parcelas', value: String(inst) });
    lines.push({ label: 'Valor de cada parcela', value: formatCurrencyBRL(parcel) });
    if (accepted.type === 'cartao') {
      const brand = CARD_BRANDS.find((b) => b.value === (snapshot?.cardBrand || accepted.cardBrand))?.label;
      if (brand) lines.push({ label: 'Bandeira do cartão', value: brand });
    }
  }

  return lines;
}

export function buildFinancialSection(accepted, originalValue, patientId, originIds) {
  const finalVal = accepted ? calcOptionFinalValue(accepted, originalValue) : originalValue;
  const discount = Math.max(0, originalValue - finalVal);
  const paymentTitle = accepted ? getPaymentOptionTitle(accepted) : '';
  const detailRows = accepted ? buildPaymentDetailRows(accepted, originalValue) : [];
  const schedule = buildInstallmentSchedule(accepted, originalValue, patientId, originIds);
  const installmentRows = schedule.filter((row) => !row.isEntry);
  const summaryLines = buildFinancialSummaryLines(accepted, originalValue);

  return {
    originalValue,
    originalValueFormatted: formatCurrencyBRL(originalValue),
    discount,
    discountFormatted: formatCurrencyBRL(discount),
    finalValue: finalVal,
    finalValueFormatted: formatCurrencyBRL(finalVal),
    paymentTitle,
    paymentMethodLabel: resolvePaymentMethodLabel(accepted),
    paymentType: accepted?.type || null,
    detailRows,
    summaryLines,
    schedule,
    installmentCount: installmentRows.length,
    installmentValue: installmentRows[0]?.amount || 0,
    installmentValueFormatted: installmentRows[0]?.amountFormatted || '',
  };
}
