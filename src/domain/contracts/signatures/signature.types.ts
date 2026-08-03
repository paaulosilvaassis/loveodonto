/**
 * @module domain/contracts/signatures/signature.types
 * @description Tipos de assinatura V2 — Phase 10.2 + extensões Phase 10.6.
 */

import type {
  ContractFileId,
  ContractId,
  ContractVersionId,
  SignatureEnvelopeId,
  SignaturePolicyId,
  SignatureSignerId,
  TenantId,
} from '../contract.ids.js';

/** Classificação técnica do fluxo — não declaração automática de validade jurídica. */
export const SIGNATURE_LEVELS = [
  'SIMPLE',
  'ADVANCED',
  'QUALIFIED',
  'EXTERNAL_PROVIDER',
] as const;

export type SignatureLevel = (typeof SIGNATURE_LEVELS)[number];

export const SIGNATURE_METHODS = [
  'ON_SCREEN',
  'CLICK_ACCEPT',
  'DRAWN_SIGNATURE',
  'TYPED_CONFIRMATION',
  'OTP_EMAIL',
  'OTP_SMS',
  'SECURE_LINK',
  'UPLOAD',
  'EXTERNAL_PROVIDER',
  'DIGITAL_CERTIFICATE',
  'CERTIFICATE',
] as const;

export type SignatureMethod = (typeof SIGNATURE_METHODS)[number];

/** Métodos suportados na simulação interna Phase 10.6. */
export const INTERNAL_SIMULATED_SIGNATURE_METHODS: readonly SignatureMethod[] = [
  'CLICK_ACCEPT',
  'DRAWN_SIGNATURE',
  'TYPED_CONFIRMATION',
  'OTP_EMAIL',
  'OTP_SMS',
  'ON_SCREEN',
] as const;

export const UNAVAILABLE_SIGNATURE_METHODS: readonly SignatureMethod[] = [
  'CERTIFICATE',
  'DIGITAL_CERTIFICATE',
  'EXTERNAL_PROVIDER',
] as const;

export const SIGNATURE_ENVELOPE_STATUSES = [
  'DRAFT',
  'READY',
  'SENT',
  'IN_PROGRESS',
  'PARTIALLY_SIGNED',
  'COMPLETED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
  'FAILED',
] as const;

export type SignatureEnvelopeStatus = (typeof SIGNATURE_ENVELOPE_STATUSES)[number];

export const TERMINAL_SIGNATURE_ENVELOPE_STATUSES: readonly SignatureEnvelopeStatus[] = [
  'COMPLETED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
  'FAILED',
] as const;

export const SIGNATURE_SIGNER_STATUSES = [
  'PENDING',
  'INVITED',
  'DELIVERED',
  'VIEWED',
  'AUTHENTICATED',
  'SIGNED',
  'DECLINED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
] as const;

export type SignatureSignerStatus = (typeof SIGNATURE_SIGNER_STATUSES)[number];

export const SIGNATURE_SIGNER_ROLES = [
  'PATIENT',
  'LEGAL_GUARDIAN',
  'FINANCIAL_RESPONSIBLE',
  'PROFESSIONAL',
  'CLINIC_REPRESENTATIVE',
  'WITNESS',
  'INTERPRETER',
  'OTHER',
] as const;

export type SignatureSignerRole = (typeof SIGNATURE_SIGNER_ROLES)[number];

export const SIGNATURE_SIGNING_ORDERS = [
  'ANY_ORDER',
  'PARALLEL',
  'SEQUENTIAL',
  'GROUPED',
] as const;

export type SignatureSigningOrder = (typeof SIGNATURE_SIGNING_ORDERS)[number];

export const SIGNATURE_ACCEPTANCE_CODES = [
  'DOCUMENT_READ',
  'CONTENT_CONFIRMED',
  'PERSONAL_DATA_CONFIRMED',
  'SIGNATURE_INTENT_CONFIRMED',
  'LGPD_NOTICE_ACKNOWLEDGED',
  'CLINICAL_CONSENT_CONFIRMED',
  'CUSTOM',
] as const;

export type SignatureAcceptanceCode = (typeof SIGNATURE_ACCEPTANCE_CODES)[number];

export interface SignaturePolicy {
  id: SignaturePolicyId;
  tenantId: TenantId;
  name: string;
  signatureLevel: SignatureLevel;
  allowedMethods: SignatureMethod[];
  requireOtp: boolean;
  requireEmailConfirmation: boolean;
  requireSmsConfirmation: boolean;
  requireDocumentCheck: boolean;
  requireSelfie: boolean;
  requireGeolocation: boolean;
  /** Alias legado Phase 10.2. */
  requireIp: boolean;
  requireIpAddress: boolean;
  requireWitness: boolean;
  requireWitnesses: boolean;
  signingOrder: SignatureSigningOrder;
  linkExpirationHours: number;
  otpExpirationMinutes: number;
  maxAuthenticationAttempts: number;
  /** Alias legado. */
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
}

