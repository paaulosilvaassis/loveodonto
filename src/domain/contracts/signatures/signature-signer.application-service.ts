/**
 * @module domain/contracts/signatures/signature-signer.application-service
 * @description Ações do signatário (sessão por token) — Phase 10.6.
 */

import {
  createContractDomainError,
  type ContractDomainError,
} from '../contract.errors.js';
import { createContractDomainEvent, type ContractDomainEvent } from '../contract.events.js';
import {
  isContractFeatureEnabled,
  type ContractFeatureFlagContext,
} from '../contract-feature-flags.js';
import type { TenantId } from '../contract.ids.js';
import {
  createMemoryContractIdempotencyRepository,
  fingerprintIdempotencyInput,
  ContractIdempotencyConflictError,
  type ContractIdempotencyRepository,
} from '../idempotency/contract-idempotency.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import { createContractAuditEvent } from '../audit/contract-audit.factory.js';
import { canTransitionSignerStatus } from './signature-signer-status.machine.js';
import type { SigningSessionTokenService } from './signing-session-token.service.js';
import type { SignatureAuthenticationChallengeService } from './signature-authentication-challenge.service.js';
import { createMemorySignatureAuthenticationChallengeService } from './signature-authentication-challenge.service.js';
import { finalizeArtifactReference, hashSignatureEvidence } from './signature-evidence.hash.js';
import {
  isMethodCapabilityUnavailable,
  isTerminalEnvelopeStatus,
  normalizeSigningOrder,
  type SignatureArtifactReference,
  type SignatureEvidenceSnapshot,
  type SignatureMethod,
  type SignatureRequiredAcceptance,
  type SignatureSigner,
} from './signature.types.js';
import type {
  SignatureEnvelopeRepository,
  SignatureEvidenceRepository,
  SignaturePolicyRepository,
  SignatureSignerRepository,
} from './signature-memory.repository.js';
import {
  SignatureApplicationError,
  type SignatureEnvelopeApplicationService,
} from './signature-envelope.application-service.js';

function fail(code: ContractDomainError['code'], message: string, field?: string): never {
  throw new SignatureApplicationError(createContractDomainError(code, message, field));
}

export interface SignatureSignerApplicationServiceDeps {
  envelopeRepository: SignatureEnvelopeRepository;
  signerRepository: SignatureSignerRepository;
  policyRepository: SignaturePolicyRepository;
  evidenceRepository: SignatureEvidenceRepository;
  tokenService: SigningSessionTokenService;
  challengeService?: SignatureAuthenticationChallengeService;
  envelopeService: SignatureEnvelopeApplicationService;
  clock?: ContractClock;
  idempotency?: ContractIdempotencyRepository;
  featureFlagContext?: ContractFeatureFlagContext;
  skipFeatureFlagCheck?: boolean;
  /** Documento demo renderizado — sem contrato real. */
  resolveDocumentHtml?: (envelopeId: string) => Promise<string>;
  auditSink?: Array<ReturnType<typeof createContractAuditEvent>>;
}

function assertFlags(deps: SignatureSignerApplicationServiceDeps) {
  if (deps.skipFeatureFlagCheck) return;
  const ctx = deps.featureFlagContext || {};
  if (!isContractFeatureEnabled('contracts_domain_v2_enabled', ctx)
    || !isContractFeatureEnabled('contract_internal_signature_v2_enabled', ctx)) {
    fail('FEATURE_FLAG_DISABLED', 'Assinatura interna v2 desabilitada.');
  }
}

