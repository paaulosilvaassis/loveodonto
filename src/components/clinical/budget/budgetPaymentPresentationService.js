import { validateFinancingPaymentOption } from './budgetFinancingUtils.js';
import {
  buildPaymentOptionSnapshot,
  isPaymentOptionChosen,
  isPaymentOptionPresented,
  PAYMENT_PRESENTATION_STATUS,
} from './budgetPaymentPdfUtils.js';
import { getActiveClinicalBudget } from '../../../services/budgetNavigationService.js';

/**
 * Apresenta ou remove apresentação de uma condição de pagamento (todos os tipos).
 * Única entrada para "Apresentar ao paciente" — à vista, parcelado, cartão e financiamento.
 */
export function presentPaymentCondition(budget, optionId, { originalValue, user } = {}) {
  const options = budget?.paymentOptions || [];
  const index = options.findIndex((item) => item.id === optionId);
  if (index < 0) {
    return { ok: false, error: 'Condição de pagamento não encontrada.' };
  }

  const opt = options[index];
  const alreadyPresented = isPaymentOptionPresented(opt);

  if (!alreadyPresented && opt.type === 'financiamento') {
    const errors = validateFinancingPaymentOption(opt, originalValue);
    if (errors.length) {
      return { ok: false, errors };
    }
  }

  const now = new Date().toISOString();
  const nextOption = alreadyPresented
    ? {
      ...opt,
      presentToPatient: false,
      presentationStatus: null,
      presentedAt: null,
      presentedBy: null,
      presentedByName: null,
      presentationSnapshot: null,
    }
    : {
      ...opt,
      presentToPatient: true,
      presentationStatus: PAYMENT_PRESENTATION_STATUS.APRESENTADA,
      presentedAt: now,
      presentedBy: user?.id || null,
      presentedByName: user?.name || user?.nome || null,
      presentationSnapshot: buildPaymentOptionSnapshot(opt, originalValue, user),
    };

  const nextOptions = options.map((item, itemIndex) => (
    itemIndex === index ? nextOption : item
  ));

  return {
    ok: true,
    nextBudget: { ...budget, paymentOptions: nextOptions },
    option: nextOption,
    action: alreadyPresented ? 'unpresented' : 'presented',
  };
}

/**
 * Marca uma condição apresentada como escolhida pelo paciente.
 * Valida financiamento antes de delegar ao handler de persistência (onChoose).
 */
export function markPaymentConditionAsChosen(option, { originalValue, onChoose, onFinancingErrors } = {}) {
  if (!option?.id) {
    return { ok: false, error: 'Condição de pagamento não encontrada.' };
  }

  if (option.type === 'financiamento') {
    const errors = validateFinancingPaymentOption(option, originalValue);
    if (errors.length) {
      onFinancingErrors?.(errors);
      return { ok: false, errors };
    }
  }

  onChoose?.(option);
  return { ok: true };
}

/**
 * Marca UMA condição como escolhida no orçamento informado.
 * Substitui atomicamente qualquer escolha anterior. Não atravessa appointment.
 */
export function choosePaymentCondition(budget, optionId, {
  originalValue,
  user,
  appointmentId = null,
  expectedBudgetId = null,
} = {}) {
  if (!budget?.id) {
    return { ok: false, error: 'Orçamento não encontrado.' };
  }
  if (expectedBudgetId && budget.id !== expectedBudgetId) {
    return { ok: false, error: 'Orçamento não corresponde a este atendimento.' };
  }
  if (appointmentId) {
    const active = getActiveClinicalBudget(appointmentId);
    if (!active?.id || active.id !== budget.id) {
      return { ok: false, error: 'Orçamento ativo deste atendimento não encontrado.' };
    }
  }

  const options = budget.paymentOptions || [];
  const index = options.findIndex((item) => item.id === optionId);
  if (index < 0) {
    return { ok: false, error: 'Condição de pagamento não encontrada neste orçamento.' };
  }

  const opt = options[index];
  if (opt.type === 'financiamento') {
    const errors = validateFinancingPaymentOption(opt, originalValue);
    if (errors.length) {
      return { ok: false, errors };
    }
  }

  const now = new Date().toISOString();
  const snapshot = buildPaymentOptionSnapshot(opt, originalValue, user);
  const nextOptions = options.map((item) => {
    if (item.id !== optionId) {
      if (!isPaymentOptionChosen(item)) return item;
      return {
        ...item,
        accepted: false,
        presentationStatus: isPaymentOptionPresented(item)
          ? PAYMENT_PRESENTATION_STATUS.APRESENTADA
          : null,
      };
    }
    return {
      ...item,
      accepted: true,
      presentToPatient: true,
      presentationStatus: PAYMENT_PRESENTATION_STATUS.ESCOLHIDA,
      presentedAt: item.presentedAt || now,
      presentedBy: user?.id || null,
      presentedByName: user?.name || user?.nome || null,
      presentationSnapshot: snapshot,
    };
  });

  const chosen = nextOptions.filter(isPaymentOptionChosen);
  if (chosen.length !== 1 || chosen[0].id !== optionId) {
    return { ok: false, error: 'Apenas uma condição pode estar escolhida.' };
  }

  return {
    ok: true,
    nextBudget: { ...budget, paymentOptions: nextOptions },
    option: nextOptions[index],
  };
}
