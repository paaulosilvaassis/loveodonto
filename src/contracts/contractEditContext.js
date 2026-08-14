/**
 * Contexto de edição de contrato clínico existente.
 * Fail-closed: não abre editor se o contrato não pertencer ao tenant/paciente/atendimento/orçamento.
 */

import { loadDb } from '../db/index.js';
import { getGeneratedContract } from '../services/contractService.js';
import { CONTRACT_STATUS } from './contractConstants.js';

const INACTIVE_FOR_CREATE = new Set([
  CONTRACT_STATUS.CANCELED,
  CONTRACT_STATUS.REPLACED,
  CONTRACT_STATUS.REFUSED,
]);

export function currentClinicId() {
  return loadDb().clinicProfile?.id || 'clinic-1';
}

export function isActiveClinicalContract(contract) {
  if (!contract) return false;
  return !INACTIVE_FOR_CREATE.has(contract.status);
}

export function assertContractEditContext(contract, expected = {}) {
  if (!contract) {
    return { ok: false, error: 'Contrato não encontrado.' };
  }

  const {
    patientId = null,
    appointmentId = null,
    budgetId = null,
    tenantId = null,
    clinicId = currentClinicId(),
  } = expected;

  if (clinicId && contract.clinicId && contract.clinicId !== clinicId) {
    return { ok: false, error: 'Contrato não pertence a esta clínica.' };
  }
  if (tenantId && contract.tenant_id && contract.tenant_id !== tenantId) {
    return { ok: false, error: 'Contrato não pertence a este tenant.' };
  }
  if (patientId && contract.patientId && contract.patientId !== patientId) {
    return { ok: false, error: 'Contrato não pertence a este paciente.' };
  }
  if (appointmentId && contract.quoteId && contract.quoteId !== appointmentId) {
    return { ok: false, error: 'Contrato não pertence a este atendimento.' };
  }
  if (budgetId && contract.budgetId && contract.budgetId !== budgetId) {
    return { ok: false, error: 'Contrato não pertence a este orçamento.' };
  }

  return { ok: true, contract };
}

export function loadContractForEdit({
  contractId,
  patientId = null,
  appointmentId = null,
  budgetId = null,
  tenantId = null,
  clinicId = currentClinicId(),
} = {}) {
  if (!contractId) {
    throw new Error('contractId obrigatório para editar o contrato.');
  }
  const contract = getGeneratedContract(contractId);
  const check = assertContractEditContext(contract, {
    patientId,
    appointmentId,
    budgetId,
    tenantId,
    clinicId,
  });
  if (!check.ok) throw new Error(check.error);
  return contract;
}

export function resolveStoredContractHtml(contract) {
  if (!contract) return '';
  return String(
    contract.finalContent
    || contract.editedHtml
    || contract.renderedHtml
    || '',
  );
}
