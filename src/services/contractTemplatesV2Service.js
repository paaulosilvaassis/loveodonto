/**
 * Client facade dos modelos de contrato v2 — Phase 10.4.
 * Sem wiring ao legado. Persistência default = unavailable (migrations não aplicadas).
 */

import {
  createContractTemplateApplicationService,
  ContractTemplateApplicationError,
} from '../domain/contracts/templates/contract-template.application-service.ts';
import { ContractTemplateUnavailableRepository } from '../domain/contracts/templates/contract-template-unavailable.repository.ts';
import { isContractFeatureEnabled } from '../domain/contracts/contract-feature-flags.ts';

let injectedService = null;

export function setContractTemplatesV2ServiceForTests(service) {
  injectedService = service || null;
}

export function resetContractTemplatesV2ServiceForTests() {
  injectedService = null;
}

export function isContractTemplatesV2UiEnabled(context = {}) {
  return (
    isContractFeatureEnabled('contracts_domain_v2_enabled', context)
    && isContractFeatureEnabled('contract_templates_v2_enabled', context)
  );
}

export function getContractTemplatesV2Service(options = {}) {
  if (injectedService) return injectedService;
  if (options.service) return options.service;
  return createContractTemplateApplicationService({
    repository: options.repository || new ContractTemplateUnavailableRepository(),
    featureFlagContext: options.featureFlagContext,
    skipFeatureFlagCheck: Boolean(options.skipFeatureFlagCheck),
  });
}

export function mapContractTemplatesV2Error(error) {
  if (error instanceof ContractTemplateApplicationError) {
    return {
      code: error.domainError.code,
      message: error.domainError.message,
      field: error.domainError.field,
    };
  }
  const code = error?.code || error?.domainError?.code;
  if (code === 'CONTRACTS_V2_STORAGE_UNAVAILABLE') {
    return {
      code,
      message: 'O módulo de modelos v2 ainda não está disponível neste ambiente.',
    };
  }
  return {
    code: code || 'INVALID_INPUT',
    message: error?.message || 'Erro ao processar modelos v2.',
  };
}

export {
  createContractTemplateApplicationService,
  ContractTemplateApplicationError,
};