export interface SignatureArtifactReference {
  fileId?: ContractFileId;
  temporaryArtifactId?: string;
  sha256?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface SignatureRequiredAcceptance {
  id: string;
  code: SignatureAcceptanceCode | string;
  label: string;
  required: boolean;
  acceptedAt?: string;
  contentHash?: string;
}

export interface SignatureEvidenceSnapshot {
  envelopeId?: SignatureEnvelopeId;
  signerId?: SignatureSignerId;
  contractId?: ContractId;
  contractVersionId?: ContractVersionId;
  documentHash?: string;
  documentHashAtSign?: string;
  authenticationMethod?: SignatureMethod;
  authenticationCompletedAt?: string;
  authenticatedAt?: string;
  viewedAt?: string;
  signedAt?: string;
  declinedAt?: string;
  ipAddress?: string;
  userAgent?: string;
  geolocation?: string | {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  };
  acceptedTerms?: SignatureRequiredAcceptance[];
  signatureArtifact?: SignatureArtifactReference;
  sessionTokenId?: string;
  challengeId?: string;
  evidenceHash?: string;
  providerEvidenceRef?: string;
  notes?: string;
}

export interface SignatureSigner {
  id: SignatureSignerId;
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  partyId?: string;
  signerOrder: number;
  signerRole: string;
  name: string;
  email?: string;
  phone?: string;
  documentNumberHash?: string;
  authenticationMethod?: SignatureMethod;
  allowedMethods?: SignatureMethod[];
  status: SignatureSignerStatus;
  required: boolean;
  invitedAt?: string;
  deliveredAt?: string;
  viewedAt?: string;
  authenticatedAt?: string;
  signedAt?: string;
  declinedAt?: string;
  declineReason?: string;
  ipAddress?: string;
  userAgent?: string;
  geolocation?: string;
  signatureImageFileId?: ContractFileId;
  signatureArtifact?: SignatureArtifactReference;
  providerSignerId?: string;
  evidenceSnapshot?: SignatureEvidenceSnapshot;
  acceptedTerms?: SignatureRequiredAcceptance[];
  rowVersion?: number;
}

export interface SignatureEnvelope {
  id: SignatureEnvelopeId;
  tenantId: TenantId;
  contractId: ContractId;
  contractVersionId: ContractVersionId;
  status: SignatureEnvelopeStatus;
  signaturePolicyId?: SignaturePolicyId;
  provider: string;
  providerEnvelopeId?: string;
  sentAt?: string;
  expiresAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  documentHashBeforeSigning?: string;
  documentHashAfterSigning?: string;
  evidenceFileId?: ContractFileId;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  rowVersion?: number;
  metadata?: Record<string, unknown>;
}

export interface SignatureEnvelopeCompletionEffects {
  contractStatusTransitionRequired: boolean;
  signedPdfRequired: boolean;
  evidenceReportRequired: boolean;
  financialActivationRequired: boolean;
  prontuarioRegistrationRequired: boolean;
}

export function createDefaultCompletionEffects(): SignatureEnvelopeCompletionEffects {
  return {
    contractStatusTransitionRequired: true,
    signedPdfRequired: true,
    evidenceReportRequired: true,
    financialActivationRequired: false,
    prontuarioRegistrationRequired: false,
  };
}

export function isTerminalEnvelopeStatus(status: SignatureEnvelopeStatus): boolean {
  return (TERMINAL_SIGNATURE_ENVELOPE_STATUSES as readonly string[]).includes(status);
}

export function isMethodInternallySimulated(method: SignatureMethod): boolean {
  return (INTERNAL_SIMULATED_SIGNATURE_METHODS as readonly string[]).includes(method);
}

export function isMethodCapabilityUnavailable(method: SignatureMethod): boolean {
  return (UNAVAILABLE_SIGNATURE_METHODS as readonly string[]).includes(method);
}

export function normalizeSigningOrder(order: SignatureSigningOrder): 'ANY_ORDER' | 'SEQUENTIAL' {
  if (order === 'SEQUENTIAL') return 'SEQUENTIAL';
  // PARALLEL e GROUPED tratados como ANY_ORDER nesta fase
  return 'ANY_ORDER';
}
