import { loadDb, withDb } from '../db/index.js';
import {
  getContractStatusForQuote,
  hasSignedContractForQuote,
} from './contractModuleService.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { DEFAULT_PAYMENT_OPTIONS } from '../components/clinical/clinicalAppointmentConfig.js';
import { calcPlannedValue } from '../components/clinical/budget/budgetUtils.js';

import { createId } from './helpers.js';
import { BUDGET_STATUS } from './clinicalBudgetConstants.js';

export const BUDGET_LOCK_ERROR = 'Registro bloqueado por contrato gerado.';

const CONTRACT_ACTIVE_STATUSES = new Set([
  CONTRACT_STATUS.GENERATED,
  CONTRACT_STATUS.SENT,
  CONTRACT_STATUS.VIEWED,
  CONTRACT_STATUS.SIGNED,
  CONTRACT_STATUS.DRAFT,
]);

function hasLinkedReceivables(db, patientId, appointmentId, budgetId) {
  if (!patientId) return false;
  const originIds = new Set([appointmentId, budgetId].filter(Boolean).map(String));
  return (db.accountsReceivable || []).some(
    (r) => r.patient_id === patientId && originIds.has(String(r.origin_id || '')),
  );
}

function getBudgetInline(appointmentId) {
  const db = loadDb();
  return (db.clinicalAppointments || []).find((c) => c.appointmentId === appointmentId)?.budget || null;
}

function pushClinicalEvent(db, appointmentId, type, data, userId) {
  if (!db.clinicalEvents) db.clinicalEvents = [];
  db.clinicalEvents.push({
    id: createId('event'),
    appointmentId,
    type,
    data,
    userId,
    timestamp: new Date().toISOString(),
  });
}

export function getBudgetLockContext(appointmentId) {
  const budget = getBudgetInline(appointmentId);
  const contract = getContractStatusForQuote(appointmentId, 'clinical_budget', budget?.id || null);
  const db = loadDb();
  const clinical = (db.clinicalAppointments || []).find((c) => c.appointmentId === appointmentId);
  const patientId = clinical?.patientId || null;

  const contractStatus = contract?.status || null;
  const hasActiveContract = Boolean(contract && CONTRACT_ACTIVE_STATUSES.has(contractStatus));
  const contractSigned = contractStatus === CONTRACT_STATUS.SIGNED
    || hasSignedContractForQuote(appointmentId, 'clinical_budget', budget?.id || null);
  const hasFinancing = Boolean(budget?.financingId);
  const hasReceivables = hasLinkedReceivables(db, patientId, appointmentId, budget?.id);

  const isHistorical = budget?.status === BUDGET_STATUS.HISTORICO;
  const isContractGeneratedStatus = budget?.status === BUDGET_STATUS.CONTRATO_GERADO;
  const isApprovedWithLock = budget?.status === BUDGET_STATUS.APROVADO
    && (hasActiveContract || contractSigned || hasFinancing || hasReceivables);

  const isLocked = Boolean(
    budget && (
      isHistorical
      || isContractGeneratedStatus
      || budget.status === BUDGET_STATUS.CANCELADO
      || isApprovedWithLock
      || contractSigned
    ),
  );

  return {
    isLocked,
    budget,
    contract,
    contractSigned,
    contractCanceled: contractStatus === CONTRACT_STATUS.CANCELED,
    hasFinancing,
    hasReceivables,
    hasActiveContract,
    lockMessage: isLocked
      ? 'Este orçamento está bloqueado porque já possui contrato gerado. Para alterar condições ou procedimentos, crie um novo orçamento.'
      : null,
  };
}

export function isBudgetEditable(appointmentId) {
  return !getBudgetLockContext(appointmentId).isLocked;
}

function isDocumentsOnlyUpdate(existing, next) {
  if (!existing || !next) return false;
  const strip = (b) => {
    const clone = { ...b };
    delete clone.documents;
    delete clone.updatedAt;
    delete clone.updatedBy;
    return JSON.stringify(clone);
  };
  return strip(existing) === strip(next);
}

export function assertBudgetEditable(appointmentId, nextBudget, options = {}) {
  if (options.skipLockCheck) return;
  const ctx = getBudgetLockContext(appointmentId);
  if (!ctx.isLocked) return;
  if (options.allowDocumentsOnly && isDocumentsOnlyUpdate(ctx.budget, nextBudget)) return;
  throw new Error(BUDGET_LOCK_ERROR);
}

export function assertBudgetStatusChangeAllowed(appointmentId) {
  const ctx = getBudgetLockContext(appointmentId);
  if (ctx.isLocked) throw new Error(BUDGET_LOCK_ERROR);
}

function nextBudgetDisplayNumber(clinical) {
  const historyLen = (clinical?.budgetHistory || []).length;
  const seq = historyLen + 1;
  return `ORC-${String(seq).padStart(3, '0')}`;
}

