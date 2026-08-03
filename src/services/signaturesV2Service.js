/**
 * Facade client de assinaturas internas v2 — Phase 10.6.
 * Default: storage unavailable. Flags OFF.
 */

import { isContractFeatureEnabled } from '../domain/contracts/contract-feature-flags.ts';
import { SignatureApplicationError } from '../domain/contracts/signatures/signature-envelope.application-service.ts';

let injectedHarness = null;

export function setSignaturesV2HarnessForTests(harness) {
  injectedHarness = harness || null;
}

export function resetSignaturesV2HarnessForTests() {
  injectedHarness = null;
}

export function isSignaturesV2UiEnabled(context = {}) {
  return (
    isContractFeatureEnabled('contracts_domain_v2_enabled', context)
    && isContractFeatureEnabled('contracts_module_v2_enabled', context)
    && isContractFeatureEnabled('contract_versioning_enabled', context)
    && isContractFeatureEnabled('contract_internal_signature_v2_enabled', context)
  );
}

export function getSignaturesV2Harness() {
  return injectedHarness;
}

function unavailable() {
  const err = new Error('Assinatura interna v2 ainda não está disponível neste ambiente.');
  err.code = 'SIGNATURE_STORAGE_UNAVAILABLE';
  throw err;
}

export function getSignaturesV2Services() {
  if (injectedHarness) {
    return {
      envelopeService: injectedHarness.envelopeService,
      signerService: injectedHarness.signerService,
      policyService: injectedHarness.policyService,
      harness: injectedHarness,
    };
  }
  return {
    envelopeService: { createEnvelope: unavailable, listEnvelopes: unavailable, getEnvelope: unavailable },
    signerService: { openSigningSession: unavailable },
    policyService: { listPolicies: unavailable },
    harness: null,
  };
}

export function mapSignaturesV2Error(error) {
  if (error instanceof SignatureApplicationError) {
    return {
      code: error.domainError.code,
      message: error.domainError.message,
    };
  }
  const code = error?.code || error?.domainError?.code;
  if (code === 'SIGNATURE_STORAGE_UNAVAILABLE' || code === 'CONTRACTS_V2_STORAGE_UNAVAILABLE') {
    return {
      code: 'SIGNATURE_STORAGE_UNAVAILABLE',
      message: 'Assinatura interna v2 ainda não está disponível neste ambiente.',
    };
  }
  return {
    code: code || 'INVALID_INPUT',
    message: error?.message || 'Erro ao processar assinatura v2.',
  };
}
