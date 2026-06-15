import {
  calcPlannedValue,
  calcOptionFinalValue,
  getAcceptedOption,
  formatPaymentOptionLabel,
} from '../components/clinical/budget/budgetUtils.js';

export function enrichClinicalBudgetContext(clinicalBudget, quoteId) {
  if (!clinicalBudget) return null;

  const originalValue = calcPlannedValue(clinicalBudget.procedures || []);
  const accepted = getAcceptedOption(clinicalBudget);
  const total = accepted ? calcOptionFinalValue(accepted, originalValue) : originalValue;

  return {
    originalValue,
    accepted,
    total,
    paymentLabel: accepted ? formatPaymentOptionLabel(accepted) : '—',
    entryAmount: Number(accepted?.downPayment || 0),
    planName: clinicalBudget.planName || clinicalBudget.title || '',
    budgetId: clinicalBudget.id || null,
    receivableOriginIds: [quoteId, clinicalBudget.id].filter(Boolean),
  };
}
