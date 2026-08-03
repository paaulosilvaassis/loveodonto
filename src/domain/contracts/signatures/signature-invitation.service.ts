/**
 * @module domain/contracts/signatures/signature-invitation.service
 * @description Convite + reenvio com delivery simulado — Phase 10.11.
 */

import { createContractDomainError } from '../contract.errors.js';
import type { SignatureEnvelopeId, SignatureSignerId, TenantId } from '../contract.ids.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import type { SigningSessionTokenService } from './signing-session-token.service.js';
import type { SignatureDeliveryAttemptRepository } from './signature-delivery.repository.js';
import {
  createDefaultLocalDeliveryProviders,
  resolveDeliveryProvider,
} from './signature-delivery.providers.js';
import {
  DEFAULT_RESEND_INVITATION_POLICY,
  maskDestination,
  type ResendSignatureInvitationPolicy,
  type SignatureDeliveryAttempt,
  type SignatureDeliveryChannel,
  type SignatureDeliveryProvider,
} from './signature-delivery.types.js';

export interface BuildPublicSigningLinkInput {
  origin: string;
  token: string;
}

export interface SendSignatureInvitationServiceInput {
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  signerId: SignatureSignerId;
  channel: SignatureDeliveryChannel;
  origin: string;
  expiresAt: string;
  destination?: string;
  clinicDisplayName?: string;
  documentTitle?: string;
  idempotencyKey: string;
  revokePreviousSessionTokenId?: string;
}

export interface SendSignatureInvitationServiceResult {
  deliveryAttempt: SignatureDeliveryAttempt;
  tokenId: string;
  /** Token bruto — somente harness técnico; nunca logar/persistir. */
  token?: string;
  publicPath: string;
  simulated: true;
}

const ALLOWED_LOCAL_ORIGINS = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
]);

export function assertAllowedPublicSigningOrigin(origin: string): string {
  const raw = String(origin || '').trim().replace(/\/$/, '');
  if (!raw || !ALLOWED_LOCAL_ORIGINS.has(raw)) {
    // Também aceita 127.0.0.1/localhost com qualquer porta em modo local explícito
    try {
      const u = new URL(raw);
      const hostOk = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
      if (hostOk && (u.protocol === 'http:' || u.protocol === 'https:')) {
        return raw;
      }
    } catch {
      // fallthrough
    }
    throw Object.assign(new Error('Origem não permitida.'), {
      domainError: createContractDomainError(
        'SIGNATURE_PUBLIC_ORIGIN_NOT_ALLOWED',
        'Origem não permitida para link público local.',
        'origin',
      ),
      code: 'SIGNATURE_PUBLIC_ORIGIN_NOT_ALLOWED',
    });
  }
  return raw;
}

export function buildPublicSigningLink(input: BuildPublicSigningLinkInput): {
  publicPath: string;
  publicLink: string;
} {
  const origin = assertAllowedPublicSigningOrigin(input.origin);
  const token = String(input.token || '').trim();
  if (!token || token.includes('/') || token.includes('?') || token.includes('#')) {
    throw Object.assign(new Error('Token inválido para link.'), {
      domainError: createContractDomainError(
        'SIGNATURE_PUBLIC_ACCESS_DENIED',
        'Não foi possível acessar esta solicitação de assinatura.',
      ),
      code: 'SIGNATURE_PUBLIC_ACCESS_DENIED',
    });
  }
  const publicPath = `/assinar/v2/${token}`;
  return { publicPath, publicLink: `${origin}${publicPath}` };
}

