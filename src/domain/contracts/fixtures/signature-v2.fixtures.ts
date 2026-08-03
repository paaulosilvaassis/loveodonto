/**
 * @module domain/contracts/fixtures/signature-v2.fixtures
 * @description Fixtures fictícias de assinatura — Phase 10.6.
 * Nenhum telefone, e-mail, documento ou clínica real.
 */

import type { TenantId } from '../contract.ids.js';
import type {
  SignatureEnvelope,
  SignaturePolicy,
  SignatureSigner,
} from '../signatures/signature.types.js';
import { DEMO_TENANT_ID } from './contract-v2.fixtures.js';

export const SIGNATURE_DEMO_TENANT_ID = DEMO_TENANT_ID;

export function createDemoSimplePolicy(tenantId: TenantId = DEMO_TENANT_ID): SignaturePolicy {
  return {
    id: 'pol_demo_simple' as never,
    tenantId,
    name: 'Política Simples Demo',
    signatureLevel: 'SIMPLE',
    allowedMethods: ['CLICK_ACCEPT', 'DRAWN_SIGNATURE', 'TYPED_CONFIRMATION'],
    requireOtp: false,
    requireEmailConfirmation: false,
    requireSmsConfirmation: false,
    requireDocumentCheck: false,
    requireSelfie: false,
    requireGeolocation: false,
    requireIp: false,
    requireIpAddress: false,
    requireWitness: false,
    requireWitnesses: false,
    signingOrder: 'ANY_ORDER',
    linkExpirationHours: 72,
    otpExpirationMinutes: 10,
    maxAuthenticationAttempts: 5,
    maxAttempts: 5,
    createdAt: '2026-08-03T12:00:00.000Z',
    updatedAt: '2026-08-03T12:00:00.000Z',
    rowVersion: 1,
  };
}

export function createDemoOtpPolicy(tenantId: TenantId = DEMO_TENANT_ID): SignaturePolicy {
  return {
    ...createDemoSimplePolicy(tenantId),
    id: 'pol_demo_otp' as never,
    name: 'Política OTP Demo',
    allowedMethods: ['OTP_EMAIL', 'OTP_SMS', 'CLICK_ACCEPT', 'DRAWN_SIGNATURE'],
    requireOtp: true,
    requireEmailConfirmation: true,
    signingOrder: 'ANY_ORDER',
  };
}

export function createDemoSequentialPolicy(tenantId: TenantId = DEMO_TENANT_ID): SignaturePolicy {
  return {
    ...createDemoSimplePolicy(tenantId),
    id: 'pol_demo_sequential' as never,
    name: 'Política Sequencial Demo',
    allowedMethods: ['CLICK_ACCEPT', 'DRAWN_SIGNATURE', 'OTP_EMAIL'],
    requireOtp: false,
    signingOrder: 'SEQUENTIAL',
  };
}

export const demoSignerPatient = {
  role: 'PATIENT',
  name: 'Paciente Demo Assinatura',
  email: 'paciente.assinatura.demo@example.com',
  phone: '(11) 90000-0001',
  signerOrder: 1,
  required: true,
  allowedMethods: ['CLICK_ACCEPT', 'DRAWN_SIGNATURE', 'OTP_EMAIL'] as const,
};

export const demoSignerResponsible = {
  role: 'FINANCIAL_RESPONSIBLE',
  name: 'Responsável Financeiro Demo',
  email: 'responsavel.assinatura.demo@example.com',
  phone: '(11) 90000-0002',
  signerOrder: 2,
  required: true,
  allowedMethods: ['CLICK_ACCEPT', 'OTP_EMAIL'] as const,
};

export const demoSignerProfessional = {
  role: 'PROFESSIONAL',
  name: 'Dra. Profissional Demo',
  email: 'profissional.assinatura.demo@example.com',
  signerOrder: 3,
  required: true,
  allowedMethods: ['CLICK_ACCEPT', 'TYPED_CONFIRMATION'] as const,
};

export const demoSignerClinicRep = {
  role: 'CLINIC_REPRESENTATIVE',
  name: 'Representante Clínica Demo',
  email: 'clinica.assinatura.demo@example.com',
  signerOrder: 4,
  required: false,
  allowedMethods: ['CLICK_ACCEPT'] as const,
};