async function loadSessionContext(
  deps: SignatureSignerApplicationServiceDeps,
  token: string,
) {
  const session = await deps.tokenService.validate(token);
  const envelope = await deps.envelopeRepository.findById(session.tenantId, session.envelopeId);
  const signer = await deps.signerRepository.findById(session.tenantId, session.signerId);
  if (!envelope || !signer || signer.envelopeId !== envelope.id) {
    fail('SIGNATURE_SESSION_INVALID', 'Sessão inválida.');
  }
  if (isTerminalEnvelopeStatus(envelope.status)
    || ['EXPIRED', 'CANCELLED', 'FAILED'].includes(envelope.status)) {
    if (envelope.status === 'EXPIRED') {
      fail('SIGNATURE_ENVELOPE_EXPIRED', 'Envelope expirado.');
    }
    fail('SIGNATURE_ENVELOPE_NOT_ACTIVE', 'Envelope não ativo.');
  }
  if (envelope.expiresAt && Date.parse(envelope.expiresAt) <= (deps.clock || createSystemContractClock()).now().getTime()) {
    fail('SIGNATURE_ENVELOPE_EXPIRED', 'Envelope expirado.');
  }
  const policy = envelope.signaturePolicyId
    ? await deps.policyRepository.findById(session.tenantId, envelope.signaturePolicyId)
    : null;
  return { session, envelope, signer, policy };
}

async function assertSigningOrder(
  deps: SignatureSignerApplicationServiceDeps,
  tenantId: TenantId,
  envelopeId: string,
  signer: SignatureSigner,
  policySigningOrder: string | undefined,
) {
  const order = normalizeSigningOrder((policySigningOrder as never) || 'ANY_ORDER');
  if (order !== 'SEQUENTIAL') return;
  const all = await deps.signerRepository.listByEnvelope(tenantId, envelopeId as never);
  const pendingRequired = all
    .filter((s) => s.required && s.status !== 'SIGNED' && s.status !== 'DECLINED' && s.status !== 'CANCELLED' && s.status !== 'EXPIRED')
    .sort((a, b) => a.signerOrder - b.signerOrder);
  if (pendingRequired.length && pendingRequired[0].id !== signer.id) {
    fail('SIGNATURE_SIGNER_OUT_OF_ORDER', 'Signatário fora da ordem sequencial.');
  }
}

