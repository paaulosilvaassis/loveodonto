/**
 * Navegação clínica de orçamento e contrato — camada de estabilidade.
 *
 * - openExistingBudget / query `budgetId`: id interno real (`budget.id`), nunca só ORC-XXX.
 * - openExistingContract / query `contractId`: id interno real (`contract.id`).
 * - ORC-XXX e CTR-XXX são resolvidos para ids internos via findBudgetRecord; na UI
 *   servem apenas como rótulo (ver friendlyNumbers.js).
 *
 * Não alterar o contrato destas funções sem revisão do fluxo comercial aprovado.
 */
import { loadDb } from '../db/index.js';
import { BUDGET_STATUS } from './clinicalBudgetConstants.js';
import { APPOINTMENT_STATUS } from './appointmentService.js';
import { getLatestApprovedBudget } from './clinicalBudgetApprovedService.js';
import { getGeneratedContract } from './contractService.js';
import { getBudgetLockContextForBudget } from './clinicalBudgetLockService.js';
import { resolveBudgetReadOnlyState } from '../components/clinical/budget/budgetEditAccessUtils.js';

export const BUDGET_CONSISTENCY_ALERT =
  'Inconsistência detectada neste orçamento. Revisar vínculo financeiro/contratual.';

function calcProceduresTotal(procedures = []) {
  return procedures.reduce((sum, proc) => {
    const qty = Number(proc.quantity || 1);
    const unit = Number(proc.unitValue || 0);
    return sum + Number(proc.totalValue ?? qty * unit);
  }, 0);
}

function findAcceptedPaymentOption(budget) {
  return (budget?.paymentOptions || []).find((option) => {
    if (!option) return false;
    if (option.accepted) return true;
    const status = String(option.presentationStatus || '').trim().toLowerCase();
    return ['escolhida', 'chosen', 'accepted', 'selected'].includes(status);
  }) || null;
}

function normalizeBudgetKey(key) {
  if (key == null || key === '') return null;
  return String(key).trim();
}

function budgetMatchesKey(budget, key) {
  if (!budget || !key) return false;
  const normalized = normalizeBudgetKey(key);
  if (budget.id === normalized) return true;
  if (budget.budgetNumber === normalized) return true;
  const budgetNum = String(budget.budgetNumber || '').toUpperCase();
  const searchNum = normalized.toUpperCase();
  return budgetNum && searchNum.startsWith('ORC-') && budgetNum === searchNum;
}

function resolvePatientIdForClinical(ca, db) {
  if (ca.patientId) return ca.patientId;
  const apt = (db.appointments || []).find((a) => a.id === ca.appointmentId);
  return apt?.patientId || null;
}

function matchesPatientFilter(ca, patientId, db) {
  if (!patientId) return true;
  return resolvePatientIdForClinical(ca, db) === patientId;
}

/**
 * Localiza orçamento ativo ou histórico por id, budgetNumber (ORC-XXX) ou appointment.
 */
export function findBudgetRecord({ budgetId, patientId = null, appointmentId = null } = {}) {
  const key = normalizeBudgetKey(budgetId);
  if (!key) return null;

  const db = loadDb();
  const clinicalList = db.clinicalAppointments || [];

  const searchInRecord = (ca) => {
    if (!matchesPatientFilter(ca, patientId, db)) return null;

    if (ca.budget && budgetMatchesKey(ca.budget, key)) {
      return {
        budget: ca.budget,
        appointmentId: ca.appointmentId,
        patientId: resolvePatientIdForClinical(ca, db),
        isInBudgetHistory: false,
      };
    }

    for (const archived of ca.budgetHistory || []) {
      if (budgetMatchesKey(archived, key)) {
        return {
          budget: archived,
          appointmentId: ca.appointmentId,
          patientId: resolvePatientIdForClinical(ca, db),
          isInBudgetHistory: true,
        };
      }
    }
    return null;
  };

  if (appointmentId) {
    const ca = clinicalList.find((c) => c.appointmentId === appointmentId);
    const found = ca ? searchInRecord(ca) : null;
    if (found) return found;
  }

  for (const ca of clinicalList) {
    const found = searchInRecord(ca);
    if (found) return found;
  }

  return null;
}

