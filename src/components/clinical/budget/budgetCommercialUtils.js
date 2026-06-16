import { formatCurrencyBRL } from '../../../utils/currency.js';
import {
  calcOptionFinalValue,
  CASH_METHODS,
  CARD_BRANDS,
} from './budgetUtils.js';
import { getFinancingSummaryForOption } from './budgetFinancingUtils.js';
import { getFinancialPartnerById } from '../../../services/financialPartnersService.js';
import { getPaymentOptionTitle } from './budgetEventLabels.js';
import { BUDGET_STATUS } from '../../../services/clinicalService.js';

function calcInstallment(total, down, installments) {
  const rest = Math.max(0, Number(total || 0) - Number(down || 0));
  const n = Math.max(1, Number(installments || 1));
  return rest / n;
}

export function getPaymentTypeLabel(type) {
  const map = {
    a_vista: 'PIX / À vista',
    parcelado_clinica: 'Parcelado clínica',
    cartao: 'Cartão',
    financiamento: 'Financiamento',
  };
  return map[type] || 'Condição';
}

export function getPaymentCardPreview(opt, originalValue) {
  const finalVal = calcOptionFinalValue(opt, originalValue);
  const lines = [];
  let headline = getPaymentTypeLabel(opt.type);
  let highlight = formatCurrencyBRL(finalVal);

  if (opt.type === 'a_vista') {
    const methods = (opt.methods || [opt.method])
      .filter(Boolean)
      .map((m) => CASH_METHODS.find((c) => c.value === m)?.label || m);
    headline = methods[0]?.toUpperCase() || 'À VISTA';
    lines.push({ label: 'Valor', value: formatCurrencyBRL(originalValue) });
    if (Number(opt.discountPercent) > 0) {
      lines.push({ label: 'Desconto', value: `${opt.discountPercent}%` });
    }
    highlight = formatCurrencyBRL(finalVal);
    lines.push({ label: 'Valor final', value: highlight, strong: true });
  }

  if (opt.type === 'parcelado_clinica') {
    const down = Number(opt.downPayment || 0);
    const inst = Math.max(1, Number(opt.installments || 1));
    const parcel = calcInstallment(finalVal, down, inst);
    if (down > 0) lines.push({ label: 'Entrada', value: formatCurrencyBRL(down) });
    lines.push({ label: 'Parcelamento', value: `${inst}x de ${formatCurrencyBRL(parcel)}` });
    lines.push({ label: 'Total', value: formatCurrencyBRL(finalVal), strong: true });
    highlight = `${inst}x de ${formatCurrencyBRL(parcel)}`;
  }

  if (opt.type === 'cartao') {
    const brand = CARD_BRANDS.find((b) => b.value === opt.cardBrand)?.label || 'Cartão';
    const inst = Math.max(1, Number(opt.installments || 1));
    const parcel = finalVal / inst;
    const downPct = originalValue > 0 ? Math.round((Number(opt.downPayment || 0) / originalValue) * 100) : 0;
    if (downPct > 0) {
      lines.push({ label: 'Entrada', value: `${downPct}% · ${formatCurrencyBRL(opt.downPayment || 0)}` });
    }
    lines.push({ label: 'Bandeira', value: brand });
    lines.push({ label: 'Parcelamento', value: `${inst}x de ${formatCurrencyBRL(parcel)}` });
    lines.push({ label: 'Total', value: formatCurrencyBRL(finalVal), strong: true });
    highlight = `${inst}x de ${formatCurrencyBRL(parcel)}`;
  }

  if (opt.type === 'financiamento') {
    const summary = getFinancingSummaryForOption(opt, originalValue);
    const partner =
      opt.partner ||
      opt.customPartnerName ||
      getFinancialPartnerById(opt.partnerId)?.name ||
      '—';
    const pct = opt.downPaymentPercent ?? (
      summary?.totalAmount > 0
        ? ((summary.entryAmount / summary.totalAmount) * 100).toFixed(0)
        : null
    );
    headline = 'FINANCIAMENTO';
    lines.push({ label: 'Parceiro', value: partner });
    if (pct) lines.push({ label: 'Entrada', value: `${pct}% · ${formatCurrencyBRL(opt.downPayment || 0)}` });
    if (summary) {
      lines.push({ label: 'Valor financiado', value: formatCurrencyBRL(summary.financedAmount) });
      lines.push({
        label: 'Parcelamento',
        value: `${summary.installmentsCount}x de ${formatCurrencyBRL(summary.installmentAmount)}`,
      });
      lines.push({ label: 'Total contrato', value: formatCurrencyBRL(summary.totalPayableAmount), strong: true });
      highlight = `${summary.installmentsCount}x de ${formatCurrencyBRL(summary.installmentAmount)}`;
    }
  }

  return { headline, subtitle: getPaymentOptionTitle(opt), lines, highlight };
}