export function createSignatureSignerApplicationService(
  deps: SignatureSignerApplicationServiceDeps,
) {
  const clock = deps.clock || createSystemContractClock();
  const challenges = deps.challengeService
    || createMemorySignatureAuthenticationChallengeService(clock, { exposePlainCodeInTests: true });
  const idempotency = deps.idempotency || createMemoryContractIdempotencyRepository();

  return {
    async openSigningSession(input: { token: string }) {
      assertFlags(deps);
      const ctx = await loadSessionContext(deps, input.token);
      let { signer } = ctx;
      if (signer.status === 'INVITED' && canTransitionSignerStatus('INVITED', 'DELIVERED').allowed) {
        signer = await deps.signerRepository.update(ctx.session.tenantId, {
          ...signer,
          status: 'DELIVERED',
          deliveredAt: clock.nowIso(),
        });
      }
      return {
        envelopeId: ctx.envelope.id,
        signerId: signer.id,
        signerName: signer.name,
        signerRole: signer.signerRole,
        status: signer.status,
        expiresAt: ctx.envelope.expiresAt,
        requiredTerms: (signer.acceptedTerms || []).map((t) => ({
          id: t.id,
          code: t.code,
          label: t.label,
          required: t.required,
          accepted: Boolean(t.acceptedAt),
        })),
        events: [] as ContractDomainEvent[],
      };
    },

    async viewDocument(input: { token: string }) {
      assertFlags(deps);
      const ctx = await loadSessionContext(deps, input.token);
      let { signer } = ctx;
      const now = clock.nowIso();
      if (['INVITED', 'DELIVERED'].includes(signer.status)
        && canTransitionSignerStatus(signer.status, 'VIEWED').allowed) {
        signer = await deps.signerRepository.update(ctx.session.tenantId, {
          ...signer,
          status: 'VIEWED',
          viewedAt: now,
        });
      } else if (!signer.viewedAt) {
        signer = await deps.signerRepository.update(ctx.session.tenantId, {
          ...signer,
          viewedAt: now,
        });
      }
      const html = deps.resolveDocumentHtml
        ? await deps.resolveDocumentHtml(ctx.envelope.id)
        : '<p>Documento demonstrativo — sem valor jurídico.</p>';
      return {
        html,
        documentHash: ctx.envelope.documentHashBeforeSigning,
        signer,
        events: [createContractDomainEvent({
          tenantId: ctx.session.tenantId,
          aggregateId: ctx.envelope.id,
          aggregateType: 'signature_envelope',
          eventType: 'contract.signer.viewed',
          occurredAt: now,
          payload: { signerId: signer.id, envelopeId: ctx.envelope.id },
        })],
      };
    },

    async requestAuthenticationChallenge(input: {
      token: string;
      method: SignatureMethod;
      idempotencyKey?: string;
    }) {
      assertFlags(deps);
      const ctx = await loadSessionContext(deps, input.token);
      await assertSigningOrder(
        deps,
        ctx.session.tenantId,
        ctx.envelope.id,
        ctx.signer,
        ctx.policy?.signingOrder,
      );
      if (isMethodCapabilityUnavailable(input.method)) {
        fail('SIGNATURE_CAPABILITY_UNAVAILABLE', 'Método indisponível.');
      }
      const needsOtp = input.method === 'OTP_EMAIL' || input.method === 'OTP_SMS'
        || ctx.policy?.requireOtp;
      if (!needsOtp && input.method !== 'OTP_EMAIL' && input.method !== 'OTP_SMS') {
        fail('SIGNATURE_METHOD_NOT_ALLOWED', 'Challenge OTP não aplicável a este método.');
      }

      const fingerprint = fingerprintIdempotencyInput({
        envelopeId: ctx.envelope.id,
        signerId: ctx.signer.id,
        method: input.method,
      });
      if (input.idempotencyKey) {
        const reservation = await idempotency.reserve(
          ctx.session.tenantId,
          'REQUEST_CHALLENGE',
          input.idempotencyKey,
          fingerprint,
          clock.nowIso(),
        );
        if (reservation.kind === 'conflict') throw new ContractIdempotencyConflictError();
      }

      const minutes = ctx.policy?.otpExpirationMinutes || 10;
      const challenge = await challenges.createChallenge({
        tenantId: ctx.session.tenantId,
        envelopeId: ctx.envelope.id,
        signerId: ctx.signer.id,
        method: input.method,
        maxAttempts: ctx.policy?.maxAuthenticationAttempts || ctx.policy?.maxAttempts || 5,
        expiresAt: new Date(clock.now().getTime() + minutes * 60_000).toISOString(),
      });

      if (input.idempotencyKey) {
        await idempotency.complete(
          ctx.session.tenantId,
          'REQUEST_CHALLENGE',
          input.idempotencyKey,
          challenge.challengeId,
          clock.nowIso(),
        );
      }

      return {
        challengeId: challenge.challengeId,
        expiresAt: challenge.expiresAt,
        deliverySimulated: true as const,
        /** Harness only */
        testOnlyPlainCode: challenge.testOnlyPlainCode,
        events: [createContractDomainEvent({
          tenantId: ctx.session.tenantId,
          aggregateId: ctx.envelope.id,
          aggregateType: 'signature_envelope',
          eventType: 'contract.signer.challenge_requested',
          occurredAt: clock.nowIso(),
          payload: { signerId: ctx.signer.id, method: input.method },
        })],
      };
    },

    async verifyAuthenticationChallenge(input: {
      token: string;
      challengeId: string;
      code: string;
      idempotencyKey?: string;
    }) {
      assertFlags(deps);
      const ctx = await loadSessionContext(deps, input.token);
      const result = await challenges.verifyChallenge({
        challengeId: input.challengeId,
        code: input.code,
        envelopeId: ctx.envelope.id,
        signerId: ctx.signer.id,
      });
      if (!result.valid) {
        fail(
          (result.errorCode as ContractDomainError['code']) || 'SIGNATURE_AUTHENTICATION_FAILED',
          'Autenticação falhou.',
        );
      }

      let { signer } = ctx;
      if (canTransitionSignerStatus(signer.status, 'AUTHENTICATED').allowed
        || signer.status === 'VIEWED'
        || signer.status === 'DELIVERED'
        || signer.status === 'INVITED') {
        const from = signer.status === 'INVITED' || signer.status === 'DELIVERED'
          ? (canTransitionSignerStatus(signer.status, 'VIEWED').allowed ? 'VIEWED' : signer.status)
          : signer.status;
        // Garantir viewed antes se necessário
        if (!signer.viewedAt) {
          signer = await deps.signerRepository.update(ctx.session.tenantId, {
            ...signer,
            status: canTransitionSignerStatus(signer.status, 'VIEWED').allowed ? 'VIEWED' : signer.status,
            viewedAt: clock.nowIso(),
          });
        }
        if (canTransitionSignerStatus(signer.status, 'AUTHENTICATED').allowed) {
          signer = await deps.signerRepository.update(ctx.session.tenantId, {
            ...signer,
            status: 'AUTHENTICATED',
            authenticatedAt: result.consumedAt || clock.nowIso(),
            authenticationMethod: ctx.policy?.requireOtp ? 'OTP_EMAIL' : signer.authenticationMethod,
          });
        }
        void from;
      }

      return {
        valid: true,
        signer,
        events: [createContractDomainEvent({
          tenantId: ctx.session.tenantId,
          aggregateId: ctx.envelope.id,
          aggregateType: 'signature_envelope',
          eventType: 'contract.signer.authenticated',
          occurredAt: clock.nowIso(),
          payload: { signerId: signer.id },
        })],
      };
    },

    async acceptRequiredTerms(input: {
      token: string;
      acceptanceIds: string[];
    }) {
      assertFlags(deps);
      const ctx = await loadSessionContext(deps, input.token);
      const ids = new Set(input.acceptanceIds || []);
      const terms = (ctx.signer.acceptedTerms || []).map((t) => (
        ids.has(t.id)
          ? { ...t, acceptedAt: clock.nowIso() }
          : t
      ));
      const signer = await deps.signerRepository.update(ctx.session.tenantId, {
        ...ctx.signer,
        acceptedTerms: terms,
      });
      return {
        signer,
        events: [createContractDomainEvent({
          tenantId: ctx.session.tenantId,
          aggregateId: ctx.envelope.id,
          aggregateType: 'signature_envelope',
          eventType: 'contract.signer.terms_accepted',
          occurredAt: clock.nowIso(),
          payload: { signerId: signer.id, acceptanceIds: [...ids] },
        })],
      };
    },

    async sign(input: {
      token: string;
      method: SignatureMethod;
      typedConfirmation?: string;
      artifactSeed?: string;
      ipAddress?: string;
      userAgent?: string;
      geolocation?: SignatureEvidenceSnapshot['geolocation'];
      idempotencyKey?: string;
    }) {
      assertFlags(deps);
      // Replay idempotente pode ocorrer após envelope COMPLETED
      const sessionEarly = await deps.tokenService.validate(input.token);
      const signerEarly = await deps.signerRepository.findById(
        sessionEarly.tenantId,
        sessionEarly.signerId,
      );
      if (signerEarly?.status === 'SIGNED' && input.idempotencyKey) {
        const envelopeEarly = await deps.envelopeRepository.findById(
          sessionEarly.tenantId,
          sessionEarly.envelopeId,
        );
        const existing = await deps.evidenceRepository.findBySigner(
          sessionEarly.tenantId,
          signerEarly.id,
        );
        return {
          envelope: envelopeEarly!,
          signer: signerEarly,
          evidence: existing || signerEarly.evidenceSnapshot!,
          events: [],
          idempotentReplay: true,
        };
      }

      const ctx = await loadSessionContext(deps, input.token);
      await assertSigningOrder(
        deps,
        ctx.session.tenantId,
        ctx.envelope.id,
        ctx.signer,
        ctx.policy?.signingOrder,
      );

      if (ctx.signer.status === 'SIGNED') {
        fail('SIGNATURE_SIGNER_ALREADY_SIGNED', 'Signatário já assinou.');
      }

      if (isMethodCapabilityUnavailable(input.method)) {
        fail('SIGNATURE_CAPABILITY_UNAVAILABLE', 'Método indisponível.');
      }

      if (!ctx.signer.viewedAt) {
        fail('SIGNATURE_DOCUMENT_NOT_VIEWED', 'Documento deve ser visualizado.');
      }

      const requiresAuth = Boolean(ctx.policy?.requireOtp)
        || input.method === 'OTP_EMAIL'
        || input.method === 'OTP_SMS';
      if (requiresAuth && !ctx.signer.authenticatedAt && ctx.signer.status !== 'AUTHENTICATED') {
        fail('SIGNATURE_AUTHENTICATION_REQUIRED', 'Autenticação obrigatória.');
      }

      const missingTerms = (ctx.signer.acceptedTerms || []).filter((t) => t.required && !t.acceptedAt);
      if (missingTerms.length) {
        fail('SIGNATURE_TERMS_REQUIRED', 'Termos obrigatórios pendentes.');
      }

      let artifact: SignatureArtifactReference | undefined;
      if (input.method === 'DRAWN_SIGNATURE' || input.method === 'ON_SCREEN') {
        if (!input.artifactSeed) {
          fail('SIGNATURE_ARTIFACT_REQUIRED', 'Artifact de assinatura gráfica obrigatório.');
        }
        artifact = await finalizeArtifactReference(input.artifactSeed, {
          mimeType: 'image/png',
          width: 300,
          height: 100,
        });
      }
      if (input.method === 'TYPED_CONFIRMATION' && !String(input.typedConfirmation || '').trim()) {
        fail('INVALID_INPUT', 'Confirmação digitada obrigatória.');
      }

      const fingerprint = fingerprintIdempotencyInput({
        envelopeId: ctx.envelope.id,
        signerId: ctx.signer.id,
        method: input.method,
        documentHash: ctx.envelope.documentHashBeforeSigning,
      });
      if (input.idempotencyKey) {
        const reservation = await idempotency.reserve(
          ctx.session.tenantId,
          'SIGN',
          input.idempotencyKey,
          fingerprint,
          clock.nowIso(),
        );
        if (reservation.kind === 'conflict') throw new ContractIdempotencyConflictError();
        if (reservation.kind === 'replay' && reservation.record.status === 'COMPLETED') {
          const existing = await deps.evidenceRepository.findBySigner(
            ctx.session.tenantId,
            ctx.signer.id,
          );
          return {
            envelope: ctx.envelope,
            signer: ctx.signer,
            evidence: existing!,
            events: [],
            idempotentReplay: true,
          };
        }
      }

      const now = clock.nowIso();
      const evidenceBase: SignatureEvidenceSnapshot = {
        envelopeId: ctx.envelope.id,
        signerId: ctx.signer.id,
        contractId: ctx.envelope.contractId,
        contractVersionId: ctx.envelope.contractVersionId,
        documentHash: ctx.envelope.documentHashBeforeSigning,
        documentHashAtSign: ctx.envelope.documentHashBeforeSigning,
        authenticationMethod: input.method,
        authenticationCompletedAt: ctx.signer.authenticatedAt,
        viewedAt: ctx.signer.viewedAt,
        signedAt: now,
        ipAddress: ctx.policy?.requireIpAddress || ctx.policy?.requireIp
          ? input.ipAddress
          : undefined,
        userAgent: input.userAgent,
        geolocation: ctx.policy?.requireGeolocation ? input.geolocation : undefined,
        acceptedTerms: (ctx.signer.acceptedTerms || []) as SignatureRequiredAcceptance[],
        signatureArtifact: artifact,
        sessionTokenId: ctx.session.tokenId,
      };
      const evidenceHash = await hashSignatureEvidence(evidenceBase);
      const evidence = { ...evidenceBase, evidenceHash, id: `evd_${ctx.signer.id}` };

      if (!evidence.evidenceHash) {
        fail('SIGNATURE_EVIDENCE_HASH_REQUIRED', 'Hash de evidência obrigatório.');
      }

      // Transicionar até SIGNED (permitindo saltos simulados)
      let signer = ctx.signer;
      for (const step of ['VIEWED', 'AUTHENTICATED', 'SIGNED'] as const) {
        if (signer.status === 'SIGNED') break;
        if (canTransitionSignerStatus(signer.status, step).allowed) {
          signer = {
            ...signer,
            status: step,
            ...(step === 'VIEWED' ? { viewedAt: signer.viewedAt || now } : {}),
            ...(step === 'AUTHENTICATED'
              ? { authenticatedAt: signer.authenticatedAt || now }
              : {}),
            ...(step === 'SIGNED' ? { signedAt: now } : {}),
          };
        }
      }
      if (signer.status !== 'SIGNED') {
        // Forçar se já autenticado/viewed
        if (!canTransitionSignerStatus(signer.status, 'SIGNED').allowed) {
          fail('INVALID_STATUS_TRANSITION', `Não é possível assinar a partir de ${signer.status}.`);
        }
        signer = { ...signer, status: 'SIGNED', signedAt: now };
      }

      signer = await deps.signerRepository.update(ctx.session.tenantId, {
        ...signer,
        status: 'SIGNED',
        signedAt: now,
        authenticationMethod: input.method,
        signatureArtifact: artifact,
        evidenceSnapshot: evidence,
      });
      await deps.evidenceRepository.save(ctx.session.tenantId, evidence as never);
      await challenges.invalidateChallenges(ctx.envelope.id, ctx.signer.id);

      if (input.idempotencyKey) {
        await idempotency.complete(
          ctx.session.tenantId,
          'SIGN',
          input.idempotencyKey,
          evidence.id,
          now,
        );
      }

      const reconciliation = await deps.envelopeService.reconcileEnvelope(
        ctx.session.tenantId,
        ctx.envelope.id,
      );

      const events: ContractDomainEvent[] = [
        createContractDomainEvent({
          tenantId: ctx.session.tenantId,
          aggregateId: ctx.envelope.id,
          aggregateType: 'signature_envelope',
          eventType: 'contract.signer.signed',
          occurredAt: now,
          payload: { signerId: signer.id, evidenceHash },
        }),
        ...reconciliation.events,
      ];

      return {
        envelope: reconciliation.envelope,
        signer,
        evidence,
        events,
        idempotentReplay: false,
        effects: reconciliation.effects,
      };
    },

    async decline(input: {
      token: string;
      reason?: string;
      idempotencyKey?: string;
    }) {
      assertFlags(deps);
      const ctx = await loadSessionContext(deps, input.token);
      if (ctx.signer.status === 'SIGNED') {
        fail('SIGNATURE_SIGNER_ALREADY_SIGNED', 'Signatário já assinou.');
      }
      if (ctx.policy?.requireDocumentCheck && !String(input.reason || '').trim()) {
        // Motivo opcional por padrão; se política exigir document check, ainda opcional aqui
      }

      const now = clock.nowIso();
      const evidenceBase: SignatureEvidenceSnapshot = {
        envelopeId: ctx.envelope.id,
        signerId: ctx.signer.id,
        contractId: ctx.envelope.contractId,
        contractVersionId: ctx.envelope.contractVersionId,
        documentHash: ctx.envelope.documentHashBeforeSigning,
        declinedAt: now,
        viewedAt: ctx.signer.viewedAt,
        acceptedTerms: ctx.signer.acceptedTerms,
        sessionTokenId: ctx.session.tokenId,
      };
      const evidenceHash = await hashSignatureEvidence(evidenceBase);
      const evidence = { ...evidenceBase, evidenceHash, id: `evd_dec_${ctx.signer.id}` };

      const signer = await deps.signerRepository.update(ctx.session.tenantId, {
        ...ctx.signer,
        status: 'DECLINED',
        declinedAt: now,
        declineReason: input.reason,
        evidenceSnapshot: evidence,
      });
      await deps.evidenceRepository.save(ctx.session.tenantId, evidence as never);
      await deps.tokenService.revoke(ctx.session.tokenId);
      await challenges.invalidateChallenges(ctx.envelope.id, ctx.signer.id);

      const reconciliation = await deps.envelopeService.reconcileEnvelope(
        ctx.session.tenantId,
        ctx.envelope.id,
      );

      return {
        envelope: reconciliation.envelope,
        signer,
        evidence,
        events: [
          createContractDomainEvent({
            tenantId: ctx.session.tenantId,
            aggregateId: ctx.envelope.id,
            aggregateType: 'signature_envelope',
            eventType: 'contract.signer.declined',
            occurredAt: now,
            payload: { signerId: signer.id, reasonPresent: Boolean(input.reason) },
          }),
          ...reconciliation.events,
        ],
      };
    },
  };
}

export type SignatureSignerApplicationService = ReturnType<
  typeof createSignatureSignerApplicationService
>;
