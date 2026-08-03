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
import {
  isContractLinkedToBudget,
  isBudgetLocked,
  getBudgetLockMessage,
  hasRealReceivableLinkedToBudget,
  hasRealFinancingLinkedToBudget,
} from '../components/clinical/budget/budgetEditAccessUtils.js';
import { formatFriendlyBudgetNumber } from '../utils/friendlyNumbers.js';

export const BUDGET_LOCK_ERROR = 'Registro bloqueado por contrato gerado.';

const CONTRACT_ACTIVE_STATUSES = new Set([
  CONTRACT_STATUS.GENERATED,
  CONTRACT_STATUS.SENT,
  CONTRACT_STATUS.VIEWED,
  CONTRACT_STATUS.SIGNED,
  CONTRACT_STATUS.DRAFT,
]);

function hasLinkedReceivables(_db, _patientId, _appointmentId, budgetId) {
  return hasRealReceivableLinkedToBudget(budgetId);
}

function resolveClinicalPatientId(ca, db) {
  if (ca?.patientId) return ca.patientId;
  const apt = (db.appointments || []).find((a) => a.id === ca.appointmentId);
  return apt?.patientId || null;
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

function buildBudgetLockContext(appointmentId, budget, patientId) {
  const contract = getContractStatusForQuote(
    appointmentId,
    'clinical_budget',
    budget?.id || null,
    patientId,
  );
  const db = loadDb();

  const contractStatus = contract?.status || null;
  const contractApplies = isContractLinkedToBudget(contract, budget);
  const hasActiveContract = Boolean(
    contractApplies && contract && CONTRACT_ACTIVE_STATUSES.has(contractStatus),
  );
  const contractSigned = Boolean(
    contractApplies && (
      contractStatus === CONTRACT_STATUS.SIGNED
      || hasSignedContractForQuote(appointmentId, 'clinical_budget', budget?.id || null)
    ),
  );
  const contractCanceled = Boolean(
    contractApplies && contractStatus === CONTRACT_STATUS.CANCELED,
  );
  const hasFinancing = hasRealFinancingLinkedToBudget(budget?.id);
  const hasReceivables = hasLinkedReceivables(db, patientId, appointmentId, budget?.id);

  const lockCtx = {
    patientId,
    contract,
    contractApplies,
    hasActiveContract,
    contractSigned,
    contractCanceled,
    hasFinancing,
    hasReceivables,
  };

  const isLocked = Boolean(budget && isBudgetLocked(budget, lockCtx));
  const lockMessage = isLocked ? getBudgetLockMessage(budget, lockCtx) : null;

  return {
    isLocked,
    budget,
    contract,
    contractApplies,
    contractSigned,
    contractCanceled,
    hasFinancing,
    hasReceivables,
    hasActiveContract,
    lockMessage,
  };
}

export function getBudgetLockContext(appointmentId) {
  const db = loadDb();
  const clinical = (db.clinicalAppointments || []).find((c) => c.appointmentId === appointmentId);
  const budget = clinical?.budget || null;
  const patientId = clinical ? resolveClinicalPatientId(clinical, db) : null;
  return buildBudgetLockContext(appointmentId, budget, patientId);
}

export function getBudgetLockContextForBudget(appointmentId, budget) {
  const db = loadDb();
  const clinical = (db.clinicalAppointments || []).find((c) => c.appointmentId === appointmentId);
  const patientId = clinical ? resolveClinicalPatientId(clinical, db) : null;
  return buildBudgetLockContext(appointmentId, budget, patientId);
}

export function isBudgetEditable(appointmentId) {
  return !getBudgetLockContext(appointmentId).isLocked;
}

export { isBudgetLocked } from '../components/clinical/budget/budgetEditAccessUtils.js';

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
  const ctx = getBudgetLockContextForBudget(appointmentId, nextBudget);
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

    if (!contract.budgetId) {
      db.generatedContracts[i] = {
        ...contract,
        budgetId: archivedBudgetId,
      };
    }
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
    financialId: null,
    contractId: null,
    generatedContractId: null,
    generatedContract: null,
    financeGenerated: false,
    contractStatus: null,
    lockReason: null,
    accountsReceivable: null,
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
  const patientId = clinical?.patientId || null;
  const friendlyNumber = patientId
    ? listPatientBudgetHistory(patientId).find((b) => b.id === previous.id)?.budgetNumber
    : null;

  return {
    hasPrevious: true,
    budgetNumber: friendlyNumber || formatFriendlyBudgetNumber(previous.budgetNumber, 1),
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
      fromBudgetNumber: ctx.budgetNumber,
      procedureCount: planned.length,
    }, user?.id);

    return {
      procedureCount: planned.length,
      budgetNumber: ctx.budgetNumber,
    };
  });
}

export function listPatientBudgetHistory(patientId) {
  if (!patientId) return [];
  const db = loadDb();
  const rows = [];

  for (const ca of db.clinicalAppointments || []) {
    const clinicalPatientId = resolveClinicalPatientId(ca, db);
    if (clinicalPatientId !== patientId) continue;
    for (const archived of ca.budgetHistory || []) {
      const archivedContract = getContractStatusForQuote(
        ca.appointmentId,
        'clinical_budget',
        archived.id,
        patientId,
      );
      rows.push({
        id: archived.id,
        appointmentId: ca.appointmentId,
        budgetNumber: archived.budgetNumber,
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
      const contract = getContractStatusForQuote(
        ca.appointmentId,
        'clinical_budget',
        ca.budget.id,
        patientId,
      );
      rows.push({
        id: ca.budget.id,
        appointmentId: ca.appointmentId,
        budgetNumber: ca.budget.budgetNumber,
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

  const chronological = [...rows].sort(
    (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0),
  );
  const numbered = chronological.map((row, index) => ({
    ...row,
    budgetNumber: formatFriendlyBudgetNumber(row.budgetNumber, index + 1),
  }));

  return numbered.sort(
    (a, b) => new Date(b.archivedAt || b.createdAt || 0) - new Date(a.archivedAt || a.createdAt || 0),
  );
}
