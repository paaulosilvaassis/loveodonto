import { loadDb } from '../../../db/index.js';
import { getPatient } from '../../../services/patientService.js';
import { getCollaborator } from '../../../services/collaboratorService.js';
import { getAcceptedOption, resolveBudgetFinancials } from '../budget/budgetUtils.js';
import { buildProfessionalContractContext, getClinicForumCityFromDb } from './buildProfessionalContractContext.js';
import { buildProfessionalContractHtml } from './professionalContractTemplate.js';
import { getContractReadinessChecklist } from '../../../services/contractValidationService.js';
import { CLINIC_FORUM_VALIDATION_MESSAGE } from './professionalContractClauses.js';
import { findBudgetRecord, getActiveClinicalBudget } from '../../../services/budgetNavigationService.js';
import { isBudgetApprovedStatus, isHistoricalApprovedBudget } from './contractAccessUtils.js';

export { getContractReadinessChecklist };

function resolveProfessionalForAppointment(appointment) {
  const professionalId = appointment?.professionalId;
  if (!professionalId) return null;
  const collab = getCollaborator(professionalId);
  if (collab) return collab;
  const db = loadDb();
  return (db.users || []).find((u) => u.id === professionalId) || null;
}

export function resolveClinicalBudgetForContract({ appointmentId, budgetId = null } = {}) {
  if (budgetId) {
    const record = findBudgetRecord({ budgetId, appointmentId });
    if (record?.budget) return record.budget;
  }
  return getActiveClinicalBudget(appointmentId) || null;
}

/**
 * Valida pré-requisitos obrigatórios para geração de contrato clínico.
 * APROVADO e CONTRATO_GERADO são o mesmo ciclo comercial (SSOT de acesso).
 */
export function assertClinicalContractReady({ budget, financials, db }) {
  if (!budget) {
    throw new Error('Orçamento não encontrado. Elabore e aprove o orçamento antes de gerar o contrato.');
  }
  if (!isBudgetApprovedStatus(budget.status) && !isHistoricalApprovedBudget(budget)) {
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
  budgetId = null,
  skipValidation = false,
}) {
  const db = loadDb();
  const patientBundle = getPatient(patientId);
  const budget = resolveClinicalBudgetForContract({ appointmentId: quoteId, budgetId })
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
