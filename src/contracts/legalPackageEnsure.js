/**
 * Geração idempotente do pacote jurídico para um orçamento.
 * Reutiliza contrato/TCLE/LGPD existentes — não cria segunda cerimônia.
 */

import { createContractDraft, getContractStatusForQuote } from '../services/contractModuleService.js';
import { listContractTemplates, ensureContractsSeeded } from '../services/contractService.js';
import { ensureContractsModuleSeeded } from '../services/contractModuleService.js';
import { attachEligibleTcleToTreatmentPackage } from '../services/tclePackageAttachmentService.js';
import { markBudgetContractGenerated } from '../services/clinicalBudgetLockService.js';
import { validateBudgetContractGeneration } from '../services/operationalContractWizardService.js';
import { buildContractPackageViewModel } from './legalPackageViewModel.js';
import { resolveLegalPackagePermissions } from './legalPackagePermissions.js';
import { CONTRACT_STATUS } from './contractConstants.js';

function findDefaultTemplateId() {
  ensureContractsSeeded();
  const templates = listContractTemplates();
  return templates.find((t) => t.type === 'system_default')?.id
    || templates[0]?.id
    || null;
}

function activeContract(appointmentId, budgetId, patientId) {
  const existing = getContractStatusForQuote(appointmentId, 'clinical_budget', budgetId, patientId);
  if (!existing) return null;
  const status = String(existing.status || '').toLowerCase();
  if ([CONTRACT_STATUS.CANCELED, CONTRACT_STATUS.REPLACED, CONTRACT_STATUS.REFUSED].includes(status)) {
    return null;
  }
  return existing;
}

function attachTcleBestEffort({ user, patientId, appointmentId, budgetId }) {
  try {
    return attachEligibleTcleToTreatmentPackage({
      user,
      patientId,
      appointmentId,
      budgetId,
    });
  } catch {
    return { ok: false, attached: false, duplicate: false };
  }
}

/**
 * @returns {{
 *   ok: boolean,
 *   reused: boolean,
 *   duplicated: false,
 *   package: object|null,
 *   contractId: string|null,
 *   error?: string,
 * }}
 */
export function ensureLegalPackageForBudget({
  user,
  patientId,
  appointmentId,
  budgetId,
} = {}) {
  const perms = resolveLegalPackagePermissions(user);
  if (!perms.canGenerate) {
    return {
      ok: false,
      reused: false,
      duplicated: false,
      package: null,
      contractId: null,
      error: 'Permissão insuficiente para gerar documentos.',
    };
  }
  if (!patientId || !appointmentId || !budgetId) {
    return {
      ok: false,
      reused: false,
      duplicated: false,
      package: null,
      contractId: null,
      error: 'Paciente, atendimento e orçamento são obrigatórios.',
    };
  }

  const existing = activeContract(appointmentId, budgetId, patientId);
  if (existing?.id) {
    attachTcleBestEffort({ user, patientId, appointmentId, budgetId });
    const pkg = buildContractPackageViewModel({
      appointmentId,
      budgetId,
      patientId,
      user,
    });
    return {
      ok: true,
      reused: true,
      duplicated: false,
      package: pkg,
      contractId: existing.id,
    };
  }

  const check = validateBudgetContractGeneration({
    patientId,
    budgetId,
    appointmentId,
    allowExisting: true,
  });
  if (check.existingContract?.id) {
    const pkg = buildContractPackageViewModel({ appointmentId, budgetId, patientId, user });
    return {
      ok: true,
      reused: true,
      duplicated: false,
      package: pkg,
      contractId: check.existingContract.id,
    };
  }

  ensureContractsModuleSeeded();
  const templateId = findDefaultTemplateId();
  if (!templateId) {
    return {
      ok: false,
      reused: false,
      duplicated: false,
      package: null,
      contractId: null,
      error: 'Nenhum modelo de contrato disponível.',
    };
  }

  try {
    const contract = createContractDraft(user, {
      patientId,
      quoteSource: 'clinical_budget',
      quoteId: appointmentId,
      budgetId,
      templateId,
      skipHashtagValidation: true,
    });
    attachTcleBestEffort({ user, patientId, appointmentId, budgetId });
    try {
      markBudgetContractGenerated(user, appointmentId);
    } catch {
      /* lock best-effort — não duplicar financeiro */
    }
    const pkg = buildContractPackageViewModel({
      appointmentId,
      budgetId,
      patientId,
      user,
    });
    return {
      ok: true,
      reused: false,
      duplicated: false,
      package: pkg,
      contractId: contract?.id || pkg.contractId,
    };
  } catch (error) {
    const message = String(error?.message || '');
    const raced = activeContract(appointmentId, budgetId, patientId);
    if (raced?.id || /já existe contrato/i.test(message)) {
      const pkg = buildContractPackageViewModel({
        appointmentId,
        budgetId,
        patientId,
        user,
      });
      return {
        ok: true,
        reused: true,
        duplicated: false,
        package: pkg,
        contractId: raced?.id || pkg.contractId,
      };
    }
    return {
      ok: false,
      reused: false,
      duplicated: false,
      package: null,
      contractId: null,
      error: message || 'Falha ao gerar o pacote jurídico.',
    };
  }
}