export const demoWitnessA = {
  role: 'WITNESS',
  name: 'Testemunha Alpha Demo',
  email: 'testemunha.a.demo@example.com',
  signerOrder: 5,
  required: false,
  allowedMethods: ['CLICK_ACCEPT'] as const,
};

export const demoWitnessB = {
  role: 'WITNESS',
  name: 'Testemunha Beta Demo',
  email: 'testemunha.b.demo@example.com',
  signerOrder: 6,
  required: false,
  allowedMethods: ['CLICK_ACCEPT'] as const,
};

export function createDemoEnvelopeDraft(
  tenantId: TenantId = DEMO_TENANT_ID,
  overrides: Partial<SignatureEnvelope> = {},
): SignatureEnvelope {
  return {
    id: 'env_demo_draft' as never,
    tenantId,
    contractId: 'ctr_demo_approved' as never,
    contractVersionId: 'ver_demo_locked' as never,
    status: 'DRAFT',
    signaturePolicyId: 'pol_demo_simple' as never,
    provider: 'INTERNAL_V2',
    documentHashBeforeSigning: 'hash_demo_document_v1',
    expiresAt: '2026-08-10T12:00:00.000Z',
    createdBy: 'user_demo',
    createdAt: '2026-08-03T12:00:00.000Z',
    updatedAt: '2026-08-03T12:00:00.000Z',
    rowVersion: 1,
    ...overrides,
  };
}

export function createDemoEnvelopeSent(
  tenantId: TenantId = DEMO_TENANT_ID,
): SignatureEnvelope {
  return createDemoEnvelopeDraft(tenantId, {
    id: 'env_demo_sent' as never,
    status: 'SENT',
    sentAt: '2026-08-03T12:05:00.000Z',
  });
}

export function createDemoEnvelopePartial(
  tenantId: TenantId = DEMO_TENANT_ID,
): SignatureEnvelope {
  return createDemoEnvelopeDraft(tenantId, {
    id: 'env_demo_partial' as never,
    status: 'IN_PROGRESS',
    sentAt: '2026-08-03T12:05:00.000Z',
  });
}

export function createDemoEnvelopeCompleted(
  tenantId: TenantId = DEMO_TENANT_ID,
): SignatureEnvelope {
  return createDemoEnvelopeDraft(tenantId, {
    id: 'env_demo_completed' as never,
    status: 'COMPLETED',
    sentAt: '2026-08-03T12:05:00.000Z',
    completedAt: '2026-08-03T13:00:00.000Z',
    documentHashAfterSigning: 'hash_demo_document_v1',
  });
}

export function createDemoEnvelopeExpired(
  tenantId: TenantId = DEMO_TENANT_ID,
): SignatureEnvelope {
  return createDemoEnvelopeDraft(tenantId, {
    id: 'env_demo_expired' as never,
    status: 'EXPIRED',
    sentAt: '2026-08-01T12:00:00.000Z',
    expiresAt: '2026-08-02T12:00:00.000Z',
  });
}

export function createDemoEnvelopeDeclined(
  tenantId: TenantId = DEMO_TENANT_ID,
): SignatureEnvelope {
  return createDemoEnvelopeDraft(tenantId, {
    id: 'env_demo_declined' as never,
    status: 'DECLINED',
    sentAt: '2026-08-03T12:05:00.000Z',
  });
}

export function createDemoSignerPending(
  envelopeId: string,
  tenantId: TenantId = DEMO_TENANT_ID,
): SignatureSigner {
  return {
    id: 'sgn_demo_patient' as never,
    tenantId,
    envelopeId: envelopeId as never,
    signerOrder: 1,
    signerRole: 'PATIENT',
    name: demoSignerPatient.name,
    email: demoSignerPatient.email,
    phone: demoSignerPatient.phone,
    allowedMethods: [...demoSignerPatient.allowedMethods],
    status: 'PENDING',
    required: true,
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
  };
}

export const ALL_DEMO_SIGNER_INPUTS = [
  demoSignerPatient,
  demoSignerResponsible,
  demoSignerProfessional,
  demoSignerClinicRep,
  demoWitnessA,
  demoWitnessB,
];
