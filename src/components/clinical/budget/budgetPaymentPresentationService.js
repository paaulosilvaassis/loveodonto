import { validateFinancingPaymentOption } from './budgetFinancingUtils.js';
import {
  buildPaymentOptionSnapshot,
  isPaymentOptionPresented,
  PAYMENT_PRESENTATION_STATUS,
} from './budgetPaymentPdfUtils.js';

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
