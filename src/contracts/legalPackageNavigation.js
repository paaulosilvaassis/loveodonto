/**
 * Navegação da jornada jurídica única — telas reais, sem *-v2.
 */

import {
  buildClinicalAppointmentUrl,
  openExistingBudget,
  openExistingContract,
} from '../services/budgetNavigationService.js';

export function buildLegalPackageAppointmentUrl({
  appointmentId,
  budgetId = null,
  contractId = null,
} = {}) {
  return buildClinicalAppointmentUrl({
    appointmentId,
    budgetId,
    contractId,
    section: 'contratos',
  });
}

export function buildProntuarioLegalPackagesUrl(patientId) {
  if (!patientId) return '/pacientes';
  return `/prontuario/${patientId}?tab=contratos`;
}

export function openLegalPackage(navigate, {
  appointmentId,
  budgetId = null,
  patientId = null,
  contractId = null,
} = {}) {
  if (contractId) {
    return openExistingContract(navigate, {
      contractId,
      budgetId,
      patientId,
      appointmentId,
    });
  }
  return openExistingBudget(navigate, {
    budgetId,
    patientId,
    appointmentId,
    section: 'contratos',
  });
}

export function openProntuarioLegalPackages(navigate, patientId) {
  navigate(buildProntuarioLegalPackagesUrl(patientId));
}
