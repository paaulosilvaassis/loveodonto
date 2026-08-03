/**
 * @module domain/contracts/signatures/signature-envelope.application-service
 * @description Application service de envelopes — Phase 10.6.
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
import type {
  ContractId,
  ContractVersionId,
  SignatureEnvelopeId,
  SignaturePolicyId,
  SignatureSignerId,
  TenantId,
} from '../contract.ids.js';
import type { Contract, ContractVersion } from '../contract.types.js';
import {
  createMemoryContractIdempotencyRepository,
  fingerprintIdempotencyInput,
  ContractIdempotencyConflictError,
  type ContractIdempotencyRepository,
} from '../idempotency/contract-idempotency.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import type { ContractIdFactory } from '../shared/contract-id-factory.js';
import { createCryptoContractIdFactory } from '../shared/contract-id-factory.js';
import { createContractAuditEvent } from '../audit/contract-audit.factory.js';
import { canTransitionEnvelopeStatus } from './signature-envelope-status.machine.js';
import { canTransitionSignerStatus } from './signature-signer-status.machine.js';
import type { SigningSessionTokenService } from './signing-session-token.service.js';
import { createMemorySigningSessionTokenService } from './signing-session-token.service.js';
import type { SignatureAuthenticationChallengeService } from './signature-authentication-challenge.service.js';
import {
  isMethodCapabilityUnavailable,
  isTerminalEnvelopeStatus,
  normalizeSigningOrder,
  type SignatureEnvelope,
  type SignatureEnvelopeCompletionEffects,
  type SignatureMethod,
  type SignaturePolicy,
  type SignatureSigner,
  createDefaultCompletionEffects,
} from './signature.types.js';
import type {
  SignatureEnvelopeRepository,
  SignatureEvidenceRepository,
  SignaturePolicyRepository,
  SignatureSignerRepository,
} from './signature-memory.repository.js';

export type SignatureOperationActor = {
  userId: string;
  displayName?: string;
  permissions?: string[];
};

export const SIGNATURE_PERMISSIONS = [
  'contract_signatures:view',
  'contract_signatures:create_envelope',
  'contract_signatures:manage_signers',
  'contract_signatures:send',
  'contract_signatures:cancel_envelope',
  'contract_signatures:view_evidence',
  'contract_signatures:manage_policies',
  'contract_signatures:reconcile',
] as const;

export class SignatureApplicationError extends Error {
  readonly domainError: ContractDomainError;

  constructor(domainError: ContractDomainError) {
    super(domainError.message);
    this.name = 'SignatureApplicationError';
    this.domainError = domainError;
  }
}

function fail(code: ContractDomainError['code'], message: string, field?: string): never {
  throw new SignatureApplicationError(createContractDomainError(code, message, field));
}

function requirePerm(actor: SignatureOperationActor, permission: string): void {
  if (!(actor.permissions || []).includes(permission)) {
    fail('PERMISSION_DENIED', `Permissão necessária: ${permission}.`);
  }
}

export interface ContractLookupForSignature {
  getContract(tenantId: TenantId, contractId: ContractId): Promise<Contract | null>;
  getVersion(tenantId: TenantId, versionId: ContractVersionId): Promise<ContractVersion | null>;
}

export interface CreateSignatureEnvelopeInput {
  contractId: ContractId;
  contractVersionId?: ContractVersionId;
  signaturePolicyId: SignaturePolicyId;
  signers?: AddSignatureSignerInput[];
  idempotencyKey?: string;
  expiresInHours?: number;
}

export interface AddSignatureSignerInput {
  role: string;
  name: string;
  email?: string;
  phone?: string;
  documentNumberHash?: string;
  signerOrder: number;
  required: boolean;
  allowedMethods: SignatureMethod[];
  partyId?: string;
}

export interface UpdateSignatureSignerInput {
  name?: string;
  email?: string;
  phone?: string;
  signerOrder?: number;
  allowedMethods?: SignatureMethod[];
  required?: boolean;
}

export interface CancelSignatureEnvelopeInput {
  reason: string;
}

export interface SignatureEnvelopeDetails {
  envelope: SignatureEnvelope;
  signers: SignatureSigner[];
  policy: SignaturePolicy | null;
}

export interface CreateSignatureEnvelopeResult {
  envelope: SignatureEnvelope;
  signers: SignatureSigner[];
  events: ContractDomainEvent[];
  idempotentReplay: boolean;
}

export interface SendSignatureEnvelopeResult {
  envelope: SignatureEnvelope;
  signers: SignatureSigner[];
  issuedSessions: Array<{ signerId: string; tokenId: string; token: string }>;
  events: ContractDomainEvent[];
  idempotentReplay: boolean;
  /** Delivery simulado — nenhuma mensagem real. */
  deliverySimulated: true;
}

