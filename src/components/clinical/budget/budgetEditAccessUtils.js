import { loadDb } from '../../../db/index.js';
import { BUDGET_STATUS } from '../../../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../../../contracts/contractConstants.js';

/** Status em que o orçamento permanece negociável. */
export const EDITABLE_BUDGET_STATUSES = new Set([
  BUDGET_STATUS.RASCUNHO,
  BUDGET_STATUS.ENVIADO,
  BUDGET_STATUS.NEGOCIACAO,
]);

const STATUS_ALIASES = {
  EM_ELABORACAO: BUDGET_STATUS.RASCUNHO,
  DRAFT: BUDGET_STATUS.RASCUNHO,
  RASCUNHO: BUDGET_STATUS.RASCUNHO,
  ENVIADO: BUDGET_STATUS.ENVIADO,
  SENT: BUDGET_STATUS.ENVIADO,
  APRESENTADO: BUDGET_STATUS.NEGOCIACAO,
  NEGOCIACAO: BUDGET_STATUS.NEGOCIACAO,
  NEGOTIATION: BUDGET_STATUS.NEGOCIACAO,
};

const TERMINAL_STATUSES = new Set([
  BUDGET_STATUS.CONTRATO_GERADO,
  BUDGET_STATUS.HISTORICO,
  BUDGET_STATUS.CANCELADO,
]);

const CONTRACT_BLOCK_STATUSES = new Set([
  CONTRACT_STATUS.GENERATED,
  CONTRACT_STATUS.SENT,
  CONTRACT_STATUS.VIEWED,
  CONTRACT_STATUS.SIGNED,
  CONTRACT_STATUS.DRAFT,
  CONTRACT_STATUS.CANCELED,
]);

const FINANCE_LINKED_MESSAGE =
  'Este orçamento está bloqueado porque já possui financeiro gerado para este orçamento.';

const INACTIVE_RECEIVABLE_STATUSES = new Set(['CANCELED', 'RENEGOTIATED', 'CANCELADO', 'RENEGOCIADO']);
const INACTIVE_FINANCING_STATUSES = new Set(['CANCELED', 'RENEGOTIATED', 'CANCELADO', 'RENEGOCIADO']);

export function normalizeBudgetStatus(status) {
  const raw = String(status || BUDGET_STATUS.RASCUNHO).trim().toUpperCase();
  return STATUS_ALIASES[raw] || raw;
}

/**
 * Contrato vinculado ao orçamento específico (evita bloquear negociação por contrato de outro ciclo).
 */
export function isContractLinkedToBudget(contract, budget) {
  if (!contract || !budget?.id) return false;
  if (!contract.budgetId) return false;
  return contract.budgetId === budget.id;
}

export function isBudgetNegotiationStatus(status) {
  return EDITABLE_BUDGET_STATUSES.has(normalizeBudgetStatus(status));
}

export function isBudgetPendingDecisionStatus(status) {
  return isBudgetNegotiationStatus(status);
}

function matchesBudgetId(row, budgetId) {
  const key = String(budgetId);
  return String(row?.origin_id || '') === key
    || String(row?.budget_id || row?.budgetId || '') === key;
}

function isActiveReceivable(row) {
  const status = String(row?.status || '').trim().toUpperCase();
  return !INACTIVE_RECEIVABLE_STATUSES.has(status);
}

function isActiveFinancing(row) {
  const status = String(row?.status || '').trim().toUpperCase();
  return !INACTIVE_FINANCING_STATUSES.has(status);
}

export function listFinanceRecordsLinkedToBudget(budgetId) {
  if (!budgetId) return { receivables: [], financings: [] };
  const db = loadDb();
  const key = String(budgetId);
  const receivables = (db.accountsReceivable || []).filter(
    (row) => matchesBudgetId(row, key) && isActiveReceivable(row),
  );
  const lists = [db.financings, db.patientFinancings].filter(Boolean);
  const financings = lists.flat().filter(
    (row) => matchesBudgetId(row, key) && isActiveFinancing(row),
  );
  return { receivables, financings };
}

/**
 * Conta a receber real vinculada exclusivamente ao budget.id (sem patientId).
 */
export function hasRealReceivableLinkedToBudget(budgetId) {
  if (!budgetId) return false;
  return listFinanceRecordsLinkedToBudget(budgetId).receivables.length > 0;
}

