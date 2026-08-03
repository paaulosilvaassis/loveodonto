/**
 * @module domain/contracts/signatures/signature-public-v2.harness
 * @description Harness técnico de assinatura pública v2 + delivery simulado — Phase 10.11.
 */

import type { SignatureDeliveryChannel } from './signature-delivery.types.js';
import type { SignatureEnvelope } from './signature.types.js';
import type { SignatureSigner } from './signature.types.js';
import type { SignatureDeliveryAttempt } from './signature-delivery.types.js';
import { createMemorySignatureDeliveryAttemptRepository } from './signature-delivery-memory.repository.js';
import { createDefaultLocalDeliveryProviders } from './signature-delivery.providers.js';
import { createSignatureInvitationService } from './signature-invitation.service.js';
import {
  createSignatureV2Harness,
  type SignatureV2HarnessOptions,
} from './signature-v2.harness.js';
import { demoSignerPatient } from '../fixtures/signature-v2.fixtures.js';

export interface SignaturePublicV2HarnessOptions extends SignatureV2HarnessOptions {
  /** Origem permitida para links públicos locais. */
  origin?: string;
}

export interface PrepareInviteFixtureInput {
  policyId?: string;
  channel?: SignatureDeliveryChannel;
  destination?: string;
  idempotencyKey?: string;
}

export interface PrepareInviteFixtureResult {
  envelope: SignatureEnvelope;
  signer: SignatureSigner;
  token?: string;
  tokenId: string;
  publicPath: string;
  publicLink: string;
  deliveryAttempt: SignatureDeliveryAttempt;
}

export async function createSignaturePublicV2Harness(
  options: SignaturePublicV2HarnessOptions = {},
) {
  const origin = options.origin || 'http://127.0.0.1:5173';
  const base = await createSignatureV2Harness(options);
  const deliveryRepo = createMemorySignatureDeliveryAttemptRepository();
  const harnessSecrets = new Map<string, { token?: string; plainCode?: string; linkPath?: string }>();
  const deliveryFailNext = { invitation: false, challenge: false };
  const deliveryProviders = createDefaultLocalDeliveryProviders({ failNext: deliveryFailNext });

  const invitationService = createSignatureInvitationService({
    tokenService: base.tokenService,
    deliveryRepo,
    clock: base.clock,
    harnessSecrets,
    providers: deliveryProviders,
  });

  async function prepareInviteFixture(
    input: PrepareInviteFixtureInput = {},
  ): Promise<PrepareInviteFixtureResult> {
    const policyId = input.policyId || 'pol_demo_otp';
    const channel = input.channel || 'TECHNICAL_HARNESS';
    const created = await base.envelopeService.createEnvelope(base.tenantId, {
      contractId: base.contract.id,
      signaturePolicyId: policyId,
      signers: [{
        ...demoSignerPatient,
        allowedMethods: [...demoSignerPatient.allowedMethods],
      }],
      idempotencyKey: input.idempotencyKey || `invite_fixture_${Date.now()}`,
    }, base.actor);

    const readyEnvelope = await base.envelopeService.markReady(
      base.tenantId,
      created.envelope.id,
      base.actor,
    );
    const signer = created.signers[0];
    const expiresAt = readyEnvelope.expiresAt
      || new Date(Date.parse(base.clock.nowIso()) + 72 * 3600_000).toISOString();

    const invite = await invitationService.sendInvitation({
      tenantId: base.tenantId,
      envelopeId: created.envelope.id,
      signerId: signer.id,
      channel,
      origin,
      expiresAt,
      destination: input.destination || demoSignerPatient.email,
      clinicDisplayName: 'Clínica Demo',
      documentTitle: base.contract.title,
      idempotencyKey: `inv_${created.envelope.id}_${Date.now()}`,
    });

    return {
      envelope: readyEnvelope,
      signer,
      token: invite.token,
      tokenId: invite.tokenId,
      publicPath: invite.publicPath,
      publicLink: `${origin}${invite.publicPath}`,
      deliveryAttempt: invite.deliveryAttempt,
    };
  }

  function getOtpFromHarness(challengeId: string): string | null {
    return harnessSecrets.get(`otp:${challengeId}`)?.plainCode || null;
  }

  function getInviteToken(tokenId: string): string | null {
    return harnessSecrets.get(`invite:${tokenId}`)?.token || null;
  }

  return {
    ...base,
    origin,
    deliveryRepo,
    invitationService,
    harnessSecrets,
    deliveryFailNext,
    prepareInviteFixture,
    getOtpFromHarness,
    getInviteToken,
  };
}

export type SignaturePublicV2Harness = Awaited<ReturnType<typeof createSignaturePublicV2Harness>>;