export interface SignatureEnvelopeReconciliationResult {
  envelope: SignatureEnvelope;
  signers: SignatureSigner[];
  completed: boolean;
  effects: SignatureEnvelopeCompletionEffects;
  events: ContractDomainEvent[];
}

export interface SignatureEnvelopeApplicationServiceDeps {
  policyRepository: SignaturePolicyRepository;
  envelopeRepository: SignatureEnvelopeRepository;
  signerRepository: SignatureSignerRepository;
  evidenceRepository: SignatureEvidenceRepository;
  contractLookup: ContractLookupForSignature;
  tokenService?: SigningSessionTokenService;
  challengeService?: SignatureAuthenticationChallengeService;
  clock?: ContractClock;
  ids?: ContractIdFactory;
  idempotency?: ContractIdempotencyRepository;
  featureFlagContext?: ContractFeatureFlagContext;
  skipFeatureFlagCheck?: boolean;
  auditSink?: Array<ReturnType<typeof createContractAuditEvent>>;
}

export function createSignatureEnvelopeApplicationService(
  deps: SignatureEnvelopeApplicationServiceDeps,
) {
  const clock = deps.clock || createSystemContractClock();
  const ids = deps.ids || createCryptoContractIdFactory();
  const idempotency = deps.idempotency || createMemoryContractIdempotencyRepository();
  const tokens = deps.tokenService || createMemorySigningSessionTokenService(clock);
  const challenges = deps.challengeService;
  const policies = deps.policyRepository;
  const envelopes = deps.envelopeRepository;
  const signersRepo = deps.signerRepository;
  const auditSink = deps.auditSink;

  function assertFlags(): void {
    if (deps.skipFeatureFlagCheck) return;
    const ctx = deps.featureFlagContext || {};
    if (!isContractFeatureEnabled('contracts_domain_v2_enabled', ctx)
      || !isContractFeatureEnabled('contracts_module_v2_enabled', ctx)
      || !isContractFeatureEnabled('contract_versioning_enabled', ctx)
      || !isContractFeatureEnabled('contract_internal_signature_v2_enabled', ctx)) {
      fail('FEATURE_FLAG_DISABLED', 'Assinatura interna v2 desabilitada.', 'featureFlag');
    }
  }

  function pushAudit(event: ReturnType<typeof createContractAuditEvent>) {
    if (auditSink) auditSink.push(event);
  }

  function validateSignerInput(input: AddSignatureSignerInput, policy: SignaturePolicy) {
    if (!String(input.name || '').trim()) fail('INVALID_INPUT', 'Nome do signatário obrigatório.', 'name');
    if (!Number.isInteger(input.signerOrder) || input.signerOrder < 1) {
      fail('INVALID_INPUT', 'signerOrder deve ser inteiro >= 1.', 'signerOrder');
    }
    for (const method of input.allowedMethods || []) {
      if (isMethodCapabilityUnavailable(method)) {
        fail('SIGNATURE_CAPABILITY_UNAVAILABLE', `Método indisponível: ${method}.`, 'allowedMethods');
      }
      if (!policy.allowedMethods.includes(method) && method !== 'ON_SCREEN') {
        // ON_SCREEN aceito como alias de DRAWN/CLICK em políticas demo
        if (!policy.allowedMethods.includes('DRAWN_SIGNATURE')
          && !policy.allowedMethods.includes('CLICK_ACCEPT')) {
          fail('SIGNATURE_METHOD_NOT_ALLOWED', `Método não permitido: ${method}.`, 'allowedMethods');
        }
      }
      if (method === 'OTP_EMAIL' && !input.email) {
        fail('INVALID_INPUT', 'E-mail exigido para OTP_EMAIL.', 'email');
      }
      if (method === 'OTP_SMS' && !input.phone) {
        fail('INVALID_INPUT', 'Telefone exigido para OTP_SMS.', 'phone');
      }
    }
  }

  async function getDetails(tenantId: TenantId, envelopeId: SignatureEnvelopeId): Promise<SignatureEnvelopeDetails | null> {
    const envelope = await envelopes.findById(tenantId, envelopeId);
    if (!envelope) return null;
    const signers = await signersRepo.listByEnvelope(tenantId, envelopeId);
    const policy = envelope.signaturePolicyId
      ? await policies.findById(tenantId, envelope.signaturePolicyId)
      : null;
    return { envelope, signers, policy };
  }

  async function reconcile(
    tenantId: TenantId,
    envelopeId: SignatureEnvelopeId,
  ): Promise<SignatureEnvelopeReconciliationResult> {
    const details = await getDetails(tenantId, envelopeId);
    if (!details) fail('SIGNATURE_ENVELOPE_NOT_FOUND', 'Envelope não encontrado.');
    let { envelope, signers } = details;
    const events: ContractDomainEvent[] = [];
    const effects = createDefaultCompletionEffects();

    if (isTerminalEnvelopeStatus(envelope.status)) {
      return {
        envelope,
        signers,
        completed: envelope.status === 'COMPLETED',
        effects: {
          ...effects,
          contractStatusTransitionRequired: envelope.status === 'COMPLETED',
        },
        events,
      };
    }

    const required = signers.filter((s) => s.required);
    const declinedRequired = required.some((s) => s.status === 'DECLINED');
    if (declinedRequired) {
      const transition = canTransitionEnvelopeStatus(envelope.status, 'DECLINED');
      if (transition.allowed) {
        envelope = await envelopes.update(tenantId, {
          ...envelope,
          status: 'DECLINED',
          updatedAt: clock.nowIso(),
        }, envelope.rowVersion);
        events.push(createContractDomainEvent({
          tenantId,
          aggregateId: envelope.id,
          aggregateType: 'signature_envelope',
          eventType: 'contract.signature_envelope.declined',
          occurredAt: clock.nowIso(),
          payload: { envelopeId: envelope.id, contractId: envelope.contractId },
        }));
      }
      return { envelope, signers, completed: false, effects: { ...effects, contractStatusTransitionRequired: false }, events };
    }

    if (envelope.expiresAt && Date.parse(envelope.expiresAt) <= clock.now().getTime()) {
      return {
        envelope,
        signers,
        completed: false,
        effects: { ...effects, contractStatusTransitionRequired: false },
        events,
      };
    }

    const version = await deps.contractLookup.getVersion(tenantId, envelope.contractVersionId);
    if (!version?.documentHash
      || (envelope.documentHashBeforeSigning
        && version.documentHash !== envelope.documentHashBeforeSigning)) {
      // Hash divergente — não conclui
      return {
        envelope,
        signers,
        completed: false,
        effects: { ...effects, contractStatusTransitionRequired: false },
        events: [],
      };
    }

    const allRequiredSigned = required.length > 0
      && required.every((s) => s.status === 'SIGNED' && s.evidenceSnapshot?.evidenceHash);
    if (!allRequiredSigned) {
      const anySigned = signers.some((s) => s.status === 'SIGNED');
      if (anySigned && (envelope.status === 'SENT' || envelope.status === 'IN_PROGRESS' || envelope.status === 'PARTIALLY_SIGNED')) {
        const to = 'IN_PROGRESS' as const;
        if (envelope.status !== to && canTransitionEnvelopeStatus(envelope.status, to).allowed) {
          envelope = await envelopes.update(tenantId, {
            ...envelope,
            status: to,
            updatedAt: clock.nowIso(),
          }, envelope.rowVersion);
          events.push(createContractDomainEvent({
            tenantId,
            aggregateId: envelope.id,
            aggregateType: 'signature_envelope',
            eventType: 'contract.signature_envelope.in_progress',
            occurredAt: clock.nowIso(),
            payload: { envelopeId: envelope.id },
          }));
        }
      }
      return { envelope, signers, completed: false, effects: { ...effects, contractStatusTransitionRequired: false }, events };
    }

    const completeTransition = canTransitionEnvelopeStatus(envelope.status, 'COMPLETED');
    if (!completeTransition.allowed) {
      return {
        envelope,
        signers,
        completed: false,
        effects: { ...effects, contractStatusTransitionRequired: false },
        events,
      };
    }

    const now = clock.nowIso();
    envelope = await envelopes.update(tenantId, {
      ...envelope,
      status: 'COMPLETED',
      completedAt: now,
      documentHashAfterSigning: envelope.documentHashBeforeSigning,
      updatedAt: now,
    }, envelope.rowVersion);

    events.push(createContractDomainEvent({
      tenantId,
      aggregateId: envelope.id,
      aggregateType: 'signature_envelope',
      eventType: 'contract.signature_envelope.completed',
      occurredAt: now,
      payload: { envelopeId: envelope.id, contractId: envelope.contractId },
    }));
    events.push(createContractDomainEvent({
      tenantId,
      aggregateId: envelope.contractId,
      aggregateType: 'contract',
      eventType: 'contract.signed',
      occurredAt: now,
      payload: {
        contractId: envelope.contractId,
        envelopeId: envelope.id,
        // Efeitos NÃO executados nesta fase
        effectsPending: true,
      },
    }));

    return {
      envelope,
      signers,
      completed: true,
      effects,
      events,
    };
  }

  return {
    async createEnvelope(
      tenantId: TenantId,
      input: CreateSignatureEnvelopeInput,
      actor: SignatureOperationActor,
    ): Promise<CreateSignatureEnvelopeResult> {
      assertFlags();
      const tid = String(tenantId || '').trim() as TenantId;
      if (!tid) fail('TENANT_REQUIRED', 'tenantId obrigatório.');
      requirePerm(actor, 'contract_signatures:create_envelope');

      const fingerprint = fingerprintIdempotencyInput({
        contractId: input.contractId,
        signaturePolicyId: input.signaturePolicyId,
        signers: (input.signers || []).map((s) => ({
          role: s.role,
          order: s.signerOrder,
          required: s.required,
        })),
      });

      if (input.idempotencyKey) {
        const reservation = await idempotency.reserve(
          tid,
          'CREATE_ENVELOPE',
          input.idempotencyKey,
          fingerprint,
          clock.nowIso(),
        );
        if (reservation.kind === 'conflict') throw new ContractIdempotencyConflictError();
        if (reservation.kind === 'replay' && reservation.record.status === 'COMPLETED') {
          const details = await getDetails(tid, reservation.record.resultRef as SignatureEnvelopeId);
          if (details) {
            return {
              envelope: details.envelope,
              signers: details.signers,
              events: [],
              idempotentReplay: true,
            };
          }
        }
      }

      const contract = await deps.contractLookup.getContract(tid, input.contractId);
      if (!contract || contract.tenantId !== tid) {
        fail('CONTRACT_NOT_FOUND', 'Contrato não encontrado.');
      }
      if (contract.status !== 'APPROVED') {
        fail('INVALID_STATUS', 'Envelope exige contrato APPROVED.', 'status');
      }
      const versionId = (input.contractVersionId || contract.currentVersionId) as ContractVersionId;
      if (!versionId) fail('VERSION_REQUIRED', 'Versão atual ausente.');
      const version = await deps.contractLookup.getVersion(tid, versionId);
      if (!version || version.contractId !== contract.id) {
        fail('VERSION_REQUIRED', 'Versão inválida.');
      }
      if (!version.lockedAt) fail('VERSION_NOT_LOCKED', 'Versão deve estar bloqueada.');
      if (!version.documentHash) fail('CONTENT_HASH_REQUIRED', 'Hash documental ausente.');

      const active = await envelopes.findActiveByContract(tid, contract.id);
      if (active) {
        fail('SIGNATURE_ENVELOPE_CONFLICT', 'Já existe envelope ativo para o contrato.');
      }

      const policy = await policies.findById(tid, input.signaturePolicyId);
      if (!policy) fail('SIGNATURE_POLICY_REQUIRED', 'Política de assinatura obrigatória.');

      const initialSigners = input.signers || [];
      if (!initialSigners.some((s) => s.required)) {
        fail('SIGNATURE_REQUIRED_SIGNER_MISSING', 'Ao menos um signatário obrigatório.');
      }
      const orders = new Set<number>();
      for (const s of initialSigners) {
        validateSignerInput(s, policy);
        if (normalizeSigningOrder(policy.signingOrder) === 'SEQUENTIAL') {
          if (orders.has(s.signerOrder)) {
            fail('INVALID_INPUT', 'Ordem de signatário duplicada.', 'signerOrder');
          }
          orders.add(s.signerOrder);
        }
      }

      const now = clock.nowIso();
      const hours = input.expiresInHours ?? policy.linkExpirationHours ?? 72;
      const expiresAt = new Date(clock.now().getTime() + hours * 3600_000).toISOString();
      const envelopeId = ids.next('env') as SignatureEnvelopeId;

      const envelope: SignatureEnvelope = {
        id: envelopeId,
        tenantId: tid,
        contractId: contract.id,
        contractVersionId: versionId,
        status: 'DRAFT',
        signaturePolicyId: policy.id,
        provider: 'INTERNAL_V2',
        documentHashBeforeSigning: version.documentHash,
        expiresAt,
        createdBy: actor.userId,
        createdAt: now,
        updatedAt: now,
        rowVersion: 1,
      };

      await envelopes.create(tid, envelope);
      const createdSigners: SignatureSigner[] = [];
      for (const s of initialSigners) {
        const signer: SignatureSigner = {
          id: ids.next('sgn') as SignatureSignerId,
          tenantId: tid,
          envelopeId,
          partyId: s.partyId,
          signerOrder: s.signerOrder,
          signerRole: s.role,
          name: s.name.trim(),
          email: s.email,
          phone: s.phone,
          documentNumberHash: s.documentNumberHash,
          allowedMethods: s.allowedMethods,
          status: 'PENDING',
          required: Boolean(s.required),
          acceptedTerms: [
            {
              id: 'acc_doc_read',
              code: 'DOCUMENT_READ',
              label: 'Li o documento',
              required: true,
              contentHash: 'term_document_read_v1',
            },
            {
              id: 'acc_intent',
              code: 'SIGNATURE_INTENT_CONFIRMED',
              label: 'Confirmo a intenção de assinar',
              required: true,
              contentHash: 'term_signature_intent_v1',
            },
            {
              id: 'acc_lgpd',
              code: 'LGPD_NOTICE_ACKNOWLEDGED',
              label: 'Ciência do aviso de privacidade',
              required: false,
              contentHash: 'term_lgpd_notice_v1',
            },
          ],
        };
        createdSigners.push(await signersRepo.create(tid, signer));
      }

      if (input.idempotencyKey) {
        await idempotency.complete(tid, 'CREATE_ENVELOPE', input.idempotencyKey, envelopeId, now);
      }

      const event = createContractDomainEvent({
        tenantId: tid,
        aggregateId: envelopeId,
        aggregateType: 'signature_envelope',
        eventType: 'contract.signature_envelope.created',
        occurredAt: now,
        actor: { actorType: 'USER', actorId: actor.userId },
        payload: { envelopeId, contractId: contract.id },
      });
      pushAudit(createContractAuditEvent({
        tenantId: tid,
        contractId: contract.id,
        eventType: 'CREATED',
        actor: { actorType: 'USER', actorId: actor.userId },
        source: 'APP',
        occurredAt: now,
        metadata: { envelopeId },
      }));

      return {
        envelope,
        signers: createdSigners,
        events: [event],
        idempotentReplay: false,
      };
    },

    async getEnvelope(tenantId: TenantId, envelopeId: SignatureEnvelopeId, actor: SignatureOperationActor) {
      assertFlags();
      requirePerm(actor, 'contract_signatures:view');
      return getDetails(tenantId, envelopeId);
    },

    async listEnvelopes(
      tenantId: TenantId,
      query: { contractId?: string; status?: string },
      actor: SignatureOperationActor,
    ) {
      assertFlags();
      requirePerm(actor, 'contract_signatures:view');
      const items = await envelopes.list(tenantId, query);
      return { items, total: items.length };
    },

    async addSigner(
      tenantId: TenantId,
      envelopeId: SignatureEnvelopeId,
      input: AddSignatureSignerInput,
      actor: SignatureOperationActor,
    ) {
      assertFlags();
      requirePerm(actor, 'contract_signatures:manage_signers');
      const details = await getDetails(tenantId, envelopeId);
      if (!details) fail('SIGNATURE_ENVELOPE_NOT_FOUND', 'Envelope não encontrado.');
      if (details.envelope.status !== 'DRAFT') {
        fail('SIGNATURE_ENVELOPE_NOT_ACTIVE', 'Só é possível adicionar signatários em DRAFT.');
      }
      if (!details.policy) fail('SIGNATURE_POLICY_REQUIRED', 'Política ausente.');
      validateSignerInput(input, details.policy);
      if (details.signers.some((s) => s.signerOrder === input.signerOrder)
        && normalizeSigningOrder(details.policy.signingOrder) === 'SEQUENTIAL') {
        fail('INVALID_INPUT', 'Ordem duplicada.', 'signerOrder');
      }

      const signer = await signersRepo.create(tenantId, {
        id: ids.next('sgn') as SignatureSignerId,
        tenantId,
        envelopeId,
        partyId: input.partyId,
        signerOrder: input.signerOrder,
        signerRole: input.role,
        name: input.name.trim(),
        email: input.email,
        phone: input.phone,
        documentNumberHash: input.documentNumberHash,
        allowedMethods: input.allowedMethods,
        status: 'PENDING',
        required: Boolean(input.required),
        acceptedTerms: [
          {
            id: 'acc_doc_read',
            code: 'DOCUMENT_READ',
            label: 'Li o documento',
            required: true,
            contentHash: 'term_document_read_v1',
          },
          {
            id: 'acc_intent',
            code: 'SIGNATURE_INTENT_CONFIRMED',
            label: 'Confirmo a intenção de assinar',
            required: true,
            contentHash: 'term_signature_intent_v1',
          },
        ],
      });

      return getDetails(tenantId, envelopeId) as Promise<SignatureEnvelopeDetails>;
    },

    async updateSignerDraft(
      tenantId: TenantId,
      envelopeId: SignatureEnvelopeId,
      signerId: SignatureSignerId,
      input: UpdateSignatureSignerInput,
      actor: SignatureOperationActor,
    ) {
      assertFlags();
      requirePerm(actor, 'contract_signatures:manage_signers');
      const details = await getDetails(tenantId, envelopeId);
      if (!details || details.envelope.status !== 'DRAFT') {
        fail('SIGNATURE_ENVELOPE_NOT_ACTIVE', 'Envelope não editável.');
      }
      const signer = details.signers.find((s) => s.id === signerId);
      if (!signer) fail('SIGNATURE_SIGNER_NOT_FOUND', 'Signatário não encontrado.');
      const next = {
        ...signer,
        name: input.name ?? signer.name,
        email: input.email ?? signer.email,
        phone: input.phone ?? signer.phone,
        signerOrder: input.signerOrder ?? signer.signerOrder,
        allowedMethods: input.allowedMethods ?? signer.allowedMethods,
        required: input.required != null ? Boolean(input.required) : signer.required,
      };
      return signersRepo.update(tenantId, next);
    },

    async markReady(
      tenantId: TenantId,
      envelopeId: SignatureEnvelopeId,
      actor: SignatureOperationActor,
    ) {
      assertFlags();
      requirePerm(actor, 'contract_signatures:manage_signers');
      const details = await getDetails(tenantId, envelopeId);
      if (!details) fail('SIGNATURE_ENVELOPE_NOT_FOUND', 'Envelope não encontrado.');
      if (!details.signers.some((s) => s.required)) {
        fail('SIGNATURE_REQUIRED_SIGNER_MISSING', 'Signatário obrigatório ausente.');
      }
      const transition = canTransitionEnvelopeStatus(details.envelope.status, 'READY');
      if (!transition.allowed) fail('INVALID_STATUS_TRANSITION', transition.errors[0].message);
      const updated = await envelopes.update(tenantId, {
        ...details.envelope,
        status: 'READY',
        updatedAt: clock.nowIso(),
      }, details.envelope.rowVersion);
      return updated;
    },

    async sendEnvelope(
      tenantId: TenantId,
      envelopeId: SignatureEnvelopeId,
      actor: SignatureOperationActor,
      options: { idempotencyKey?: string } = {},
    ): Promise<SendSignatureEnvelopeResult> {
      assertFlags();
      requirePerm(actor, 'contract_signatures:send');
      const details = await getDetails(tenantId, envelopeId);
      if (!details) fail('SIGNATURE_ENVELOPE_NOT_FOUND', 'Envelope não encontrado.');

      const fingerprint = fingerprintIdempotencyInput({ envelopeId });
      if (options.idempotencyKey) {
        const reservation = await idempotency.reserve(
          tenantId,
          'SEND_ENVELOPE',
          options.idempotencyKey,
          fingerprint,
          clock.nowIso(),
        );
        if (reservation.kind === 'conflict') throw new ContractIdempotencyConflictError();
        if (reservation.kind === 'replay' && reservation.record.status === 'COMPLETED') {
          const again = await getDetails(tenantId, envelopeId);
          return {
            envelope: again!.envelope,
            signers: again!.signers,
            issuedSessions: [],
            events: [],
            idempotentReplay: true,
            deliverySimulated: true,
          };
        }
      }

      let envelope = details.envelope;
      if (envelope.status === 'DRAFT') {
        envelope = await this.markReady(tenantId, envelopeId, actor);
      }
      const transition = canTransitionEnvelopeStatus(envelope.status, 'SENT');
      if (!transition.allowed) fail('INVALID_STATUS_TRANSITION', transition.errors[0].message);

      const now = clock.nowIso();
      envelope = await envelopes.update(tenantId, {
        ...envelope,
        status: 'SENT',
        sentAt: now,
        updatedAt: now,
      }, envelope.rowVersion);

      const issuedSessions: SendSignatureEnvelopeResult['issuedSessions'] = [];
      const updatedSigners: SignatureSigner[] = [];
      for (const signer of details.signers) {
        if (!canTransitionSignerStatus(signer.status, 'INVITED').allowed) {
          updatedSigners.push(signer);
          continue;
        }
        const invited = await signersRepo.update(tenantId, {
          ...signer,
          status: 'INVITED',
          invitedAt: now,
        });
        const session = await tokens.issue({
          tenantId,
          envelopeId,
          signerId: signer.id,
          expiresAt: envelope.expiresAt || new Date(clock.now().getTime() + 72 * 3600_000).toISOString(),
        });
        issuedSessions.push({
          signerId: signer.id,
          tokenId: session.tokenId,
          token: session.token,
        });
        updatedSigners.push(invited);
      }

      if (options.idempotencyKey) {
        await idempotency.complete(tenantId, 'SEND_ENVELOPE', options.idempotencyKey, envelopeId, now);
      }

      return {
        envelope,
        signers: updatedSigners,
        issuedSessions,
        events: [createContractDomainEvent({
          tenantId,
          aggregateId: envelopeId,
          aggregateType: 'signature_envelope',
          eventType: 'contract.signature_envelope.sent',
          occurredAt: now,
          payload: { envelopeId, deliverySimulated: true },
        })],
        idempotentReplay: false,
        deliverySimulated: true,
      };
    },

    async cancelEnvelope(
      tenantId: TenantId,
      envelopeId: SignatureEnvelopeId,
      input: CancelSignatureEnvelopeInput,
      actor: SignatureOperationActor,
    ) {
      assertFlags();
      requirePerm(actor, 'contract_signatures:cancel_envelope');
      if (!String(input.reason || '').trim()) {
        fail('CANCELLATION_REASON_REQUIRED', 'Motivo obrigatório.', 'reason');
      }
      const details = await getDetails(tenantId, envelopeId);
      if (!details) fail('SIGNATURE_ENVELOPE_NOT_FOUND', 'Envelope não encontrado.');
      if (isTerminalEnvelopeStatus(details.envelope.status)) {
        fail('SIGNATURE_ENVELOPE_ALREADY_TERMINAL', 'Envelope já terminal.');
      }
      const transition = canTransitionEnvelopeStatus(details.envelope.status, 'CANCELLED');
      if (!transition.allowed) fail('INVALID_STATUS_TRANSITION', transition.errors[0].message);

      const now = clock.nowIso();
      await tokens.revokeForEnvelope(envelopeId);
      for (const signer of details.signers) {
        if (challenges) {
          await challenges.invalidateChallenges(envelopeId, signer.id);
        }
        if (signer.status === 'SIGNED') continue;
        if (canTransitionSignerStatus(signer.status, 'CANCELLED').allowed) {
          await signersRepo.update(tenantId, { ...signer, status: 'CANCELLED' });
        }
      }
      return envelopes.update(tenantId, {
        ...details.envelope,
        status: 'CANCELLED',
        cancelledAt: now,
        cancellationReason: input.reason,
        updatedAt: now,
      }, details.envelope.rowVersion);
    },

    async expireEnvelope(
      tenantId: TenantId,
      envelopeId: SignatureEnvelopeId,
      actor: SignatureOperationActor,
    ) {
      assertFlags();
      requirePerm(actor, 'contract_signatures:reconcile');
      const details = await getDetails(tenantId, envelopeId);
      if (!details) fail('SIGNATURE_ENVELOPE_NOT_FOUND', 'Envelope não encontrado.');
      if (isTerminalEnvelopeStatus(details.envelope.status)) {
        return details.envelope; // idempotente
      }
      if (details.envelope.expiresAt && Date.parse(details.envelope.expiresAt) > clock.now().getTime()) {
        fail('INVALID_INPUT', 'Envelope ainda não venceu.');
      }
      const now = clock.nowIso();
      await tokens.revokeForEnvelope(envelopeId);
      for (const signer of details.signers) {
        if (signer.status === 'SIGNED') continue;
        if (canTransitionSignerStatus(signer.status, 'EXPIRED').allowed) {
          await signersRepo.update(tenantId, { ...signer, status: 'EXPIRED' });
        }
      }
      return envelopes.update(tenantId, {
        ...details.envelope,
        status: 'EXPIRED',
        updatedAt: now,
      }, details.envelope.rowVersion);
    },

    reconcileEnvelope: reconcile,

    async expireDueEnvelopes(tenantId: TenantId, actor: SignatureOperationActor) {
      assertFlags();
      requirePerm(actor, 'contract_signatures:reconcile');
      const items = await envelopes.list(tenantId);
      const expired: SignatureEnvelope[] = [];
      for (const envelope of items) {
        if (isTerminalEnvelopeStatus(envelope.status)) continue;
        if (envelope.expiresAt && Date.parse(envelope.expiresAt) <= clock.now().getTime()) {
          expired.push(await this.expireEnvelope(tenantId, envelope.id, actor));
        }
      }
      return expired;
    },
  };
}

export type SignatureEnvelopeApplicationService = ReturnType<
  typeof createSignatureEnvelopeApplicationService
>;