function getActiveBudget(appointmentId) {
  const db = loadDb();
  return (db.clinicalAppointments || []).find((c) => c.appointmentId === appointmentId)?.budget || null;
}

/** Orçamento ativo do atendimento clínico (não arquivado). */
export function getActiveClinicalBudget(appointmentId) {
  return getActiveBudget(appointmentId);
}

/**
 * Durante atendimento em andamento, ignora budgetId de orçamento arquivado na URL
 * e usa o orçamento ativo — evita abrir ORC antigo em modo somente leitura por engano.
 */
export function resolveEffectiveViewBudgetId(
  appointmentId,
  viewBudgetId,
  { forceHistorical = false, appointmentStatus = null } = {},
) {
  if (!viewBudgetId) return null;
  if (forceHistorical) return viewBudgetId;

  const record = findBudgetRecord({ budgetId: viewBudgetId, appointmentId });
  if (!record?.budget?.id) return viewBudgetId;

  const isLiveSession = appointmentStatus === APPOINTMENT_STATUS.EM_ATENDIMENTO;
  if (!isLiveSession || !record.isInBudgetHistory) {
    return viewBudgetId;
  }

  const active = getActiveBudget(appointmentId);
  if (active?.id && active.id !== record.budget.id) {
    return null;
  }

  return viewBudgetId;
}

function getClinicalPatientId(appointmentId) {
  const db = loadDb();
  const clinical = (db.clinicalAppointments || []).find((c) => c.appointmentId === appointmentId);
  if (clinical?.patientId) return clinical.patientId;
  const apt = (db.appointments || []).find((a) => a.id === appointmentId);
  return apt?.patientId || null;
}

/**
 * Resolve orçamento para visualização na tela de atendimento.
 */
export function resolveBudgetForView(appointmentId, budgetId = null) {
  if (!budgetId) {
    const budget = getActiveBudget(appointmentId);
    return {
      budget,
      isHistoricalView: false,
      isReadOnly: false,
      record: budget
        ? {
          budget,
          appointmentId,
          patientId: getClinicalPatientId(appointmentId),
          isInBudgetHistory: false,
        }
        : null,
    };
  }

  const record = findBudgetRecord({ budgetId, appointmentId });
  if (!record) {
    return { budget: null, isHistoricalView: false, isReadOnly: false, record: null };
  }

  const lockCtx = getBudgetLockContextForBudget(record.appointmentId, record.budget);
  const access = resolveBudgetReadOnlyState(record.budget, lockCtx);

  return {
    budget: record.budget,
    isHistoricalView: access.isHistoricalView,
    isReadOnly: access.isReadOnly,
    mode: access.mode,
    record,
  };
}

function findContractForBudget(appointmentId, budgetId) {
  const db = loadDb();
  return (db.generatedContracts || []).find(
    (contract) => contract.quoteId === appointmentId
      && contract.quoteSource === 'clinical_budget'
      && (!contract.budgetId || contract.budgetId === budgetId),
  ) || null;
}

/**
 * Valida consistência entre procedimentos, valor do orçamento, financeiro e contrato.
 */
