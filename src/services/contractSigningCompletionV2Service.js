/**
 * Facade client de conclusão SIGNED / ledger v2 — Phase 10.8.
 * Default: flags OFF. Sem efeitos externos.
 */

import { isContractFeatureEnabled } from '../domain/contracts/contract-feature-flags.ts';
import { ContractSigningCompletionError } from '../domain/contracts/completion/contract-signing-completion.service.ts';
import { ContractIdempotencyConflictError } from '../domain/contracts/idempotency/contract-idempotency.ts';

let injectedHarness = null;

export function setContractSigningCompletionV2HarnessForTests(harness) {
  injectedHarness = harness || null;
}

export function resetContractSigningCompletionV2HarnessForTests() {
  injectedHarness = null;
}

export function isContractSigningCompletionV2UiEnabled(context = {}) {
  return (
    isContractFeatureEnabled('contracts_domain_v2_enabled', context)
    && isContractFeatureEnabled('contracts_module_v2_enabled', context)
    && isContractFeatureEnabled('contract_versioning_enabled', context)
    && isContractFeatureEnabled('contract_internal_signature_v2_enabled', context)
    && isContractFeatureEnabled('contract_pdf_v2_enabled', context)
    && isContractFeatureEnabled('contract_storage_v2_enabled', context)
    && isContractFeatureEnabled('contract_audit_ledger_enabled', context)
  );
}

export function getContractSigningCompletionV2Harness() {
  return injectedHarness;
}

export function mapContractSigningCompletionV2Error(error) {
  if (error instanceof ContractSigningCompletionError) {
    return { code: error.domainError.code, message: error.domainError.message };
  }
  if (error instanceof ContractIdempotencyConflictError) {
    return { code: error.domainError.code, message: error.domainError.message };
  }
  const code = error?.code || error?.domainError?.code;
  return {
    code: code || 'INVALID_INPUT',
    message: error?.message || 'Erro na conclusão de assinatura v2.',
  };
}