/**
 * Financiamento real vinculado exclusivamente ao budget.id (sem patientId).
 */
export function hasRealFinancingLinkedToBudget(budgetId) {
  if (!budgetId) return false;
  return listFinanceRecordsLinkedToBudget(budgetId).financings.length > 0;
}

/**
 * Fonte única de verdade: financeiro real vinculado ao budget.id atual.
 * Não usa patientId, financingId órfão nem financeGenerated legado.
 */
export function isRealFinanceLinkedToBudget(budgetId) {
  if (!budgetId) return false;
  return hasRealReceivableLinkedToBudget(budgetId)
    || hasRealFinancingLinkedToBudget(budgetId);
}

/** @deprecated Use isRealFinanceLinkedToBudget */
export function hasLinkedFinancingInDb(budgetId) {
  return hasRealFinancingLinkedToBudget(budgetId);
}

/** @deprecated Use hasRealReceivableLinkedToBudget */
export function hasLinkedReceivablesInDb(budgetId) {
  return hasRealReceivableLinkedToBudget(budgetId);
}

function findContractById(contractId) {
  if (!contractId) return null;
  const db = loadDb();
  return (db.generatedContracts || []).find((row) => row.id === contractId) || null;
}

function contractBelongsToBudget(contract, budgetId) {
  if (!contract || !budgetId) return false;
  if (contract.budgetId) return contract.budgetId === budgetId;
  return false;
}

function isBlockingContractRecord(contract) {
  if (!contract) return false;
  if (contract.status === CONTRACT_STATUS.REPLACED) return false;
  return CONTRACT_BLOCK_STATUSES.has(contract.status);
}

export function isRealContractLinkedToBudget(budgetId) {
  if (!budgetId) return false;
  const db = loadDb();
  return (db.generatedContracts || []).some(
    (contract) => contractBelongsToBudget(contract, budgetId)
      && isBlockingContractRecord(contract),
  );
}

function findContractsForBudgetInDb(budgetId) {
  if (!budgetId) return [];
  const db = loadDb();
  return (db.generatedContracts || []).filter(
    (contract) => contractBelongsToBudget(contract, budgetId)
      && isBlockingContractRecord(contract),
  );
}

function resolveRealContractLink(budget, lockCtx = {}) {
  const budgetId = budget?.id;
  if (!budgetId) return null;

  const ctxContract = lockCtx.contract;
  if (
    ctxContract?.id
    && contractBelongsToBudget(ctxContract, budgetId)
    && isBlockingContractRecord(ctxContract)
    && (
      lockCtx.hasActiveContract
      || lockCtx.contractSigned
      || lockCtx.contractCanceled
    )
  ) {
    return ctxContract;
  }

  const fieldIds = [
    budget.contractId,
    budget.generatedContractId,
    budget.generatedContract?.id,
  ].filter(Boolean);

  for (const contractId of fieldIds) {
    const row = findContractById(contractId);
    if (!row || !isBlockingContractRecord(row)) continue;
    if (row.budgetId && row.budgetId !== budgetId) continue;
    if (!row.budgetId || row.budgetId === budgetId) return row;
  }

  const dbContracts = findContractsForBudgetInDb(budgetId);
  return dbContracts[0] || null;
}

function logBudgetLockDebug(budget, lockCtx, diagnosis) {
  if (!import.meta.env?.DEV || !budget) return;

  const budgetId = budget.id;
  const financeRecords = listFinanceRecordsLinkedToBudget(budgetId);
  const realFinanceLinked = isRealFinanceLinkedToBudget(budgetId);
  const realContractLinked = Boolean(resolveRealContractLink(budget, lockCtx))
    || isRealContractLinkedToBudget(budgetId);
  const status = normalizeBudgetStatus(budget.status);

  console.log('[BUDGET LOCK DEBUG]', {
    budgetId,
    budgetNumber: budget.budgetNumber,
    status: budget.status,
    statusNormalized: status,
    financeGenerated: budget.financeGenerated ?? null,
    financingId: budget.financingId ?? null,
    realFinanceLinked,
    financeReceivableCount: financeRecords.receivables.length,
    financeFinancingCount: financeRecords.financings.length,
    financeReceivableIds: financeRecords.receivables.map((row) => row.id),
    financeFinancingIds: financeRecords.financings.map((row) => row.id),
    realContractLinked,
    isNegotiation: isBudgetNegotiationStatus(status),
    isLocked: diagnosis.locked,
    reason: diagnosis.reason,
  });
}

