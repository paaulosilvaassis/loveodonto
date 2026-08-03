/**
 * Facade client de assinatura pública v2 — Phase 10.11.
 * Default: flags OFF. Nunca logar token/OTP.
 */

import { isContractFeatureEnabled } from '../domain/contracts/contract-feature-flags.ts';
import { SignatureApplicationError } from '../domain/contracts/signatures/signature-envelope.application-service.ts';

let injectedHarness = null;

export function setPublicSignaturesV2HarnessForTests(harness) {
  injectedHarness = harness || null;
}

export function resetPublicSignaturesV2HarnessForTests() {
  injectedHarness = null;
}

export function getPublicSignaturesV2Harness() {
  return injectedHarness;
}

export function isPublicSignaturesV2UiEnabled(context = {}) {
  return (
    isContractFeatureEnabled('contracts_domain_v2_enabled', context)
    && isContractFeatureEnabled('contracts_module_v2_enabled', context)
    && isContractFeatureEnabled('contract_versioning_enabled', context)
    && isContractFeatureEnabled('contract_internal_signature_v2_enabled', context)
    && isContractFeatureEnabled('contract_pdf_v2_enabled', context)
    && isContractFeatureEnabled('contract_storage_v2_enabled', context)
    && isContractFeatureEnabled('contract_audit_ledger_enabled', context)
    && isContractFeatureEnabled('contract_patient_portal_enabled', context)
  );
}

function unavailable() {
  const err = new Error('Assinatura pública v2 ainda não está disponível neste ambiente.');
  err.code = 'SIGNATURE_STORAGE_UNAVAILABLE';
  throw err;
}

function mapPublicError(error) {
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
      message: 'Assinatura pública v2 ainda não está disponível neste ambiente.',
    };
  }
  if (code === 'SIGNATURE_SESSION_EXPIRED') {
    return { code, message: 'Sessão expirada.' };
  }
  if (code === 'SIGNATURE_PUBLIC_ACCESS_DENIED' || code === 'SIGNATURE_SESSION_INVALID') {
    return { code: 'SIGNATURE_PUBLIC_ACCESS_DENIED', message: 'Não foi possível acessar esta solicitação de assinatura.' };
  }
  return {
    code: code || 'INVALID_INPUT',
    message: error?.message || 'Erro ao processar assinatura pública v2.',
  };
}

async function callHarnessPublic(token, path, method, body) {
  const h = injectedHarness;
  if (!h?.signerService) unavailable();

  const svc = h.signerService;
  const inv = h.invitationService;

  if (path === '/open' && method === 'POST') {
    const open = await svc.openSigningSession({ token });
    return {
      clinicDisplayName: 'Clínica Demo',
      documentTitle: h.contract?.title || 'Documento para assinatura',
      signerRole: open.signerRole,
      status: open.status,
      requiredSteps: ['VIEW', 'AUTHENTICATE', 'ACCEPT', 'SIGN'],
      requiredTerms: open.requiredTerms || [],
      expiresAt: open.expiresAt,
    };
  }

  if (path === '/view' && method === 'POST') {
    const view = await svc.viewDocument({ token });
    return {
      documentHashAbbrev: view.documentHash
        ? `${String(view.documentHash).slice(0, 12)}…`
        : undefined,
      html: view.html,
      signerStatus: view.signer?.status,
    };
  }

  if (path === '/status' && method === 'GET') {
    const open = await svc.openSigningSession({ token });
    return {
      status: open.status,
      expiresAt: open.expiresAt,
    };
  }

  if (path === '/challenge' && method === 'POST') {
    const payload = body && typeof body === 'object' ? body : {};
    const result = await svc.requestAuthenticationChallenge({
      token,
      method: payload.method || 'OTP_EMAIL',
      idempotencyKey: payload.idempotencyKey,
    });
    if (inv && result.challengeId) {
      const session = await svc.openSigningSession({ token });
      await inv.recordChallengeDelivery({
        tenantId: h.tenantId,
        envelopeId: session.envelopeId,
        signerId: session.signerId,
        channel: payload.channel || 'TECHNICAL_HARNESS',
        challengeId: result.challengeId,
        testOnlyPlainCode: result.testOnlyPlainCode,
        idempotencyKey: payload.idempotencyKey || `chal_${result.challengeId}`,
      });
    }
    return {
      challengeId: result.challengeId,
      expiresAt: result.expiresAt,
      deliverySimulated: true,
    };
  }

  if (path === '/verify' && method === 'POST') {
    const payload = body && typeof body === 'object' ? body : {};
    const result = await svc.verifyAuthenticationChallenge({
      token,
      challengeId: payload.challengeId,
      code: payload.code,
      idempotencyKey: payload.idempotencyKey,
    });
    if (!result.valid) {
      const err = new Error('Código inválido.');
      err.code = result.errorCode || 'SIGNATURE_PUBLIC_ACCESS_DENIED';
      throw err;
    }
    return {
      authenticated: true,
      signerStatus: result.signer?.status,
    };
  }

  if (path === '/accept' && method === 'POST') {
    const payload = body && typeof body === 'object' ? body : {};
    const acceptances = Array.isArray(payload.acceptances) ? payload.acceptances : null;
    let result;
    if (acceptances) {
      result = await svc.acceptRequiredTerms({
        token,
        acceptanceIds: acceptances.filter((a) => a.accepted).map((a) => a.code || a.id),
        acceptances,
        idempotencyKey: payload.idempotencyKey,
      });
    } else {
      result = await svc.acceptRequiredTerms({
        token,
        acceptanceIds: payload.acceptanceIds || [],
        idempotencyKey: payload.idempotencyKey,
      });
    }
    return { signerStatus: result.signer?.status, accepted: true };
  }

  if (path === '/sign' && method === 'POST') {
    const payload = body && typeof body === 'object' ? body : {};
    const result = await svc.sign({
      token,
      method: payload.method || 'CLICK_ACCEPT',
      typedConfirmation: payload.typedConfirmation,
      artifactSeed: payload.artifactSeed,
      artifactReference: payload.artifactReference,
      idempotencyKey: payload.idempotencyKey,
    });
    return {
      envelopeStatus: result.envelope?.status,
      signerStatus: result.signer?.status,
      evidenceHashAbbrev: result.evidence?.evidenceHash
        ? `${String(result.evidence.evidenceHash).slice(0, 12)}…`
        : undefined,
      idempotentReplay: result.idempotentReplay,
      effectsExecuted: false,
    };
  }

  if (path === '/decline' && method === 'POST') {
    const payload = body && typeof body === 'object' ? body : {};
    const result = await svc.decline({
      token,
      reason: payload.reason,
      idempotencyKey: payload.idempotencyKey,
    });
    return {
      declined: true,
      envelopeStatus: result.envelope?.status,
      signerStatus: result.signer?.status,
    };
  }

  unavailable();
}

