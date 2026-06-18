import { BUDGET_STATUS } from '../../../services/clinicalBudgetConstants.js';
import { isRealFinanceLinkedToBudget } from '../budget/budgetEditAccessUtils.js';
import { validateFinancingDataComplete } from '../budget/financingDisplayUtils.js';
import { calcPlannedValue } from '../budget/budgetUtils.js';

const APPROVED_BUDGET_STATUSES = new Set([
  BUDGET_STATUS.APROVADO,
  BUDGET_STATUS.CONTRATO_GERADO,
  'APPROVED',
  'APROVADO',
]);

const CHOSEN_PAYMENT_MARKERS = new Set(['escolhida', 'chosen', 'accepted', 'selected']);

export function normalizeBudgetStatus(status) {
  return String(status || '').trim().toUpperCase();
}

export function isBudgetApprovedStatus(status) {
  return APPROVED_BUDGET_STATUSES.has(normalizeBudgetStatus(status));
}

/**
 * Orçamento arquivado (HISTORICO) que permanece válido para visualização de contrato.
 */
export function isHistoricalApprovedBudget(budget, lockCtx = {}) {
  if (!budget || normalizeBudgetStatus(budget.status) !== BUDGET_STATUS.HISTORICO) {
    return false;
  }

  return Boolean(
    budget.approvedAt
    || budget.contractGeneratedAt
    || budget.financingId
    || lockCtx.hasActiveContract
    || lockCtx.contract
    || lockCtx.hasReceivables
    || lockCtx.hasFinancing
    || lockCtx.contractSigned
  );
}

export function getChosenPaymentOption(budget) {
  return (budget?.paymentOptions || []).find((option) => {
    if (!option) return false;
    if (option.accepted) return true;
    const presentation = String(option.presentationStatus || '').trim().toLowerCase();
    return CHOSEN_PAYMENT_MARKERS.has(presentation);
  }) || null;
}

export function isPaymentConditionChosen(budget) {
  return Boolean(getChosenPaymentOption(budget));
}

export function isFinanceGenerated(_lockCtx = {}, budget = null) {
  return isRealFinanceLinkedToBudget(budget?.id);
}

function getFinancingValidationErrors(budget) {
  const chosen = getChosenPaymentOption(budget);
  if (!chosen || chosen.type !== 'financiamento') return [];
  const originalValue = calcPlannedValue(budget?.procedures || []);
  return validateFinancingDataComplete(chosen, originalValue);
}

/**
 * Libera a aba Contrato para visualização quando há orçamento aprovado,
 * contrato gerado, histórico com vínculo ou contrato já vinculado.
 */
export function canAccessContract(budget, lockCtx = {}, options = {}) {
  const { requireFinance = false } = options;

  if (lockCtx.contractApplies && (lockCtx.hasActiveContract || lockCtx.contractSigned)) {
    return Boolean(budget);
  }

  if (!budget) return false;

  if (isHistoricalApprovedBudget(budget, lockCtx)) {
    return true;
  }

  if (!isBudgetApprovedStatus(budget.status)) return false;
  if (!isPaymentConditionChosen(budget)) return false;
  if (getFinancingValidationErrors(budget).length) return false;
  if (requireFinance && !isFinanceGenerated(lockCtx, budget)) return false;

  return true;
}

export function getContractAccessBlockReasons(budget, lockCtx = {}, options = {}) {
  if (lockCtx.contractApplies && (lockCtx.hasActiveContract || lockCtx.contractSigned)) return [];
  if (isHistoricalApprovedBudget(budget, lockCtx)) return [];

  const reasons = [];
  if (!budget) {
    reasons.push('Orçamento não encontrado.');
    return reasons;
  }
  if (!isBudgetApprovedStatus(budget.status)) {
    reasons.push('Orçamento não aprovado.');
  }
  if (!isPaymentConditionChosen(budget)) {
    reasons.push('Forma de pagamento não escolhida.');
  }

  const financingErrors = getFinancingValidationErrors(budget);
  if (financingErrors.length) {
    reasons.push(...financingErrors.map((e) => `Financiamento: ${e}`));
  }

  if (options.requireFinance && !isFinanceGenerated(lockCtx, budget)) {
    reasons.push('Financeiro ainda não gerado.');
  }
  return reasons;
}
