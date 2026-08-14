/**
 * Wrapper clínico da finalização jurídica.
 * Writer oficial: finalizeGeneratedContract (draft → generated).
 * Não cria contrato, não congela manifest, não envia comunicação.
 */
import { can } from '../../../permissions/permissions.js';
import { CONTRACT_STATUS } from '../../../contracts/contractConstants.js';
import {
  isClinicalContractLegallyFinalized,
  isPackageManifestFrozen,
} from '../../../contracts/clinicalSignatureReadiness.js';
import { loadContractForEdit } from '../../../contracts/contractEditContext.js';
import { finalizeGeneratedContract } from '../../../services/contractModuleService.js';
import { getGeneratedContract } from '../../../services/contractService.js';

export function canFinalizeClinicalContract(user) {
  if (!user) return false;
  return can(user, 'admin_contratos:generate')
    || can(user, 'prontuario_contratos:create')
    || user?.isMaster === true
    || user?.role === 'master'
    || user?.role === 'admin';
}

export function canShowFinalizeClinicalContractCta(contract) {
  if (!contract?.id) return false;
  if (isClinicalContractLegallyFinalized(contract)) return false;
  return String(contract.status || '').toLowerCase() === CONTRACT_STATUS.DRAFT;
}

export function finalizeClinicalContractDraft(user, {
  contractId,
  appointmentId,
  budgetId = null,
  patientId = null,
} = {}) {
  if (!canFinalizeClinicalContract(user)) {
    return { ok: false, error: 'Sem permissão para finalizar o contrato.' };
  }
  if (!contractId || !appointmentId) {
    return { ok: false, error: 'Contrato ativo deste atendimento não encontrado.' };
  }

  let contract;
  try {
    contract = loadContractForEdit({
      contractId,
      patientId,
      appointmentId,
      budgetId,
      tenantId: user?.tenantId || user?.tenant_id || null,
    });
  } catch (error) {
    return { ok: false, error: error.message || 'Contrato não corresponde a este atendimento.' };
  }

  if (String(contract.status || '').toLowerCase() !== CONTRACT_STATUS.DRAFT) {
    return { ok: false, error: 'Somente contratos em edição podem ser finalizados.' };
  }

  const beforeManifest = isPackageManifestFrozen(contract);
  const beforeNumber = contract.contractNumber;
  const beforeId = contract.id;

  try {
    const finalized = finalizeGeneratedContract(user, contract.id);
    if (!finalized?.id || finalized.id !== beforeId) {
      return { ok: false, error: 'A finalização não pode criar outro contrato.' };
    }
    if (finalized.contractNumber !== beforeNumber) {
      return { ok: false, error: 'A finalização não pode renumerar o contrato.' };
    }
    if (!isClinicalContractLegallyFinalized(finalized)) {
      return { ok: false, error: 'Contrato não ficou juridicamente finalizado.' };
    }
    const persisted = getGeneratedContract(beforeId);
    return {
      ok: true,
      contract: finalized,
      sameContractId: persisted?.id === beforeId,
      manifestFrozenChanged: isPackageManifestFrozen(persisted) !== beforeManifest,
    };
  } catch (error) {
    return { ok: false, error: error.message || 'Não foi possível finalizar o contrato.' };
  }
}