function mapBudgetProcedureToPlanned(proc, appointment) {
  return {
    id: createId('planned'),
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
    professionalId: proc.professionalId || appointment?.professionalId || null,
  };
}

function mapPlannedToBudgetProcedure(proc, appointment) {
  return {
    id: createId('proc'),
    procedureId: proc.procedureId,
    code: proc.code,
    category: proc.category,
    name: proc.name,
    tooth: proc.tooth || '',
    region: proc.region || '',
    regionType: proc.regionType,
    quantity: Number(proc.quantity || 1),
    unitValue: Number(proc.unitValue || 0),
    discount: Number(proc.discount || 0),
    discountType: proc.discountType,
    discountRaw: Number(proc.discount || 0),
    totalValue: Number(proc.totalValue ?? 0),
    observations: proc.notes || '',
    stage: proc.stage || 'inicial',
    professionalId: proc.professionalId || appointment?.professionalId || null,
  };
}

function getLatestArchivedBudget(clinical) {
  const history = clinical?.budgetHistory || [];
  if (!history.length) return null;
  return [...history].sort(
    (a, b) => new Date(b.archivedAt || b.createdAt || 0) - new Date(a.archivedAt || a.createdAt || 0),
  )[0];
}

function detachContractsFromArchivedBudget(db, appointmentId, archivedBudgetId) {
  for (let i = 0; i < (db.generatedContracts || []).length; i += 1) {
    const contract = db.generatedContracts[i];
    if (contract.quoteId !== appointmentId || contract.quoteSource !== 'clinical_budget') continue;
    if (contract.budgetId && contract.budgetId !== archivedBudgetId) continue;

    const keepStatus = [CONTRACT_STATUS.SIGNED, CONTRACT_STATUS.CANCELED].includes(contract.status);
    db.generatedContracts[i] = {
      ...contract,
      budgetId: archivedBudgetId,
      ...(!keepStatus && contract.status !== CONTRACT_STATUS.REPLACED
        ? {
          status: CONTRACT_STATUS.REPLACED,
          replacedAt: new Date().toISOString(),
          replacedReason: 'new_budget_created',
        }
        : {}),
    };
  }
}

function buildEmptyBudget(clinical, displayNumber, parentBudgetId, user) {
  return {
    id: createId('budget'),
    budgetNumber: displayNumber,
    parentBudgetId: parentBudgetId || null,
    status: BUDGET_STATUS.RASCUNHO,
    planName: '',
    procedures: [],
    commercialNotes: '',
    paymentOptions: DEFAULT_PAYMENT_OPTIONS().map((o) => ({ ...o, total: 0, accepted: false })),
    discount: 0,
    interest: 0,
    totalValue: 0,
    validityDate: '',
    professionalId: clinical.professionalId || null,
    financingId: null,
    documents: [],
    createdAt: new Date().toISOString(),
    createdBy: user?.id || null,
    updatedAt: new Date().toISOString(),
    updatedBy: user?.id || null,
  };
}

export function markBudgetContractGenerated(user, appointmentId) {
  return withDb((db) => {
    const idx = (db.clinicalAppointments || []).findIndex((c) => c.appointmentId === appointmentId);
    if (idx < 0 || !db.clinicalAppointments[idx].budget) return db;
    db.clinicalAppointments[idx].budget = {
      ...db.clinicalAppointments[idx].budget,
      status: BUDGET_STATUS.CONTRATO_GERADO,
      contractGeneratedAt: new Date().toISOString(),
      contractGeneratedBy: user?.id || null,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.id || null,
    };
    pushClinicalEvent(db, appointmentId, 'budget_contract_generated', {
      budgetId: db.clinicalAppointments[idx].budget.id,
    }, user?.id);
    return db;
  });
}

export function createNewBudgetForAppointment(user, appointmentId) {
  return withDb((db) => {
    const idx = (db.clinicalAppointments || []).findIndex((c) => c.appointmentId === appointmentId);
    if (idx < 0) throw new Error('Atendimento não encontrado.');

    const clinical = { ...db.clinicalAppointments[idx] };
    const current = clinical.budget;
    let archivedBudgetId = null;

    if (current) {
      archivedBudgetId = current.id;
      clinical.budgetHistory = [
        ...(clinical.budgetHistory || []),
        {
          ...current,
          status: BUDGET_STATUS.HISTORICO,
          archivedAt: new Date().toISOString(),
          archivedBy: user?.id || null,
          archivedByName: user?.name || user?.nome || null,
        },
      ];
    }

    if (archivedBudgetId) {
      detachContractsFromArchivedBudget(db, appointmentId, archivedBudgetId);
    }

    clinical.plannedProcedures = [];
    const displayNumber = nextBudgetDisplayNumber(clinical);
    clinical.budget = buildEmptyBudget(clinical, displayNumber, archivedBudgetId, user);
    clinical.planName = '';

    db.clinicalAppointments[idx] = {
      ...clinical,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.id || null,
    };

    pushClinicalEvent(db, appointmentId, 'budget_new_version_created', {
      budgetId: clinical.budget.id,
      budgetNumber: displayNumber,
      importedFrom: archivedBudgetId,
      importProcedures: false,
      planningCleared: true,
    }, user?.id);

    return clinical.budget;
  });
}

