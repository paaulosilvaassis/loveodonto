import { withDb } from '../db/index.js';
import {
  BUDGET_STATUS,
  getClinicalData,
  logClinicalEvent,
} from './clinicalService.js';
import {
  getContractStatusForQuote,
  hasSignedContractForQuote,
} from './contractModuleService.js';
import { getBudgetLockContext, BUDGET_LOCK_ERROR } from './clinicalBudgetLockService.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  calcItemDiscount,
  calcItemTotal,
} from '../components/clinical/planning/planningUtils.js';

function mapPlannedToBudgetProcedure(proc, appointment) {
  return {
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
    discount: calcItemDiscount(proc),
    discountType: proc.discountType,
    discountRaw: Number(proc.discount || 0),
    totalValue: calcItemTotal(proc),
    observations: proc.notes || '',
    stage: proc.stage || 'inicial',
    professionalId: proc.professionalId || appointment?.professionalId,
  };
}

function resetPaymentAcceptance(paymentOptions = []) {
  return paymentOptions.map((opt) => ({
    ...opt,
    accepted: false,
    presentationStatus: opt.presentationStatus === 'escolhida' ? 'apresentada' : opt.presentationStatus,
  }));
}

function invalidateUnsignedContracts(db, appointmentId) {
  const arr = db.generatedContracts || [];
  for (let i = 0; i < arr.length; i += 1) {
    const c = arr[i];
    if (c.quoteId !== appointmentId || c.quoteSource !== 'clinical_budget') continue;
    if ([CONTRACT_STATUS.SIGNED, CONTRACT_STATUS.CANCELED, CONTRACT_STATUS.REPLACED].includes(c.status)) {
      continue;
    }
    arr[i] = {
      ...c,
      status: CONTRACT_STATUS.DRAFT,
      renderedHtml: null,
      needsRegeneration: true,
      updatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Contexto para UI de remoção de procedimento do planejamento.
 */
export function getPlanningRemoveContext(appointmentId, plannedId) {
  const clinicalData = getClinicalData(appointmentId);
  const planned = (clinicalData?.plannedProcedures || []).find((p) => p.id === plannedId);
  const budget = clinicalData?.budget || null;
  const contract = getContractStatusForQuote(appointmentId, 'clinical_budget');
  const hasSignedContract = hasSignedContractForQuote(appointmentId, 'clinical_budget');
  const hasApprovedBudget = budget?.status === BUDGET_STATUS.APROVADO;
  const lockCtx = getBudgetLockContext(appointmentId);

  return {
    procedure: planned || null,
    hasSignedContract,
    hasApprovedBudget,
    isBudgetLocked: lockCtx.isLocked,
    budget,
    contract,
  };
}

/**
 * Remove procedimento do planejamento e sincroniza orçamento/contrato vinculados.
 */
export function removePlannedProcedureWithSync(user, appointmentId, plannedId) {
  const preview = getPlanningRemoveContext(appointmentId, plannedId);

  if (!preview.procedure) {
    throw new Error('Item do planejamento não encontrado.');
  }
  if (preview.hasSignedContract) {
    throw new Error('Não é possível remover procedimentos de um contrato já assinado.');
  }
  if (preview.isBudgetLocked) {
    throw new Error(BUDGET_LOCK_ERROR);
  }

  const procedureName = preview.procedure.name || 'Procedimento';
  const wasApproved = preview.hasApprovedBudget;

  withDb((db) => {
    const idx = db.clinicalAppointments.findIndex((ca) => ca.appointmentId === appointmentId);
    if (idx < 0) throw new Error('Atendimento não encontrado');

    const appointment = db.clinicalAppointments[idx];
    const list = appointment.plannedProcedures || [];
    const itemIndex = list.findIndex((p) => p.id === plannedId);
    if (itemIndex < 0) throw new Error('Item do planejamento não encontrado');

    const nextPlanned = list.filter((p) => p.id !== plannedId);
    db.clinicalAppointments[idx].plannedProcedures = nextPlanned;
    db.clinicalAppointments[idx].updatedAt = new Date().toISOString();
    db.clinicalAppointments[idx].updatedBy = user.id;

    const budget = appointment.budget;
    if (budget) {
      const procedures = nextPlanned.map((proc) => mapPlannedToBudgetProcedure(proc, appointment));
      const totalValue = procedures.reduce(
        (sum, proc) => sum + Number(proc.quantity || 1) * Number(proc.unitValue || 0),
        0,
      );
      const discount = nextPlanned.reduce((sum, proc) => sum + calcItemDiscount(proc), 0);

      db.clinicalAppointments[idx].budget = {
        ...budget,
        procedures,
        totalValue,
        discount,
        paymentOptions: wasApproved ? resetPaymentAcceptance(budget.paymentOptions) : budget.paymentOptions,
        status: wasApproved ? BUDGET_STATUS.NEGOCIACAO : budget.status,
        approvedAt: wasApproved ? null : budget.approvedAt,
        updatedAt: new Date().toISOString(),
        updatedBy: user.id,
        planningSyncedAt: new Date().toISOString(),
      };
    }

    invalidateUnsignedContracts(db, appointmentId);
    return db;
  });

  logClinicalEvent(
    appointmentId,
    'planning_procedure_removed',
    {
      plannedId,
      procedureName,
      budgetRecalculated: Boolean(preview.budget),
      wasApprovedBudget: wasApproved,
    },
    user.id,
  );

  return { procedureName, wasApprovedBudget: wasApproved };
}
