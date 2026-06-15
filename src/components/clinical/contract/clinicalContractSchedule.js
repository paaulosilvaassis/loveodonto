import { loadDb } from '../../../db/index.js';
import { formatCurrencyBRL } from '../../../utils/currency.js';
import {
  calcOptionFinalValue,
} from '../budget/budgetUtils.js';
import { buildPaymentDetailRows } from '../budget/budgetPaymentPdfUtils.js';
import { getPaymentOptionTitle } from '../budget/budgetEventLabels.js';
import { getFinancingSummaryForOption } from '../budget/budgetFinancingUtils.js';

function addMonths(dateStr, months) {
  const base = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function formatDateBR(value) {
  if (!value) return '—';
  const str = String(value).trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(str)
    ? new Date(`${str}T12:00:00`)
    : new Date(str);
  if (Number.isNaN(parsed.getTime())) return str;
  return parsed.toLocaleDateString('pt-BR');
}

export function buildInstallmentSchedule(accepted, originalValue, patientId, originIds = []) {
  const db = loadDb();
  const ids = new Set(originIds.filter(Boolean).map(String));
  const receivables = (db.accountsReceivable || [])
    .filter((r) => r.patient_id === patientId)
    .filter((r) => !ids.size || ids.has(String(r.origin_id || '')))
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));

  if (receivables.length) {
    return receivables.map((r, index) => ({
      label: r.description || (index === 0 ? 'Entrada' : `Parcela ${String(index).padStart(2, '0')}`),
      dueDate: r.due_date,
      dueDateFormatted: formatDateBR(r.due_date),
      amount: Number(r.net_amount || 0),
      amountFormatted: formatCurrencyBRL(Number(r.net_amount || 0)),
    }));
  }

  if (!accepted) return [];

  const finalVal = calcOptionFinalValue(accepted, originalValue);
  const rows = [];

  if (accepted.type === 'a_vista') {
    rows.push({
      label: 'Pagamento à vista',
      dueDate: new Date().toISOString().slice(0, 10),
      dueDateFormatted: formatDateBR(new Date()),
      amount: finalVal,
      amountFormatted: formatCurrencyBRL(finalVal),
    });
    return rows;
  }

  const down = Number(accepted.downPayment || 0);
  if (down > 0) {
    rows.push({
      label: 'Entrada',
      dueDate: new Date().toISOString().slice(0, 10),
      dueDateFormatted: formatDateBR(new Date()),
      amount: down,
      amountFormatted: formatCurrencyBRL(down),
    });
  }

  if (accepted.type === 'financiamento') {
    const summary = getFinancingSummaryForOption(accepted, originalValue);
    if (!summary) return rows;
    const firstDue = accepted.firstDueDate || addMonths(new Date().toISOString().slice(0, 10), 1);
    for (let i = 0; i < summary.installmentsCount; i += 1) {
      rows.push({
        label: `Parcela ${String(i + 1).padStart(2, '0')}`,
        dueDate: addMonths(firstDue, i),
        dueDateFormatted: formatDateBR(addMonths(firstDue, i)),
        amount: summary.installmentAmount,
        amountFormatted: formatCurrencyBRL(summary.installmentAmount),
      });
    }
    return rows;
  }

  const installments = Math.max(1, Number(accepted.installments || 1));
  const rest = Math.max(0, finalVal - down);
  const parcelAmount = rest / installments;
  const firstDue = addMonths(new Date().toISOString().slice(0, 10), 1);

  for (let i = 0; i < installments; i += 1) {
    rows.push({
      label: `Parcela ${String(i + 1).padStart(2, '0')}`,
      dueDate: addMonths(firstDue, i),
      dueDateFormatted: formatDateBR(addMonths(firstDue, i)),
      amount: parcelAmount,
      amountFormatted: formatCurrencyBRL(parcelAmount),
    });
  }

  return rows;
}

export function buildFinancialSection(accepted, originalValue, patientId, originIds) {
  const finalVal = accepted ? calcOptionFinalValue(accepted, originalValue) : originalValue;
  const discount = Math.max(0, originalValue - finalVal);
  const paymentTitle = accepted ? getPaymentOptionTitle(accepted) : '—';
  const detailRows = accepted ? buildPaymentDetailRows(accepted, originalValue) : [];
  const schedule = buildInstallmentSchedule(accepted, originalValue, patientId, originIds);

  return {
    originalValue,
    originalValueFormatted: formatCurrencyBRL(originalValue),
    discount,
    discountFormatted: formatCurrencyBRL(discount),
    finalValue: finalVal,
    finalValueFormatted: formatCurrencyBRL(finalVal),
    paymentTitle,
    paymentType: accepted?.type || null,
    detailRows,
    schedule,
  };
}