export function validateBudgetConsistency(budget, appointmentId, patientId = null) {
  if (!budget) {
    return { isConsistent: true, issues: [], message: null };
  }

  const issues = [];
  const tolerance = 0.02;
  const procedures = budget.procedures || [];
  const proceduresTotal = calcProceduresTotal(procedures);
  const budgetTotal = Number(budget.totalValue || 0);

  if (procedures.length > 0 && budgetTotal > 0 && Math.abs(proceduresTotal - budgetTotal) > tolerance) {
    issues.push('procedures_total_mismatch');
  }

  const accepted = findAcceptedPaymentOption(budget);
  if (accepted) {
    const acceptedTotal = Number(accepted.total || accepted.finalTotal || 0);
    if (acceptedTotal > 0 && budgetTotal > 0 && Math.abs(acceptedTotal - budgetTotal) > tolerance) {
      issues.push('payment_option_mismatch');
    }
  }

  const contract = findContractForBudget(appointmentId, budget.id);
  if (budget.status === BUDGET_STATUS.CONTRATO_GERADO && !contract) {
    issues.push('contract_missing');
  }

  if (contract) {
    const contractValue = Number(contract.totalValueSnapshot || contract.totalValue || contract.value || 0);
    if (contractValue > 0 && budgetTotal > 0 && Math.abs(contractValue - budgetTotal) > tolerance) {
      issues.push('contract_value_mismatch');
    }
  }

  if (budget.financingId) {
    const db = loadDb();
    const financing = (db.financings || db.patientFinancings || []).find((f) => f.id === budget.financingId);
    if (!financing) {
      issues.push('financing_missing');
    } else if (accepted) {
      const financingTotal = Number(financing.totalValue || financing.total || 0);
      const acceptedTotal = Number(accepted.total || accepted.finalTotal || 0);
      if (financingTotal > 0 && acceptedTotal > 0 && Math.abs(financingTotal - acceptedTotal) > tolerance) {
        issues.push('financing_value_mismatch');
      }
    }
  }

  if (
    [BUDGET_STATUS.APROVADO, BUDGET_STATUS.CONTRATO_GERADO].includes(budget.status)
    && !accepted
    && !budget.financingId
  ) {
    issues.push('accepted_payment_missing');
  }

  return {
    isConsistent: issues.length === 0,
    issues,
    message: issues.length ? BUDGET_CONSISTENCY_ALERT : null,
    patientId,
  };
}

/**
 * Resolve o id interno do orçamento para navegação (nunca usar só ORC-XXX na rota).
 */
export function resolveBudgetNavigationId({
  budgetId = null,
  budgetNumber = null,
  patientId = null,
  appointmentId = null,
} = {}) {
  const directId = normalizeBudgetKey(budgetId);
  const friendlyKey = normalizeBudgetKey(budgetNumber);
  const explicitLookup = Boolean(directId || friendlyKey);

  if (directId) {
    const byId = findBudgetRecord({ budgetId: directId, patientId, appointmentId });
    if (byId?.budget?.id) return byId.budget.id;
    if (!String(directId).toUpperCase().startsWith('ORC-')) return directId;
  }

  if (friendlyKey) {
    const byNumber = findBudgetRecord({ budgetId: friendlyKey, patientId, appointmentId });
    if (byNumber?.budget?.id) return byNumber.budget.id;
  }

  // Referência explícita (ORC-XXX / id) não encontrada — não abrir outro orçamento por engano.
  if (explicitLookup) return null;

  if (patientId) {
    const latest = getLatestApprovedBudget(patientId);
    if (latest?.id) return latest.id;
  }

  return null;
}

export function buildClinicalAppointmentUrl({
  appointmentId,
  budgetId = null,
  contractId = null,
  section = null,
} = {}) {
  if (!appointmentId) return '/gestao-comercial/jornada-do-paciente';

  const params = new URLSearchParams();
  if (budgetId) params.set('budgetId', budgetId);
  if (contractId) params.set('contractId', contractId);
  if (section) params.set('section', section);

  const query = params.toString();
  return `/atendimento-clinico/${appointmentId}${query ? `?${query}` : ''}`;
}

/**
 * Abre contrato existente com contexto completo de orçamento e atendimento.
 */
