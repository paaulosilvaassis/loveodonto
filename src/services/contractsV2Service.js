/**
 * Facade client de instâncias contratuais v2 — Phase 10.5.
 * Default: storage unavailable. Flags OFF.
 */

import { isContractFeatureEnabled } from '../domain/contracts/contract-feature-flags.ts';
import { ContractApplicationError } from '../domain/contracts/application/contract.application-service.ts';

let injectedService = null;

export function setContractsV2ServiceForTests(service) {
  injectedService = service || null;
}

export function resetContractsV2ServiceForTests() {
  injectedService = null;
}

export function isContractsV2UiEnabled(context = {}) {
  return (
    isContractFeatureEnabled('contracts_domain_v2_enabled', context)
    && isContractFeatureEnabled('contracts_module_v2_enabled', context)
    && isContractFeatureEnabled('contract_versioning_enabled', context)
  );
}

export function getContractsV2Service() {
  if (injectedService) return injectedService;
  return {
    async listContracts() {
      const err = new Error('O módulo de contratos v2 ainda não está disponível neste ambiente.');
      err.code = 'CONTRACTS_V2_STORAGE_UNAVAILABLE';
      throw err;
    },
    async createDraft() {
      const err = new Error('O módulo de contratos v2 ainda não está disponível neste ambiente.');
      err.code = 'CONTRACTS_V2_STORAGE_UNAVAILABLE';
      throw err;
    },
  };
}

export function mapContractsV2Error(error) {
  if (error instanceof ContractApplicationError) {
    return {
      code: error.domainError.code,
      message: error.domainError.message,
    };
  }
  const code = error?.code || error?.domainError?.code;
  if (code === 'CONTRACTS_V2_STORAGE_UNAVAILABLE') {
    return {
      code,
      message: 'O módulo de contratos v2 ainda não está disponível neste ambiente.',
    };
  }
  return {
    code: code || 'INVALID_INPUT',
    message: error?.message || 'Erro ao processar contratos v2.',
  };
}
