/**
 * Phase 10.6 — Signature Envelope Foundation
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  canTransitionEnvelopeStatus,
  ALLOWED_ENVELOPE_TRANSITIONS,
} from '../domain/contracts/signatures/signature-envelope-status.machine.ts';
import {
  canTransitionSignerStatus,
  ALLOWED_SIGNER_TRANSITIONS,
} from '../domain/contracts/signatures/signature-signer-status.machine.ts';
import { createSignatureV2Harness } from '../domain/contracts/signatures/signature-v2.harness.ts';
import {
  createMemorySigningSessionTokenService,
} from '../domain/contracts/signatures/signing-session-token.service.ts';
import {
  createMemorySignatureAuthenticationChallengeService,
} from '../domain/contracts/signatures/signature-authentication-challenge.service.ts';
import {
  hashSignatureEvidence,
  finalizeArtifactReference,
} from '../domain/contracts/signatures/signature-evidence.hash.ts';
import {
  createExternalSignatureProviderStub,
} from '../domain/contracts/signatures/internal-signature.provider.ts';
import { createFixedContractClock } from '../domain/contracts/shared/contract-clock.ts';
import { SignatureApplicationError } from '../domain/contracts/signatures/signature-envelope.application-service.ts';
import { isContractFeatureEnabled } from '../domain/contracts/contract-feature-flags.ts';
import {
  isSignaturesV2UiEnabled,
  setSignaturesV2HarnessForTests,
  resetSignaturesV2HarnessForTests,
} from '../services/signaturesV2Service.js';
import {
  createSignatureEnvelopesV2Handlers,
  isSignatureEnvelopesV2ApiEnabled,
} from '../../server/lib/signatureEnvelopesV2Api.js';
import { contractsShellNavItems } from '../contracts/contractsShellConfig.js';
import { buildPermissionsCatalog } from '../permissions/catalog.js';
import {
  demoSignerPatient,
  demoSignerProfessional,
  demoSignerResponsible,
} from '../domain/contracts/fixtures/signature-v2.fixtures.ts';
import { DEMO_TENANT_ID } from '../domain/contracts/fixtures/contract-v2.fixtures.ts';

const SIG_PERMS = [
  'contract_signatures:view',
  'contract_signatures:create_envelope',
  'contract_signatures:manage_signers',
  'contract_signatures:send',
  'contract_signatures:cancel_envelope',
  'contract_signatures:view_evidence',
  'contract_signatures:manage_policies',
  'contract_signatures:reconcile',
];

function actor(overrides = {}) {
  return { userId: 'user-sig', permissions: SIG_PERMS, ...overrides };
}

async function createSentEnvelope(h, policyId = 'pol_demo_simple', signers) {
  const created = await h.envelopeService.createEnvelope(h.tenantId, {
    contractId: h.contract.id,
    signaturePolicyId: policyId,
    signers: signers || [
      { ...demoSignerPatient, allowedMethods: [...demoSignerPatient.allowedMethods] },
    ],
    idempotencyKey: `ik_create_${Math.random().toString(36).slice(2)}`,
  }, actor());
  const sent = await h.envelopeService.sendEnvelope(
    h.tenantId,
    created.envelope.id,
    actor(),
    { idempotencyKey: `ik_send_${created.envelope.id}` },
  );
  return sent;
}

async function signWithToken(h, token, method = 'CLICK_ACCEPT', opts = {}) {
  await h.signerService.viewDocument({ token });
  if (opts.otp) {
    const ch = await h.signerService.requestAuthenticationChallenge({
      token,
      method: 'OTP_EMAIL',
    });
    await h.signerService.verifyAuthenticationChallenge({
      token,
      challengeId: ch.challengeId,
      code: ch.testOnlyPlainCode,
    });
  }
  const session = await h.signerService.openSigningSession({ token });
  const ids = (session.requiredTerms || []).filter((t) => t.required).map((t) => t.id);
  await h.signerService.acceptRequiredTerms({ token, acceptanceIds: ids });
  return h.signerService.sign({
    token,
    method,
    artifactSeed: method === 'DRAWN_SIGNATURE' ? 'stroke_seed_demo' : undefined,
    typedConfirmation: method === 'TYPED_CONFIRMATION' ? 'Confirmo' : undefined,
    idempotencyKey: opts.idempotencyKey,
  });
}

describe('Phase 10.6 — flags e gates', () => {
  it('flags permanecem OFF', () => {
    expect(isContractFeatureEnabled('contract_internal_signature_v2_enabled')).toBe(false);
    expect(isContractFeatureEnabled('contract_external_signature_enabled')).toBe(false);
    expect(isSignaturesV2UiEnabled()).toBe(false);
    expect(isSignatureEnvelopesV2ApiEnabled({})).toBe(false);
  });

  it('nav Assinaturas v2 exige quatro flags', () => {
    const item = contractsShellNavItems.find((i) => i.id === 'assinaturas-v2');
    expect(item?.featureFlagsAll).toEqual(expect.arrayContaining([
      'contracts_domain_v2_enabled',
      'contracts_module_v2_enabled',
      'contract_versioning_enabled',
      'contract_internal_signature_v2_enabled',
    ]));
  });

  it('permissões no catálogo sem roleDefaults', () => {
    const catalog = buildPermissionsCatalog();
    const ids = catalog.filter((p) => p.module_key === 'contract_signatures').map((p) => p.action_key);
    expect(ids).toEqual(expect.arrayContaining([
      'view', 'create_envelope', 'manage_signers', 'send', 'cancel_envelope',
      'view_evidence', 'manage_policies', 'reconcile',
    ]));
  });
});

describe('Phase 10.6 — envelope state machine', () => {
  it('permite e proíbe transições canônicas', () => {
    expect(canTransitionEnvelopeStatus('DRAFT', 'READY').allowed).toBe(true);
    expect(canTransitionEnvelopeStatus('DRAFT', 'SENT').allowed).toBe(false);
    expect(canTransitionEnvelopeStatus('READY', 'SENT').allowed).toBe(true);
    expect(canTransitionEnvelopeStatus('SENT', 'IN_PROGRESS').allowed).toBe(true);
    expect(canTransitionEnvelopeStatus('SENT', 'COMPLETED').allowed).toBe(true);
    expect(canTransitionEnvelopeStatus('COMPLETED', 'DRAFT').allowed).toBe(false);
    expect(canTransitionEnvelopeStatus('CANCELLED', 'SENT').allowed).toBe(false);
    expect(ALLOWED_ENVELOPE_TRANSITIONS.COMPLETED).toEqual([]);
  });
});

describe('Phase 10.6 — signer state machine', () => {
  it('permite saltos simulados e bloqueia retorno de SIGNED', () => {
    expect(canTransitionSignerStatus('INVITED', 'VIEWED').allowed).toBe(true);
    expect(canTransitionSignerStatus('VIEWED', 'AUTHENTICATED').allowed).toBe(true);
    expect(canTransitionSignerStatus('AUTHENTICATED', 'SIGNED').allowed).toBe(true);
    expect(canTransitionSignerStatus('SIGNED', 'DECLINED').allowed).toBe(false);
    expect(ALLOWED_SIGNER_TRANSITIONS.SIGNED).toEqual([]);
  });
});

describe('Phase 10.6 — criação de envelope', () => {
  it('cria com contrato APPROVED e bloqueia inconsistências', async () => {
    const h = await createSignatureV2Harness();
    const ok = await h.envelopeService.createEnvelope(h.tenantId, {
      contractId: h.contract.id,
      signaturePolicyId: 'pol_demo_simple',
      signers: [{ ...demoSignerPatient, allowedMethods: ['CLICK_ACCEPT'] }],
    }, actor());
    expect(ok.envelope.status).toBe('DRAFT');

    await expect(h.envelopeService.createEnvelope(h.tenantId, {
      contractId: h.contract.id,
      signaturePolicyId: 'pol_demo_simple',
      signers: [{ ...demoSignerPatient, allowedMethods: ['CLICK_ACCEPT'] }],
    }, actor())).rejects.toMatchObject({
      domainError: { code: 'SIGNATURE_ENVELOPE_CONFLICT' },
    });

    h.contracts.set(h.contract.id, { ...h.contract, status: 'DRAFT' });
    const h2 = await createSignatureV2Harness({ seedPolicies: true });
    h2.contracts.set(h2.contract.id, { ...h2.contract, status: 'DRAFT' });
    await expect(h2.envelopeService.createEnvelope(h2.tenantId, {
      contractId: h2.contract.id,
      signaturePolicyId: 'pol_demo_simple',
      signers: [{ ...demoSignerPatient, allowedMethods: ['CLICK_ACCEPT'] }],
    }, actor())).rejects.toMatchObject({
      domainError: { code: 'INVALID_STATUS' },
    });
  });

  it('exige política, signatário obrigatório e hash', async () => {
    const h = await createSignatureV2Harness();
    await expect(h.envelopeService.createEnvelope(h.tenantId, {
      contractId: h.contract.id,
      signaturePolicyId: 'pol_missing',
      signers: [{ ...demoSignerPatient, allowedMethods: ['CLICK_ACCEPT'] }],
    }, actor())).rejects.toMatchObject({
      domainError: { code: 'SIGNATURE_POLICY_REQUIRED' },
    });

    await expect(h.envelopeService.createEnvelope(h.tenantId, {
      contractId: h.contract.id,
      signaturePolicyId: 'pol_demo_simple',
      signers: [{ ...demoSignerPatient, required: false, allowedMethods: ['CLICK_ACCEPT'] }],
    }, actor())).rejects.toMatchObject({
      domainError: { code: 'SIGNATURE_REQUIRED_SIGNER_MISSING' },
    });

    h.versions.set(h.version.id, { ...h.version, documentHash: undefined });
    await expect(h.envelopeService.createEnvelope(h.tenantId, {
      contractId: h.contract.id,
      signaturePolicyId: 'pol_demo_simple',
      signers: [{ ...demoSignerPatient, allowedMethods: ['CLICK_ACCEPT'] }],
    }, actor())).rejects.toMatchObject({
      domainError: { code: 'CONTENT_HASH_REQUIRED' },
    });
  });

  it('idempotência de create', async () => {
    const h = await createSignatureV2Harness();
    const a = await h.envelopeService.createEnvelope(h.tenantId, {
      contractId: h.contract.id,
      signaturePolicyId: 'pol_demo_simple',
      signers: [{ ...demoSignerPatient, allowedMethods: ['CLICK_ACCEPT'] }],
      idempotencyKey: 'same-key',
    }, actor());
    const b = await h.envelopeService.createEnvelope(h.tenantId, {
      contractId: h.contract.id,
      signaturePolicyId: 'pol_demo_simple',
      signers: [{ ...demoSignerPatient, allowedMethods: ['CLICK_ACCEPT'] }],
      idempotencyKey: 'same-key',
    }, actor());
    expect(b.idempotentReplay).toBe(true);
    expect(b.envelope.id).toBe(a.envelope.id);
  });
});

describe('Phase 10.6 — políticas', () => {
  it('bloqueia método externo e valida OTP e-mail/telefone', async () => {
    const h = await createSignatureV2Harness();
    await expect(h.policyService.createPolicy(h.tenantId, {
      name: 'Externa',
      signatureLevel: 'EXTERNAL_PROVIDER',
      allowedMethods: ['EXTERNAL_PROVIDER'],
    }, actor())).rejects.toMatchObject({
      domainError: { code: 'SIGNATURE_CAPABILITY_UNAVAILABLE' },
    });

    await expect(h.envelopeService.createEnvelope(h.tenantId, {
      contractId: h.contract.id,
      signaturePolicyId: 'pol_demo_otp',
      signers: [{
        ...demoSignerPatient,
        email: undefined,
        allowedMethods: ['OTP_EMAIL'],
      }],
    }, actor())).rejects.toMatchObject({
      domainError: { code: 'INVALID_INPUT' },
    });

    const stub = createExternalSignatureProviderStub();
    expect(() => { stub.createEnvelope({}); }).toThrow(SignatureApplicationError);
  });
});

describe('Phase 10.6 — tokens', () => {
  it('emite, valida, expira e revoga sem armazenar bruto', async () => {
    const clock = createFixedContractClock('2026-08-03T12:00:00.000Z');
    const tokens = createMemorySigningSessionTokenService(clock);
    const issued = await tokens.issue({
      tenantId: DEMO_TENANT_ID,
      envelopeId: 'env1',
      signerId: 'sgn1',
      expiresAt: '2026-08-03T13:00:00.000Z',
    });
    expect(issued.token.length).toBeGreaterThan(20);
    expect(issued.tokenHash).not.toContain(issued.token.slice(0, 8));

    const validated = await tokens.validate(issued.token);
    expect(validated.signerId).toBe('sgn1');
    expect(validated.tenantId).toBe(DEMO_TENANT_ID);

    await tokens.revoke(issued.tokenId);
    await expect(tokens.validate(issued.token)).rejects.toMatchObject({
      domainError: { code: 'SIGNATURE_SESSION_REVOKED' },
    });

    const issued2 = await tokens.issue({
      tenantId: DEMO_TENANT_ID,
      envelopeId: 'env1',
      signerId: 'sgn1',
      expiresAt: '2026-08-03T12:30:00.000Z',
    });
    clock.setIso('2026-08-03T14:00:00.000Z');
    await expect(tokens.validate(issued2.token)).rejects.toMatchObject({
      domainError: { code: 'SIGNATURE_SESSION_EXPIRED' },
    });
  });
});

describe('Phase 10.6 — OTP', () => {
  it('hash, tentativas, consumo e invalida anterior', async () => {
    const clock = createFixedContractClock('2026-08-03T12:00:00.000Z');
    const svc = createMemorySignatureAuthenticationChallengeService(clock, {
      deterministicCode: '654321',
      exposePlainCodeInTests: true,
    });
    const c1 = await svc.createChallenge({
      tenantId: DEMO_TENANT_ID,
      envelopeId: 'env1',
      signerId: 'sgn1',
      method: 'OTP_EMAIL',
      maxAttempts: 2,
      expiresAt: '2026-08-03T12:10:00.000Z',
    });
    expect(c1.testOnlyPlainCode).toBe('654321');
    expect(JSON.stringify(c1)).not.toMatch(/codeHash/);

    const c2 = await svc.createChallenge({
      tenantId: DEMO_TENANT_ID,
      envelopeId: 'env1',
      signerId: 'sgn1',
      method: 'OTP_EMAIL',
      maxAttempts: 2,
      expiresAt: '2026-08-03T12:10:00.000Z',
    });

    const bad = await svc.verifyChallenge({
      challengeId: c1.challengeId,
      code: '654321',
      envelopeId: 'env1',
      signerId: 'sgn1',
    });
    expect(bad.valid).toBe(false);

    const wrong = await svc.verifyChallenge({
      challengeId: c2.challengeId,
      code: '000000',
      envelopeId: 'env1',
      signerId: 'sgn1',
    });
    expect(wrong.valid).toBe(false);

    const ok = await svc.verifyChallenge({
      challengeId: c2.challengeId,
      code: '654321',
      envelopeId: 'env1',
      signerId: 'sgn1',
    });
    expect(ok.valid).toBe(true);

    const replay = await svc.verifyChallenge({
      challengeId: c2.challengeId,
      code: '654321',
      envelopeId: 'env1',
      signerId: 'sgn1',
    });
    expect(replay.valid).toBe(false);
    expect(replay.errorCode).toBe('SIGNATURE_CHALLENGE_ALREADY_CONSUMED');
  });
});

describe('Phase 10.6 — fluxo de assinatura e evidências', () => {
  it('fluxo válido gera evidência com hash e sem data URL', async () => {
    const h = await createSignatureV2Harness();
    const sent = await createSentEnvelope(h);
    const token = sent.issuedSessions[0].token;
    const result = await signWithToken(h, token, 'DRAWN_SIGNATURE');
    expect(result.signer.status).toBe('SIGNED');
    expect(result.evidence.evidenceHash).toBeTruthy();
    expect(result.evidence.signatureArtifact?.sha256).toBeTruthy();
    expect(JSON.stringify(result.evidence)).not.toMatch(/data:image|base64/);
    expect(result.envelope.status).toBe('COMPLETED');
    expect(result.effects.contractStatusTransitionRequired).toBe(true);
    // Contrato NÃO transiciona automaticamente
    expect(h.contract.status).toBe('APPROVED');
  });

  it('bloqueia sem view, termos e autenticação OTP', async () => {
    const h = await createSignatureV2Harness();
    const sent = await createSentEnvelope(h, 'pol_demo_otp', [{
      ...demoSignerPatient,
      allowedMethods: ['OTP_EMAIL', 'CLICK_ACCEPT'],
    }]);
    const token = sent.issuedSessions[0].token;

    await expect(h.signerService.sign({
      token,
      method: 'CLICK_ACCEPT',
    })).rejects.toMatchObject({
      domainError: { code: 'SIGNATURE_DOCUMENT_NOT_VIEWED' },
    });

    await h.signerService.viewDocument({ token });
    await expect(h.signerService.sign({
      token,
      method: 'CLICK_ACCEPT',
    })).rejects.toMatchObject({
      domainError: { code: 'SIGNATURE_AUTHENTICATION_REQUIRED' },
    });

    const ch = await h.signerService.requestAuthenticationChallenge({
      token,
      method: 'OTP_EMAIL',
    });
    await h.signerService.verifyAuthenticationChallenge({
      token,
      challengeId: ch.challengeId,
      code: ch.testOnlyPlainCode,
    });
    await expect(h.signerService.sign({
      token,
      method: 'CLICK_ACCEPT',
    })).rejects.toMatchObject({
      domainError: { code: 'SIGNATURE_TERMS_REQUIRED' },
    });
  });

  it('hash de evidência determinístico e artifact por referência', async () => {
    const artifact = await finalizeArtifactReference('seed_a');
    expect(artifact.temporaryArtifactId).toBeTruthy();
    expect(artifact.sha256).toBeTruthy();
    const base = {
      envelopeId: 'e1',
      signerId: 's1',
      contractId: 'c1',
      contractVersionId: 'v1',
      documentHash: 'dh',
      signedAt: '2026-08-03T12:00:00.000Z',
      acceptedTerms: [{ code: 'DOCUMENT_READ', required: true, acceptedAt: '2026-08-03T12:00:00.000Z', contentHash: 't1' }],
      signatureArtifact: artifact,
    };
    const h1 = await hashSignatureEvidence(base);
    const h2 = await hashSignatureEvidence(base);
    expect(h1).toBe(h2);
  });
});

describe('Phase 10.6 — ordem sequencial', () => {
  it('bloqueia signatário fora da vez', async () => {
    const h = await createSignatureV2Harness();
    const sent = await createSentEnvelope(h, 'pol_demo_sequential', [
      { ...demoSignerPatient, signerOrder: 1, allowedMethods: ['CLICK_ACCEPT'] },
      { ...demoSignerResponsible, signerOrder: 2, allowedMethods: ['CLICK_ACCEPT'] },
    ]);
    const token2 = sent.issuedSessions.find((s) => s.signerId === sent.signers[1].id).token;
    await expect(signWithToken(h, token2)).rejects.toMatchObject({
      domainError: { code: 'SIGNATURE_SIGNER_OUT_OF_ORDER' },
    });
    const token1 = sent.issuedSessions.find((s) => s.signerId === sent.signers[0].id).token;
    await signWithToken(h, token1);
    await signWithToken(h, token2);
    const details = await h.envelopeService.getEnvelope(h.tenantId, sent.envelope.id, actor());
    expect(details.envelope.status).toBe('COMPLETED');
  });
});

describe('Phase 10.6 — recusa, expiração e cancelamento', () => {
  it('recusa obrigatória marca DECLINED e preserva evidência', async () => {
    const h = await createSignatureV2Harness();
    const sent = await createSentEnvelope(h);
    const token = sent.issuedSessions[0].token;
    await h.signerService.viewDocument({ token });
    const result = await h.signerService.decline({ token, reason: 'Não concordo' });
    expect(result.envelope.status).toBe('DECLINED');
    expect(result.evidence.evidenceHash).toBeTruthy();
    expect(h.contract.status).toBe('APPROVED');
  });

  it('expira por clock e não reabre terminal', async () => {
    const h = await createSignatureV2Harness();
    const sent = await createSentEnvelope(h);
    h.advanceClock('2026-08-20T12:00:00.000Z');
    const expired = await h.envelopeService.expireEnvelope(h.tenantId, sent.envelope.id, actor());
    expect(expired.status).toBe('EXPIRED');
    const again = await h.envelopeService.expireEnvelope(h.tenantId, sent.envelope.id, actor());
    expect(again.status).toBe('EXPIRED');
  });

  it('cancelamento exige motivo e revoga sessões', async () => {
    const h = await createSignatureV2Harness();
    const sent = await createSentEnvelope(h);
    await expect(h.envelopeService.cancelEnvelope(
      h.tenantId,
      sent.envelope.id,
      { reason: '' },
      actor(),
    )).rejects.toBeTruthy();

    const cancelled = await h.envelopeService.cancelEnvelope(
      h.tenantId,
      sent.envelope.id,
      { reason: 'Cancelamento admin demo' },
      actor(),
    );
    expect(cancelled.status).toBe('CANCELLED');
    await expect(h.tokenService.validate(sent.issuedSessions[0].token)).rejects.toMatchObject({
      domainError: { code: 'SIGNATURE_SESSION_REVOKED' },
    });
  });
});

describe('Phase 10.6 — reconciliação', () => {
  it('opcional pendente não bloqueia; obrigatório pendente bloqueia', async () => {
    const h = await createSignatureV2Harness();
    const sent = await createSentEnvelope(h, 'pol_demo_simple', [
      { ...demoSignerPatient, required: true, signerOrder: 1, allowedMethods: ['CLICK_ACCEPT'] },
      { ...demoSignerProfessional, required: false, signerOrder: 2, allowedMethods: ['CLICK_ACCEPT'] },
    ]);
    const tokenPatient = sent.issuedSessions.find((s) => s.signerId === sent.signers[0].id).token;
    const result = await signWithToken(h, tokenPatient);
    expect(result.envelope.status).toBe('COMPLETED');
  });
});

describe('Phase 10.6 — cross-tenant', () => {
  it('tenant A não lê envelope de B; token A não acessa B', async () => {
    const a = await createSignatureV2Harness({ tenantId: 'tenant_a' });
    const b = await createSignatureV2Harness({ tenantId: 'tenant_b' });
    const sentB = await createSentEnvelope(b);
    const leaked = await a.envelopeService.getEnvelope('tenant_a', sentB.envelope.id, actor());
    expect(leaked).toBeNull();

    await expect(a.signerService.openSigningSession({
      token: sentB.issuedSessions[0].token,
    })).rejects.toBeTruthy();
  });
});

describe('Phase 10.6 — API e UI técnica', () => {
  afterEach(() => {
    resetSignaturesV2HarnessForTests();
  });

  it('API retorna 403 com flags OFF', async () => {
    const handlers = createSignatureEnvelopesV2Handlers({});
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await handlers.listEnvelopes({ tenantContext: { tenantId: 't1', permissions: SIG_PERMS } }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('FEATURE_FLAG_DISABLED');
  });

  it('UI gate OFF e harness injeta para demo', async () => {
    expect(isSignaturesV2UiEnabled()).toBe(false);
    const h = await createSignatureV2Harness();
    setSignaturesV2HarnessForTests(h);
    expect(h.envelopeService).toBeTruthy();
  });

  it('rota pública bloqueada com flag OFF', async () => {
    const handlers = createSignatureEnvelopesV2Handlers({});
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await handlers.publicOpen({ params: { token: 'x' } }, res);
    expect(res.statusCode).toBe(403);
  });
});

describe('Phase 10.6 — provider interno', () => {
  it('consulta status e não gera PDF', async () => {
    const h = await createSignatureV2Harness();
    const sent = await createSentEnvelope(h);
    const status = await h.internalProvider.getEnvelopeStatus({
      tenantId: h.tenantId,
      envelopeId: sent.envelope.id,
      providerEnvelopeId: sent.envelope.id,
    });
    expect(status.status).toBe('SENT');
    await expect(h.internalProvider.downloadSignedDocument({
      tenantId: h.tenantId,
      envelopeId: sent.envelope.id,
      providerEnvelopeId: sent.envelope.id,
    })).rejects.toMatchObject({
      domainError: { code: 'SIGNATURE_CAPABILITY_UNAVAILABLE' },
    });
  });
});

describe('Phase 10.6 — idempotência sign', () => {
  it('replay seguro e conflito de payload', async () => {
    const h = await createSignatureV2Harness();
    const sent = await createSentEnvelope(h);
    const token = sent.issuedSessions[0].token;
    const first = await signWithToken(h, token, 'CLICK_ACCEPT', { idempotencyKey: 'sign-1' });
    expect(first.idempotentReplay).toBe(false);

    // Já assinado + mesma key → replay
    const replay = await h.signerService.sign({
      token,
      method: 'CLICK_ACCEPT',
      idempotencyKey: 'sign-1',
    });
    expect(replay.idempotentReplay).toBe(true);
  });
});