export function createSignatureInvitationService(deps: {
  tokenService: SigningSessionTokenService;
  deliveryRepo: SignatureDeliveryAttemptRepository;
  providers?: SignatureDeliveryProvider[];
  clock?: ContractClock;
  resendPolicy?: Partial<ResendSignatureInvitationPolicy>;
  /** Armazena OTP/link só em memória de harness (não persistido). */
  harnessSecrets?: Map<string, { token?: string; plainCode?: string; linkPath?: string }>;
}) {
  const clock = deps.clock || createSystemContractClock();
  const providers = deps.providers || createDefaultLocalDeliveryProviders();
  const policy: ResendSignatureInvitationPolicy = {
    ...DEFAULT_RESEND_INVITATION_POLICY,
    ...(deps.resendPolicy || {}),
  };
  const harnessSecrets = deps.harnessSecrets || new Map();

  return {
    getResendPolicy: () => ({ ...policy }),
    getHarnessSecret: (key: string) => harnessSecrets.get(key) || null,

    async sendInvitation(
      input: SendSignatureInvitationServiceInput,
    ): Promise<SendSignatureInvitationServiceResult> {
      const existing = await deps.deliveryRepo.findByIdempotencyKey(
        input.tenantId,
        input.idempotencyKey,
      );
      if (existing) {
        const secret = harnessSecrets.get(`invite:${String(existing.metadata.tokenId || '')}`);
        return {
          deliveryAttempt: existing,
          tokenId: String(existing.metadata.tokenId || ''),
          publicPath: secret?.linkPath || '/assinar/v2/',
          token: secret?.token,
          simulated: true,
        };
      }

      const priorCount = await deps.deliveryRepo.countBySignerPurpose(
        input.tenantId,
        input.signerId,
        'INVITATION',
      );
      if (priorCount >= policy.maximumResends) {
        throw Object.assign(new Error('Reenvio não permitido.'), {
          domainError: createContractDomainError(
            'SIGNATURE_INVITATION_RESEND_NOT_ALLOWED',
            'Limite de reenvios atingido.',
          ),
          code: 'SIGNATURE_INVITATION_RESEND_NOT_ALLOWED',
        });
      }

      const latest = await deps.deliveryRepo.findLatestBySignerPurpose(
        input.tenantId,
        input.signerId,
        'INVITATION',
      );
      if (latest && priorCount > 0) {
        const elapsed = (clock.now().getTime() - Date.parse(latest.requestedAt)) / 1000;
        if (elapsed < policy.minimumIntervalSeconds) {
          throw Object.assign(new Error('Intervalo mínimo de reenvio.'), {
            domainError: createContractDomainError(
              'SIGNATURE_DELIVERY_RATE_LIMITED',
              'Aguarde antes de reenviar.',
            ),
            code: 'SIGNATURE_DELIVERY_RATE_LIMITED',
          });
        }
      }

      if (policy.revokePreviousSession && input.revokePreviousSessionTokenId) {
        await deps.tokenService.revoke(input.revokePreviousSessionTokenId);
      }

      const issued = await deps.tokenService.issue({
        tenantId: input.tenantId,
        envelopeId: input.envelopeId,
        signerId: input.signerId,
        expiresAt: input.expiresAt,
      });

      const { publicPath, publicLink } = buildPublicSigningLink({
        origin: input.origin,
        token: issued.token,
      });

      const provider = resolveDeliveryProvider(input.channel, providers);
      const delivery = await provider.sendInvitation({
        tenantId: input.tenantId,
        envelopeId: input.envelopeId,
        signerId: input.signerId,
        channel: input.channel,
        publicLink,
        destinationMasked: maskDestination(input.destination),
        clinicDisplayName: input.clinicDisplayName,
        documentTitle: input.documentTitle,
        idempotencyKey: input.idempotencyKey,
        attemptNumber: priorCount + 1,
      });

      const now = clock.nowIso();
      const attempt = await deps.deliveryRepo.create({
        tenantId: input.tenantId,
        envelopeId: input.envelopeId,
        signerId: input.signerId,
        channel: input.channel,
        purpose: 'INVITATION',
        destinationMasked: maskDestination(input.destination),
        status: delivery.status,
        provider: delivery.provider,
        providerMessageId: delivery.providerMessageId,
        idempotencyKey: input.idempotencyKey,
        attemptNumber: priorCount + 1,
        requestedAt: now,
        completedAt: delivery.ok ? now : undefined,
        failedAt: delivery.ok ? undefined : now,
        failureCode: delivery.failureCode,
        metadata: {
          tokenId: issued.tokenId,
          // Nunca persistir path com token — apenas prefixo seguro
          publicPathPrefix: '/assinar/v2/',
          linkPresent: true,
          simulated: true,
        },
      });

      harnessSecrets.set(`invite:${issued.tokenId}`, {
        token: issued.token,
        linkPath: publicPath,
      });

      if (!delivery.ok) {
        throw Object.assign(new Error('Delivery simulado falhou.'), {
          domainError: createContractDomainError(
            'SIGNATURE_DELIVERY_FAILED',
            'Falha na entrega simulada.',
          ),
          code: 'SIGNATURE_DELIVERY_FAILED',
          deliveryAttempt: attempt,
        });
      }

      return {
        deliveryAttempt: attempt,
        tokenId: issued.tokenId,
        token: issued.token,
        publicPath,
        simulated: true,
      };
    },

    async recordChallengeDelivery(input: {
      tenantId: TenantId;
      envelopeId: SignatureEnvelopeId;
      signerId: SignatureSignerId;
      channel: SignatureDeliveryChannel;
      challengeId: string;
      destination?: string;
      testOnlyPlainCode?: string;
      idempotencyKey: string;
    }) {
      const existing = await deps.deliveryRepo.findByIdempotencyKey(
        input.tenantId,
        input.idempotencyKey,
      );
      if (existing) return { deliveryAttempt: existing, harnessPlainCode: undefined };

      const provider = resolveDeliveryProvider(input.channel, providers);
      const prior = await deps.deliveryRepo.countBySignerPurpose(
        input.tenantId,
        input.signerId,
        'AUTHENTICATION_CHALLENGE',
      );
      const delivery = await provider.sendAuthenticationChallenge({
        tenantId: input.tenantId,
        envelopeId: input.envelopeId,
        signerId: input.signerId,
        channel: input.channel,
        destinationMasked: maskDestination(input.destination),
        testOnlyPlainCode: input.testOnlyPlainCode,
        challengeId: input.challengeId,
        idempotencyKey: input.idempotencyKey,
        attemptNumber: prior + 1,
      });

      const now = clock.nowIso();
      const attempt = await deps.deliveryRepo.create({
        tenantId: input.tenantId,
        envelopeId: input.envelopeId,
        signerId: input.signerId,
        channel: input.channel,
        purpose: 'AUTHENTICATION_CHALLENGE',
        destinationMasked: maskDestination(input.destination),
        status: delivery.status,
        provider: delivery.provider,
        providerMessageId: delivery.providerMessageId,
        idempotencyKey: input.idempotencyKey,
        attemptNumber: prior + 1,
        requestedAt: now,
        completedAt: delivery.ok ? now : undefined,
        failedAt: delivery.ok ? undefined : now,
        failureCode: delivery.failureCode,
        metadata: {
          challengeId: input.challengeId,
          simulated: true,
        },
      });

      if (delivery.harnessPayload?.plainCode) {
        harnessSecrets.set(`otp:${input.challengeId}`, {
          plainCode: delivery.harnessPayload.plainCode,
        });
      }

      return {
        deliveryAttempt: attempt,
        harnessPlainCode: delivery.harnessPayload?.plainCode,
      };
    },
  };
}

export type SignatureInvitationService = ReturnType<typeof createSignatureInvitationService>;