export async function callPublic(token, path, method = 'POST', body) {
  if (!token || String(token).includes('?')) {
    const err = new Error('Token inválido.');
    err.code = 'SIGNATURE_PUBLIC_ACCESS_DENIED';
    throw err;
  }

  if (injectedHarness) {
    return callHarnessPublic(token, path, method, body);
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `/public/signatures-v2/${encodeURIComponent(token)}${normalizedPath}`;
  const init = {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
  };
  if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data?.error || data?.message || 'Falha na assinatura pública.');
    err.code = data?.code || 'SIGNATURE_PUBLIC_ACCESS_DENIED';
    err.status = response.status;
    throw err;
  }
  return data;
}

export async function publicOpen(token) {
  return callPublic(token, '/open', 'POST');
}

export async function publicView(token) {
  return callPublic(token, '/view', 'POST');
}

export async function publicStatus(token) {
  return callPublic(token, '/status', 'GET');
}

export async function publicChallenge(token, body = {}) {
  return callPublic(token, '/challenge', 'POST', {
    method: 'OTP_EMAIL',
    channel: 'TECHNICAL_HARNESS',
    ...body,
  });
}

export async function publicVerify(token, body) {
  return callPublic(token, '/verify', 'POST', body);
}

export async function publicAccept(token, body) {
  return callPublic(token, '/accept', 'POST', body);
}

export async function publicSign(token, body) {
  return callPublic(token, '/sign', 'POST', body);
}

export async function publicDecline(token, body = {}) {
  return callPublic(token, '/decline', 'POST', body);
}

/**
 * Upload opcional de PNG — retorna null se storage indisponível (use artifactSeed).
 * Nunca loga conteúdo binário/token.
 */
export async function uploadPublicSignatureGraphic(_token, blob) {
  if (!blob || !injectedHarness?.storage) return null;
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const ref = await injectedHarness.storage.put({
      tenantId: injectedHarness.tenantId,
      contractId: injectedHarness.contract.id,
      contractVersionId: injectedHarness.version.id,
      fileType: 'SIGNATURE_GRAPHIC',
      mimeType: 'image/png',
      binary: { bytes, mimeType: 'image/png' },
      createdBy: 'public_signer',
    });
    return ref?.storagePath ? { artifactReference: ref.storagePath } : null;
  } catch {
    return null;
  }
}

export function mapPublicSignaturesV2Error(error) {
  return mapPublicError(error);
}