export function formatPresentedAt(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function resolveFunnelSteps(budget, financials, lockCtx = {}) {
  const options = budget?.paymentOptions || [];
  const accepted = financials?.accepted;
  const status = budget?.status;
  const hasTreatment = (budget?.procedures || []).length > 0;
  const hasPresented = options.some((o) => o.presentToPatient || o.presentedAt);
  const isApproved = status === BUDGET_STATUS.APROVADO;
  const financeDone = Boolean(lockCtx.hasReceivables || lockCtx.hasFinancing || budget?.financingId);
  const contractDone = Boolean(lockCtx.hasActiveContract || lockCtx.contractSigned);

  const raw = [
    { key: 'treatment', label: 'Tratamento definido', done: hasTreatment },
    { key: 'presented', label: 'Condições apresentadas', done: hasPresented },
    { key: 'chosen', label: 'Condição escolhida', done: Boolean(accepted) },
    { key: 'approved', label: 'Orçamento aprovado', done: isApproved },
    { key: 'finance', label: 'Financeiro gerado', done: financeDone && isApproved },
    { key: 'contract', label: 'Contrato liberado', done: contractDone },
  ];

  const firstOpenIndex = raw.findIndex((s) => !s.done);

  return raw.map((step, index) => {
    let stepStatus = 'pending';
    if (step.done) stepStatus = 'done';
    else if (index === firstOpenIndex) stepStatus = 'current';
    else if (firstOpenIndex >= 0 && index > firstOpenIndex) {
      stepStatus = raw.slice(0, index).every((s) => s.done) ? 'pending' : 'blocked';
    }
    return { ...step, status: stepStatus };
  });
}

export function resolveNextSteps(budget, financials, lockCtx = {}) {
  const steps = [];
  const accepted = financials?.accepted;
  const isApproved = budget?.status === BUDGET_STATUS.APROVADO;

  if (lockCtx?.isLocked) {
    steps.push({
      id: 'new-budget',
      label: 'Contrato gerado — use "Criar novo orçamento" para nova negociação.',
      tone: 'info',
    });
    return steps;
  }

  if (!(budget?.procedures || []).length) {
    steps.push({ id: 'planning', label: 'Defina os procedimentos no Planejamento.', tone: 'warning' });
    return steps;
  }

  const hasPresented = (budget?.paymentOptions || []).some((o) => o.presentToPatient);
  if (!hasPresented) {
    steps.push({ id: 'present', label: 'Apresente ao menos uma condição de pagamento ao paciente.', tone: 'warning' });
  }

  if (!accepted) {
    steps.push({ id: 'choose', label: 'Marque a condição escolhida pelo paciente.', tone: 'warning' });
    return steps;
  }

  if (!isApproved) {
    steps.push({ id: 'approve', label: 'Aprove o orçamento para gerar financeiro e contrato.', tone: 'primary' });
    return steps;
  }

  if (!lockCtx?.hasReceivables && !lockCtx?.hasFinancing) {
    steps.push({ id: 'finance', label: 'Financeiro será gerado na aprovação — verifique Contas a Receber.', tone: 'info' });
  }

  if (!lockCtx?.hasActiveContract) {
    steps.push({ id: 'contract', label: 'Gere o contrato na aba Contrato.', tone: 'info' });
  } else {
    steps.push({ id: 'done', label: 'Orçamento aprovado e contrato em andamento.', tone: 'success' });
  }

  return steps;
}

export function chosenStatusLabel(budget) {
  if (!budget) return '';
  if (budget.status === BUDGET_STATUS.APROVADO) return 'Aprovado';
  if (budget.status === BUDGET_STATUS.NEGOCIACAO) return 'Aguardando aprovação';
  if (budget.status === BUDGET_STATUS.ENVIADO) return 'Apresentado ao paciente';
  return 'Em elaboração';
}