export function openExistingContract(navigate, {
  contractId,
  budgetId = null,
  patientId = null,
  appointmentId = null,
} = {}) {
  if (!contractId) {
    throw new Error('Não foi possível localizar este contrato. Verifique o vínculo no histórico do paciente.');
  }

  const contract = getGeneratedContract(contractId);
  if (!contract) {
    throw new Error('Não foi possível localizar este contrato. Verifique o vínculo no histórico do paciente.');
  }

  const targetAppointmentId = appointmentId || contract.quoteId;
  const targetBudgetId = resolveBudgetNavigationId({
    budgetId: budgetId || contract.budgetId || null,
    patientId: patientId || contract.patientId || null,
    appointmentId: targetAppointmentId,
  });

  const url = buildClinicalAppointmentUrl({
    appointmentId: targetAppointmentId,
    budgetId: targetBudgetId,
    contractId,
    section: 'contratos',
  });

  navigate(url, {
    state: {
      section: 'contratos',
      budgetId: targetBudgetId,
      contractId,
      viewMode: true,
    },
  });

  return {
    appointmentId: targetAppointmentId,
    budgetId: targetBudgetId,
    contractId,
    contract,
  };
}

/**
 * Abre orçamento existente — nunca cria novo registro.
 */
export function openExistingBudget(navigate, {
  budgetId,
  patientId = null,
  appointmentId = null,
  section = 'orcamento',
  mode = null,
} = {}) {
  const resolvedBudgetId = resolveBudgetNavigationId({
    budgetId,
    patientId,
    appointmentId,
  });

  if (!resolvedBudgetId) {
    throw new Error('Não foi possível localizar este orçamento. Verifique o vínculo no histórico do paciente.');
  }

  const record = findBudgetRecord({
    budgetId: resolvedBudgetId,
    patientId,
    appointmentId,
  });
  if (!record?.budget?.id) {
    throw new Error('Não foi possível localizar este orçamento. Verifique o vínculo no histórico do paciente.');
  }

  const targetAppointmentId = record.appointmentId;
  const targetBudgetId = record.budget.id;
  const lockCtx = getBudgetLockContextForBudget(targetAppointmentId, record.budget);
  const access = resolveBudgetReadOnlyState(record.budget, lockCtx, {
    forceEdit: mode === 'edit',
  });
  const resolvedMode = mode === 'edit'
    ? 'edit'
    : mode === 'readonly'
      ? 'readonly'
      : access.mode;
  const readOnlyNavigation = resolvedMode === 'readonly';

  const url = buildClinicalAppointmentUrl({
    appointmentId: targetAppointmentId,
    budgetId: targetBudgetId,
    section: section !== 'orcamento' ? section : null,
  });

  navigate(url, {
    state: {
      section,
      budgetId: targetBudgetId,
      viewMode: readOnlyNavigation,
      mode: resolvedMode,
    },
  });

  return {
    appointmentId: targetAppointmentId,
    budgetId: targetBudgetId,
    budget: record.budget,
    isHistorical: record.isInBudgetHistory,
  };
}

/**
 * Mapeia procedimentos do orçamento para exibição no planejamento (somente leitura).
 */
export function mapBudgetProceduresToPlanningView(procedures = [], budgetCreatedAt = null) {
  return procedures.map((proc) => ({
    id: proc.id,
    procedureId: proc.procedureId,
    code: proc.code,
    category: proc.category,
    name: proc.name,
    tooth: proc.tooth || '',
    region: proc.region || '',
    regionType: proc.regionType,
    quantity: Number(proc.quantity || 1),
    unitValue: Number(proc.unitValue || 0),
    discount: Number(proc.discountRaw ?? proc.discount ?? 0),
    discountType: proc.discountType,
    totalValue: Number(proc.totalValue ?? 0),
    notes: proc.observations || proc.notes || '',
    stage: proc.stage || 'inicial',
    professionalId: proc.professionalId || null,
    createdAt: budgetCreatedAt || new Date().toISOString(),
  }));
}