/**
 * Diagnóstico único de bloqueio — fonte de verdade para UI e regras de edição.
 */
export function diagnoseBudgetLock(budget, lockCtx = {}) {
  if (!budget) {
    return { locked: false, reason: null, message: null };
  }

  const status = normalizeBudgetStatus(budget.status);

  if (TERMINAL_STATUSES.has(status)) {
    const message = status === BUDGET_STATUS.HISTORICO
      ? 'Este orçamento está arquivado no histórico e não pode ser alterado.'
      : status === BUDGET_STATUS.CANCELADO
        ? 'Este orçamento foi cancelado e não pode ser alterado.'
        : 'Este orçamento já possui contrato gerado e não pode ser alterado.';
    const diagnosis = { locked: true, reason: 'status', message };
    logBudgetLockDebug(budget, lockCtx, diagnosis);
    return diagnosis;
  }

  const contract = resolveRealContractLink(budget, lockCtx);
  if (contract && !isBudgetNegotiationStatus(status)) {
    const diagnosis = {
      locked: true,
      reason: 'contract',
      message: 'Este orçamento está bloqueado porque já possui contrato vinculado. Para nova negociação, crie um novo orçamento.',
    };
    logBudgetLockDebug(budget, lockCtx, diagnosis);
    return diagnosis;
  }

  // Financeiro vinculado após aprovação é esperado — não bloqueia fluxo nem contrato.
  const diagnosis = { locked: false, reason: null, message: null };
  logBudgetLockDebug(budget, lockCtx, diagnosis);
  return diagnosis;
}

/**
 * Orçamento bloqueado — delega para diagnoseBudgetLock.
 */
export function isBudgetLocked(budget, lockCtx = {}) {
  return diagnoseBudgetLock(budget, lockCtx).locked;
}

export function getBudgetLockMessage(budget, lockCtx = {}) {
  return diagnoseBudgetLock(budget, lockCtx).message;
}

/**
 * Estado de edição/visualização do orçamento na tela clínica.
 */
export function resolveBudgetReadOnlyState(
  budget,
  lockCtx = {},
  { forceEdit = false } = {},
) {
  if (!budget) {
    return {
      isReadOnly: false,
      isEditBlocked: false,
      isHistoricalView: false,
      isNegotiationOpen: false,
      isPendingDecision: false,
      canEdit: true,
      canApprove: false,
      canPresent: false,
      canChooseCondition: false,
      canGenerateFinance: false,
      canGenerateContract: false,
      mode: 'edit',
    };
  }

  const status = normalizeBudgetStatus(budget.status);
  const diagnosis = diagnoseBudgetLock(budget, lockCtx);
  const hardLocked = forceEdit ? false : diagnosis.locked;
  const isNegotiation = isBudgetNegotiationStatus(status);
  const isApproved = status === BUDGET_STATUS.APROVADO || status === BUDGET_STATUS.CONTRATO_GERADO;
  const isHistoricalView = status === BUDGET_STATUS.HISTORICO;
  const commercialFrozen = hardLocked || isApproved;

  return {
    isReadOnly: commercialFrozen,
    isEditBlocked: hardLocked,
    isHistoricalView,
    isNegotiationOpen: !hardLocked && isNegotiation,
    isPendingDecision: !hardLocked && isNegotiation,
    canEdit: !commercialFrozen,
    canApprove: !hardLocked && isNegotiation,
    canPresent: !hardLocked,
    canChooseCondition: !hardLocked,
    canGenerateFinance: isApproved && !hardLocked,
    canGenerateContract: isApproved && !hardLocked,
    mode: commercialFrozen ? 'readonly' : 'edit',
    lockReason: diagnosis.reason,
    lockMessage: diagnosis.message,
    isApprovedView: isApproved && !hardLocked,
  };
}

/** @deprecated Use resolveBudgetReadOnlyState */
export function resolveBudgetViewAccess(budget, lockCtx = {}) {
  return resolveBudgetReadOnlyState(budget, lockCtx);
}

/** @deprecated Use resolveBudgetReadOnlyState */
export function resolveBudgetViewAccessFromRecord(budget, lockCtx = {}, _options = {}) {
  return resolveBudgetReadOnlyState(budget, lockCtx);
}
