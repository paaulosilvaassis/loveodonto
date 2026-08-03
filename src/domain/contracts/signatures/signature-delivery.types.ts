/**
 * @module domain/contracts/signatures/signature-delivery.types
 * @description Delivery abstrato de assinatura — Phase 10.11.
 * Sem envio real de e-mail/SMS/WhatsApp.
 */

import type {
  SignatureEnvelopeId,
  SignatureSignerId,
  TenantId,
} from '../contract.ids.js';

export type SignatureDeliveryAttemptId = string & { readonly __brand: 'SignatureDeliveryAttemptId' };

export const SIGNATURE_DELIVERY_CHANNELS = [
  'EMAIL',
  'SMS',
  'WHATSAPP',
  'IN_PERSON',
  'TECHNICAL_HARNESS',
] as const;

export type SignatureDeliveryChannel = (typeof SIGNATURE_DELIVERY_CHANNELS)[number];

export const SIGNATURE_DELIVERY_PURPOSES = [
  'INVITATION',
  'AUTHENTICATION_CHALLENGE',
  'COMPLETION_NOTICE',
] as const;

export type SignatureDeliveryPurpose = (typeof SIGNATURE_DELIVERY_PURPOSES)[number];

export const SIGNATURE_DELIVERY_STATUSES = [
  'PENDING',
  'SIMULATED',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
] as const;

export type SignatureDeliveryStatus = (typeof SIGNATURE_DELIVERY_STATUSES)[number];

export interface SignatureDeliveryAttempt {
  id: SignatureDeliveryAttemptId;
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  signerId: SignatureSignerId;
  channel: SignatureDeliveryChannel;
  purpose: SignatureDeliveryPurpose;
  destinationMasked?: string;
  status: SignatureDeliveryStatus;
  provider: string;
  providerMessageId?: string;
  idempotencyKey: string;
  attemptNumber: number;
  requestedAt: string;
  completedAt?: string;
  failedAt?: string;
  failureCode?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  rowVersion: number;
}

export interface SendSignatureInvitationInput {
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  signerId: SignatureSignerId;
  channel: SignatureDeliveryChannel;
  /** Link completo — apenas em memória durante a chamada; nunca persistir. */
  publicLink: string;
  destinationMasked?: string;
  clinicDisplayName?: string;
  documentTitle?: string;
  idempotencyKey: string;
  attemptNumber: number;
}

export interface SendSignatureChallengeInput {
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  signerId: SignatureSignerId;
  channel: SignatureDeliveryChannel;
  destinationMasked?: string;
  /** OTP bruto — somente harness; nunca persistir/logar. */
  testOnlyPlainCode?: string;
  challengeId: string;
  idempotencyKey: string;
  attemptNumber: number;
}

export interface SendSignatureCompletionNoticeInput {
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  signerId: SignatureSignerId;
  channel: SignatureDeliveryChannel;
  destinationMasked?: string;
  idempotencyKey: string;
  attemptNumber: number;
}

export interface SignatureDeliveryResult {
  ok: boolean;
  simulated: true;
  provider: string;
  providerMessageId: string;
  status: Extract<SignatureDeliveryStatus, 'SIMULATED' | 'FAILED'>;
  failureCode?: string;
  /** Somente TECHNICAL_HARNESS — nunca em resposta pública HTTP. */
  harnessPayload?: {
    plainCode?: string;
    linkPresent?: boolean;
  };
}

export interface SignatureDeliveryProvider {
  readonly name: string;
  readonly channels: SignatureDeliveryChannel[];

  sendInvitation(input: SendSignatureInvitationInput): Promise<SignatureDeliveryResult>;
  sendAuthenticationChallenge(
    input: SendSignatureChallengeInput,
  ): Promise<SignatureDeliveryResult>;
  sendCompletionNotice(
    input: SendSignatureCompletionNoticeInput,
  ): Promise<SignatureDeliveryResult>;
}

export interface ResendSignatureInvitationPolicy {
  revokePreviousSession: boolean;
  createNewSession: boolean;
  maximumResends: number;
  minimumIntervalSeconds: number;
}

export const DEFAULT_RESEND_INVITATION_POLICY: ResendSignatureInvitationPolicy = {
  revokePreviousSession: true,
  createNewSession: true,
  maximumResends: 5,
  minimumIntervalSeconds: 60,
};

/** Mascara destination sem persistir valor integral. */
export function maskDestination(value: string | undefined | null): string | undefined {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  if (raw.includes('@')) {
    const [user, domain] = raw.split('@');
    const u = user.length <= 2 ? '*' : `${user.slice(0, 1)}***${user.slice(-1)}`;
    return `${u}@${domain}`;
  }
  if (raw.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`;
}