export function getPreviousBudgetImportContext(appointmentId) {
  const db = loadDb();
  const clinical = (db.clinicalAppointments || []).find((c) => c.appointmentId === appointmentId);
  const previous = getLatestArchivedBudget(clinical);
  if (!previous) {
    return { hasPrevious: false, canImport: false, procedureCount: 0, budgetNumber: null };
  }

  const procedureCount = previous.procedures?.length || 0;
  const plannedCount = clinical?.plannedProcedures?.length || 0;

  return {
    hasPrevious: true,
    budgetNumber: previous.budgetNumber || previous.id,
    procedureCount,
    canImport: procedureCount > 0 && plannedCount === 0 && isBudgetEditable(appointmentId),
    previousBudgetId: previous.id,
  };
}

export function importProceduresFromPreviousBudget(user, appointmentId) {
  return withDb((db) => {
    const idx = (db.clinicalAppointments || []).findIndex((c) => c.appointmentId === appointmentId);
    if (idx < 0) throw new Error('Atendimento não encontrado.');

    const clinical = { ...db.clinicalAppointments[idx] };
    const ctx = getPreviousBudgetImportContext(appointmentId);
    if (!ctx.hasPrevious) throw new Error('Nenhum orçamento anterior encontrado.');
    if (!ctx.canImport) {
      throw new Error('Não é possível importar procedimentos neste momento.');
    }

    const previous = getLatestArchivedBudget(clinical);
    const planned = (previous.procedures || []).map((proc) => mapBudgetProcedureToPlanned(proc, clinical));
    const budgetProcedures = planned.map((proc) => mapPlannedToBudgetProcedure(proc, clinical));
    const original = calcPlannedValue(budgetProcedures);

    clinical.plannedProcedures = planned;

    if (clinical.budget) {
      clinical.budget = {
        ...clinical.budget,
        procedures: budgetProcedures,
        planName: previous.planName || '',
        paymentOptions: DEFAULT_PAYMENT_OPTIONS().map((o) => ({ ...o, total: original, accepted: false })),
        discount: 0,
        interest: 0,
        totalValue: original,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.id || null,
      };
    }

    db.clinicalAppointments[idx] = {
      ...clinical,
      planName: previous.planName || clinical.planName || '',
      updatedAt: new Date().toISOString(),
      updatedBy: user?.id || null,
    };

    pushClinicalEvent(db, appointmentId, 'budget_procedures_imported', {
      fromBudgetId: previous.id,
      fromBudgetNumber: previous.budgetNumber || previous.id,
      procedureCount: planned.length,
    }, user?.id);

    return {
      procedureCount: planned.length,
      budgetNumber: previous.budgetNumber || previous.id,
    };
  });
}

export function listPatientBudgetHistory(patientId) {
  if (!patientId) return [];
  const db = loadDb();
  const rows = [];

  for (const ca of db.clinicalAppointments || []) {
    if (ca.patientId !== patientId) continue;
    for (const archived of ca.budgetHistory || []) {
      const archivedContract = (db.generatedContracts || []).find(
        (c) => c.budgetId === archived.id && c.quoteSource === 'clinical_budget',
      );
      rows.push({
        id: archived.id,
        appointmentId: ca.appointmentId,
        budgetNumber: archived.budgetNumber || archived.id,
        status: archived.status || BUDGET_STATUS.HISTORICO,
        totalValue: archived.totalValue,
        createdAt: archived.createdAt,
        archivedAt: archived.archivedAt,
        contractId: archivedContract?.id || null,
        contractStatus: archivedContract?.status || null,
        isHistorical: true,
      });
    }
    if (ca.budget) {
      const contract = getContractStatusForQuote(ca.appointmentId, 'clinical_budget', ca.budget.id);
      rows.push({
        id: ca.budget.id,
        appointmentId: ca.appointmentId,
        budgetNumber: ca.budget.budgetNumber || ca.budget.id,
        status: ca.budget.status,
        totalValue: ca.budget.totalValue,
        createdAt: ca.budget.createdAt,
        archivedAt: null,
        contractId: contract?.id || null,
        contractStatus: contract?.status || null,
        isHistorical: ca.budget.status === BUDGET_STATUS.HISTORICO,
      });
    }
  }

  return rows.sort(
    (a, b) => new Date(b.archivedAt || b.createdAt || 0) - new Date(a.archivedAt || a.createdAt || 0),
  );
}
