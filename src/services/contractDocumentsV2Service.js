/**
 * Facade client de documentos/PDF v2 — Phase 10.7.
 * Default: storage unavailable. Flags OFF.
 */

import { isContractFeatureEnabled } from '../domain/contracts/contract-feature-flags.ts';
import { ContractArtifactPipelineError } from '../domain/contracts/artifacts/contract-document-artifact.pipeline.ts';

let injectedHarness = null;

export function setContractDocumentsV2HarnessForTests(harness) {
  injectedHarness = harness || null;
}

export function resetContractDocumentsV2HarnessForTests() {
  injectedHarness = null;
}

export function isContractDocumentsV2UiEnabled(context = {}) {
  return (
    isContractFeatureEnabled('contracts_domain_v2_enabled', context)
    && isContractFeatureEnabled('contracts_module_v2_enabled', context)
    && isContractFeatureEnabled('contract_versioning_enabled', context)
    && isContractFeatureEnabled('contract_pdf_v2_enabled', context)
    && isContractFeatureEnabled('contract_storage_v2_enabled', context)
  );
}

export function getContractDocumentsV2Harness() {
  return injectedHarness;
}

export function mapContractDocumentsV2Error(error) {
  if (error instanceof ContractArtifactPipelineError) {
    return { code: error.domainError.code, message: error.domainError.message };
  }
  const code = error?.code || error?.domainError?.code;
  return {
    code: code || 'INVALID_INPUT',
    message: error?.message || 'Erro ao processar documentos v2.',
  };
}
