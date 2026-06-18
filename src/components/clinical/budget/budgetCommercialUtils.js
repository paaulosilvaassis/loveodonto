import { formatCurrencyBRL } from '../../../utils/currency.js';
import {
  calcOptionFinalValue,
  CASH_METHODS,
  CARD_BRANDS,
} from './budgetUtils.js';
import { getPaymentOptionTitle } from './budgetEventLabels.js';
import { BUDGET_STATUS } from '../../../services/clinicalBudgetConstants.js';
import { getAcceptedOption } from './budgetUtils.js';
import { canAccessContract, isBudgetApprovedStatus } from '../contract/contractAccessUtils.js';
import { isBudgetLocked, isRealFinanceLinkedToBudget } from './budgetEditAccessUtils.js';
import {
  buildFinancingDisplayLines,
} from './financingDisplayUtils.js';

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
    lines.push({ label: 'Valor original', value: formatCurrencyBRL(originalValue) });
    lines.push({ label: 'Desconto', value: `${Number(opt.discountPercent || 0)}%` });
    lines.push({ label: 'Valor final', value: formatCurrencyBRL(finalVal), strong: true });
    if (methods.length) {
      lines.push({ label: 'Formas aceitas', value: methods.join(', ') });
    }
    highlight = formatCurrencyBRL(finalVal);
  }

  if (opt.type === 'parcelado_clinica') {
    const down = Number(opt.downPayment || 0);
    const inst = Math.max(1, Number(opt.installments || 1));
    const parcel = calcInstallment(finalVal, down, inst);
    lines.push({ label: 'Entrada', value: formatCurrencyBRL(down) });
    lines.push({ label: 'Parcelas', value: `${inst}x` });
    lines.push({ label: 'Valor da parcela', value: formatCurrencyBRL(parcel), strong: true });
    lines.push({ label: 'Total', value: formatCurrencyBRL(finalVal), strong: true });
    highlight = `${inst}x de ${formatCurrencyBRL(parcel)}`;
  }

  if (opt.type === 'cartao') {
    const brand = CARD_BRANDS.find((b) => b.value === opt.cardBrand)?.label || 'Cartão';
    const inst = Math.max(1, Number(opt.installments || 1));
    const parcel = finalVal / inst;
    lines.push({ label: 'Bandeira', value: brand });
    lines.push({ label: 'Parcelas', value: `${inst}x` });
    lines.push({ label: 'Valor da parcela', value: formatCurrencyBRL(parcel), strong: true });
    lines.push({ label: 'Total', value: formatCurrencyBRL(finalVal), strong: true });
    highlight = `${inst}x de ${formatCurrencyBRL(parcel)}`;
  }

  if (opt.type === 'financiamento') {
    const display = buildFinancingDisplayLines(opt, originalValue);
    headline = 'FINANCIAMENTO';
    highlight = display.headline;
    for (const line of display.lines) {
      lines.push({
        label: line.label,
        value: line.value,
        strong: line.emphasis === 'totalFinal' || line.emphasis === 'installment',
        emphasis: line.emphasis,
      });
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
  const isApproved = isBudgetApprovedStatus(status);
  const financeDone = isRealFinanceLinkedToBudget(budget?.id);
  const contractDone = Boolean(
    lockCtx.contractApplies && (lockCtx.hasActiveContract || lockCtx.contractSigned),
  );

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
    if (step.done) {
      stepStatus = 'done';
    } else if (step.key === 'finance' || step.key === 'contract') {
      stepStatus = !isApproved ? 'blocked' : 'pending';
    } else if (index === firstOpenIndex) {
      stepStatus = 'current';
    } else {
      stepStatus = 'pending';
    }
    return { ...step, status: stepStatus };
  });
}

export function resolveNextSteps(budget, financials, lockCtx = {}) {
  const steps = [];
  const accepted = financials?.accepted;
  const isApproved = isBudgetApprovedStatus(budget?.status);

  if (isBudgetLocked(budget, lockCtx)) {
    steps.push({
      id: 'new-budget',
      label: 'Orçamento bloqueado — use "Criar novo orçamento" para nova negociação.',
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

  if (!isRealFinanceLinkedToBudget(budget?.id)) {
    steps.push({ id: 'finance', label: 'Financeiro será gerado na aprovação — verifique Contas a Receber.', tone: 'info' });
  }

  if (!lockCtx?.hasActiveContract) {
    steps.push({ id: 'contract', label: 'Gere o contrato na aba Contrato.', tone: 'info' });
  } else {
    steps.push({ id: 'done', label: 'Orçamento aprovado e contrato em andamento.', tone: 'success' });
  }

  return steps;
}

export function validateBudgetForApproval({ budget, financials, patient, appointment }) {
  const errors = [];

  if (!budget) {
    errors.push('Orçamento ativo não encontrado.');
    return errors;
  }

  if (budget.status === BUDGET_STATUS.APROVADO) {
    errors.push('Este orçamento já está aprovado.');
    return errors;
  }

  if (!(budget.procedures || []).length) {
    errors.push('Defina os procedimentos do tratamento antes de aprovar.');
  }

  const accepted = financials?.accepted || getAcceptedOption(budget);
  if (!accepted) {
    errors.push('Marque a condição de pagamento escolhida pelo paciente.');
  }

  const patientId = patient?.id || appointment?.patientId;
  if (!patientId) {
    errors.push('Paciente não vinculado ao atendimento.');
  }

  const professionalId = budget.professionalId || appointment?.professionalId;
  if (!professionalId) {
    errors.push('Informe o profissional responsável.');
  }

  const finalValue = Number(financials?.finalValue ?? 0);
  if (!Number.isFinite(finalValue) || finalValue <= 0) {
    errors.push('O valor final do orçamento deve ser maior que zero.');
  }

  return errors;
}

export function chosenStatusLabel(budget) {
  if (!budget) return '';
  if (budget.status === BUDGET_STATUS.APROVADO) return 'Aprovado';
  if (budget.status === BUDGET_STATUS.NEGOCIACAO) return 'Aguardando aprovação';
  if (budget.status === BUDGET_STATUS.ENVIADO) return 'Apresentado ao paciente';
  return 'Em elaboração';
}
