/**
 * @module domain/contracts/signatures/signature-delivery.providers
 * @description Providers simulados — Phase 10.11.
 * Nenhuma chamada externa.
 */

import { createContractDomainError } from '../contract.errors.js';
import type {
  SendSignatureChallengeInput,
  SendSignatureCompletionNoticeInput,
  SendSignatureInvitationInput,
  SignatureDeliveryProvider,
  SignatureDeliveryResult,
} from './signature-delivery.types.js';

function simulatedOk(
  provider: string,
  harnessPayload?: SignatureDeliveryResult['harnessPayload'],
): SignatureDeliveryResult {
  return {
    ok: true,
    simulated: true,
    provider,
    providerMessageId: `sim_${provider}_${Date.now().toString(36)}`,
    status: 'SIMULATED',
    harnessPayload,
  };
}

function simulatedFail(provider: string, failureCode: string): SignatureDeliveryResult {
  return {
    ok: false,
    simulated: true,
    provider,
    providerMessageId: `fail_${provider}_${Date.now().toString(36)}`,
    status: 'FAILED',
    failureCode,
  };
}

/** Harness técnico local — único canal que pode carregar OTP/link em memória de teste. */
export function createTechnicalHarnessDeliveryProvider(options: {
  failNext?: { invitation?: boolean; challenge?: boolean };
} = {}): SignatureDeliveryProvider {
  const failNext = options.failNext || {};
  return {
    name: 'technical-harness',
    channels: ['TECHNICAL_HARNESS', 'IN_PERSON'],
    async sendInvitation(input: SendSignatureInvitationInput) {
      if (failNext.invitation) {
        failNext.invitation = false;
        return simulatedFail('technical-harness', 'SIGNATURE_DELIVERY_FAILED');
      }
      // Link existe só nesta chamada — não retornar o valor completo para persistência
      void input.publicLink;
      return simulatedOk('technical-harness', { linkPresent: true });
    },
    async sendAuthenticationChallenge(input: SendSignatureChallengeInput) {
      if (failNext.challenge) {
        failNext.challenge = false;
        return simulatedFail('technical-harness', 'SIGNATURE_DELIVERY_FAILED');
      }
      return simulatedOk('technical-harness', {
        plainCode: input.testOnlyPlainCode,
      });
    },
    async sendCompletionNotice(_input: SendSignatureCompletionNoticeInput) {
      return simulatedOk('technical-harness');
    },
  };
}

/** E-mail simulado — sem HTTP externo. */
export function createSimulatedEmailDeliveryProvider(): SignatureDeliveryProvider {
  return {
    name: 'simulated-email',
    channels: ['EMAIL'],
    async sendInvitation(input) {
      void input.publicLink;
      return simulatedOk('simulated-email', { linkPresent: true });
    },
    async sendAuthenticationChallenge(input) {
      // Nunca inclui OTP no resultado (somente harness técnico)
      void input.testOnlyPlainCode;
      return simulatedOk('simulated-email');
    },
    async sendCompletionNotice() {
      return simulatedOk('simulated-email');
    },
  };
}

/** SMS simulado — sem HTTP externo. */
export function createSimulatedSmsDeliveryProvider(): SignatureDeliveryProvider {
  return {
    name: 'simulated-sms',
    channels: ['SMS'],
    async sendInvitation(input) {
      void input.publicLink;
      return simulatedOk('simulated-sms', { linkPresent: true });
    },
    async sendAuthenticationChallenge(input) {
      void input.testOnlyPlainCode;
      return simulatedOk('simulated-sms');
    },
    async sendCompletionNotice() {
      return simulatedOk('simulated-sms');
    },
  };
}

export function createInPersonDeliveryProvider(): SignatureDeliveryProvider {
  return {
    name: 'in-person',
    channels: ['IN_PERSON'],
    async sendInvitation(input) {
      void input.publicLink;
      return simulatedOk('in-person', { linkPresent: true });
    },
    async sendAuthenticationChallenge() {
      return simulatedOk('in-person');
    },
    async sendCompletionNotice() {
      return simulatedOk('in-person');
    },
  };
}

export function resolveDeliveryProvider(
  channel: string,
  registry: SignatureDeliveryProvider[],
): SignatureDeliveryProvider {
  const found = registry.find((p) => p.channels.includes(channel as never));
  if (!found) {
    throw Object.assign(new Error('Provider de delivery indisponível.'), {
      domainError: createContractDomainError(
        'SIGNATURE_DELIVERY_PROVIDER_UNAVAILABLE',
        'Provider de delivery indisponível.',
        'channel',
      ),
      code: 'SIGNATURE_DELIVERY_PROVIDER_UNAVAILABLE',
    });
  }
  return found;
}

export function createDefaultLocalDeliveryProviders(options?: {
  failNext?: { invitation?: boolean; challenge?: boolean };
}): SignatureDeliveryProvider[] {
  return [
    createTechnicalHarnessDeliveryProvider(options),
    createInPersonDeliveryProvider(),
    createSimulatedEmailDeliveryProvider(),
    createSimulatedSmsDeliveryProvider(),
  ];
}
