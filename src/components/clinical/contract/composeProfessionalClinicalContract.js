import { loadDb } from '../../../db/index.js';
import { getPatient } from '../../../services/patientService.js';
import { getBudget, BUDGET_STATUS } from '../../../services/clinicalService.js';
import { getCollaborator } from '../../../services/collaboratorService.js';
import { getAcceptedOption, resolveBudgetFinancials } from '../budget/budgetUtils.js';
import { buildProfessionalContractContext, getClinicForumCityFromDb } from './buildProfessionalContractContext.js';
import { buildProfessionalContractHtml } from './professionalContractTemplate.js';
import { getContractReadinessChecklist } from '../../../services/contractValidationService.js';
import { CLINIC_FORUM_VALIDATION_MESSAGE } from './professionalContractClauses.js';

export { getContractReadinessChecklist };

function resolveProfessionalForAppointment(appointment) {
  const professionalId = appointment?.professionalId;
  if (!professionalId) return null;
  const collab = getCollaborator(professionalId);
  if (collab) return collab;
  const db = loadDb();
  return (db.users || []).find((u) => u.id === professionalId) || null;
}

/**
 * Valida pré-requisitos obrigatórios para geração de contrato clínico.
 */
export function assertClinicalContractReady({ budget, financials, db }) {
  if (!budget) {
    throw new Error('Orçamento não encontrado. Elabore e aprove o orçamento antes de gerar o contrato.');
  }
  if (budget.status !== BUDGET_STATUS.APROVADO) {
    throw new Error('Orçamento não aprovado. Aprove o orçamento antes de gerar o contrato.');
  }
  const accepted = financials?.accepted ?? getAcceptedOption(budget);
  if (!accepted) {
    throw new Error('Condição financeira não escolhida. Selecione a forma de pagamento antes de gerar o contrato.');
  }
  if (!(budget.procedures || []).length) {
    throw new Error('Orçamento sem procedimentos aprovados. Inclua procedimentos antes de gerar o contrato.');
  }
  if (db && !getClinicForumCityFromDb(db).clinicForumCity) {
    throw new Error(CLINIC_FORUM_VALIDATION_MESSAGE);
  }
}

/**
 * Monta contexto completo do contrato profissional clínico.
 */
export function buildClinicalProfessionalContractContext({
  quoteId,
  patientId,
  contractNumber,
  contractStatus,
  skipValidation = false,
}) {
  const db = loadDb();
  const patientBundle = getPatient(patientId);
  const budget = getBudget(quoteId)
    || (db.clinicalAppointments || []).find((c) => c.appointmentId === quoteId)?.budget
    || null;
  const appointment = (db.clinicalAppointments || []).find((c) => c.appointmentId === quoteId) || null;
  const professional = resolveProfessionalForAppointment(appointment);
  const financials = resolveBudgetFinancials(budget || { procedures: [] });

  if (!skipValidation) {
    assertClinicalContractReady({ budget, financials, db });
  }

  return buildProfessionalContractContext({
    db,
    patientBundle,
    professional,
    appointment,
    budget,
    financials,
    contractNumber,
    contractStatus,
  });
}

/**
 * HTML completo do contrato profissional (sem hashtags).
 */
export function composeProfessionalClinicalContractHtml(params = {}) {
  const context = buildClinicalProfessionalContractContext(params);
  return buildProfessionalContractHtml(context);
}

export { buildProfessionalContractHtml } from './professionalContractTemplate.js';
export { buildProfessionalContractContext } from './buildProfessionalContractContext.js';
