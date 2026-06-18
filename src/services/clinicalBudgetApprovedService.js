import { loadDb } from '../db/index.js';
import { BUDGET_STATUS } from './clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { formatFriendlyBudgetNumber } from '../utils/friendlyNumbers.js';
import { formatCurrencyBRL } from '../utils/currency.js';

const APPROVED_STATUSES = new Set([
  BUDGET_STATUS.APROVADO,
  BUDGET_STATUS.CONTRATO_GERADO,
  'APROVADO',
  'APPROVED',
]);

const EXCLUDED_STATUSES = new Set([
  BUDGET_STATUS.RASCUNHO,
  BUDGET_STATUS.REPROVADO,
  BUDGET_STATUS.CANCELADO,
  BUDGET_STATUS.ENVIADO,
  BUDGET_STATUS.NEGOCIACAO,
]);

function resolveClinicalPatientId(ca, db) {
  if (ca.patientId) return ca.patientId;
  const apt = (db.appointments || []).find((a) => a.id === ca.appointmentId);
  return apt?.patientId || null;
}

function findBudgetContract(db, appointmentId, budgetId) {
  return (db.generatedContracts || []).find(
    (contract) => contract.quoteId === appointmentId
      && contract.quoteSource === 'clinical_budget'
      && (!contract.budgetId || contract.budgetId === budgetId),
  ) || null;
}

function hasActiveFinancing(db, patientId, financingId) {
  if (!financingId) return false;
  const financing = (db.financings || []).find((f) => f.id === financingId);
  if (!financing) return false;
  if (financing.patient_id && financing.patient_id !== patientId) return false;
  const status = String(financing.status || '').toLowerCase();
  return !['canceled', 'cancelado', 'quitado', 'rejected', 'reprovado'].includes(status);
}

/**
 * Verifica se o registro representa um orçamento efetivamente aprovado.
 */
export function isApprovedBudgetRecord(budget, appointmentId, patientId, db = loadDb()) {
  if (!budget) return false;

  const status = String(budget.status || '').toUpperCase();
  if (EXCLUDED_STATUSES.has(status)) return false;

  if (APPROVED_STATUSES.has(status)) return true;
  if (budget.approvedAt) return true;

  const contract = findBudgetContract(db, appointmentId, budget.id);
  if (contract && ![CONTRACT_STATUS.REPLACED, CONTRACT_STATUS.CANCELED].includes(contract.status)) {
    return true;
  }

  if (hasActiveFinancing(db, patientId, budget.financingId)) return true;

  if (status === BUDGET_STATUS.HISTORICO) {
    return Boolean(budget.approvedAt || budget.financingId || contract);
  }

  return false;
}

function resolveBudgetTotal(budget) {
  if (!budget) return 0;
  if (budget.totalValue != null) return Number(budget.totalValue);
  return (budget.procedures || []).reduce(
    (sum, proc) => sum + Number(proc.totalValue ?? 0),
    0,
  );
}

function resolveApprovedAt(budget) {
  return budget.approvedAt
    || budget.contractGeneratedAt
    || budget.archivedAt
    || budget.updatedAt
    || budget.createdAt
    || null;
}

function listPatientBudgetsForNumbering(patientId, db) {
  const items = [];

  for (const ca of db.clinicalAppointments || []) {
    const clinicalPatientId = ca.patientId || resolveClinicalPatientId(ca, db);
    if (clinicalPatientId !== patientId) continue;

    for (const budget of [...(ca.budgetHistory || []), ...(ca.budget ? [ca.budget] : [])]) {
      items.push({
        id: budget.id,
        createdAt: budget.createdAt,
        budgetNumber: budget.budgetNumber,
      });
    }
  }

  return items.sort(
    (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0),
  );
}

function resolveBudgetDisplayNumber(budget, numberedBudgets) {
  const index = numberedBudgets.findIndex((item) => item.id === budget.id);
  return formatFriendlyBudgetNumber(budget.budgetNumber, index >= 0 ? index + 1 : 1);
}

/**
 * Retorna o orçamento aprovado mais recente do paciente.
 */
export function getLatestApprovedBudget(patientId) {
  if (!patientId) return null;

  const db = loadDb();
  const numberedBudgets = listPatientBudgetsForNumbering(patientId, db);
  const candidates = [];

  for (const ca of db.clinicalAppointments || []) {
    const clinicalPatientId = ca.patientId || resolveClinicalPatientId(ca, db);
    if (clinicalPatientId !== patientId) continue;

    const budgets = [
      ...(ca.budgetHistory || []).map((budget) => ({ budget, appointmentId: ca.appointmentId })),
      ...(ca.budget ? [{ budget: ca.budget, appointmentId: ca.appointmentId }] : []),
    ];

    for (const { budget, appointmentId } of budgets) {
      if (!isApprovedBudgetRecord(budget, appointmentId, patientId, db)) continue;

      const contract = findBudgetContract(db, appointmentId, budget.id);
      const hasFinancing = hasActiveFinancing(db, patientId, budget.financingId);
      const hasContract = Boolean(
        contract && ![CONTRACT_STATUS.REPLACED, CONTRACT_STATUS.CANCELED].includes(contract.status),
      );

      candidates.push({
        id: budget.id,
        appointmentId,
        patientId,
        budgetNumber: resolveBudgetDisplayNumber(budget, numberedBudgets),
        totalAmount: resolveBudgetTotal(budget),
        status: budget.status,
        approvedAt: resolveApprovedAt(budget),
        contractId: contract?.id || null,
        contractStatus: contract?.status || null,
        financialId: budget.financingId || null,
        hasFinancing,
        hasContract: hasContract || budget.status === BUDGET_STATUS.CONTRATO_GERADO,
        planName: budget.planName || '',
      });
    }
  }

  if (!candidates.length) return null;

  candidates.sort(
    (a, b) => new Date(b.approvedAt || 0) - new Date(a.approvedAt || 0),
  );

  return candidates[0];
}

export function buildApprovedBudgetQuickSummaryText(latest) {
  if (!latest) return 'Nenhum orçamento aprovado';

  const mainLine = `Orçamento aprovado: ${latest.budgetNumber} • ${formatCurrencyBRL(latest.totalAmount)}`;
  const extras = [];
  if (latest.hasContract) extras.push('Contrato gerado');
  if (latest.hasFinancing) extras.push('Financiamento ativo');
  return extras.length ? `${mainLine}\n${extras.join('\n')}` : mainLine;
}

export const CLINICAL_BUDGET_UPDATED_EVENT = 'clinical-budget-updated';

export function notifyClinicalBudgetUpdated(patientId) {
  if (!patientId || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CLINICAL_BUDGET_UPDATED_EVENT, {
    detail: { patientId },
  }));
}
