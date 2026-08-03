/**
 * @module domain/contracts/completion/contract-signed-effects.policy
 * @description Policy pura de efeitos pendentes — Phase 10.8.
 * Nenhum efeito é executado.
 */

import type { Contract } from '../contract.types.js';
import type { ContractFileArtifact } from '../files/contract-file.types.js';

export interface ContractPendingEffect {
  required: boolean;
  ready: boolean;
  executed: false;
  idempotencyKey: string;
  reason?: string;
}

export interface ContractSignedPendingEffects {
  financialActivation: ContractPendingEffect;
  prontuarioRegistration: ContractPendingEffect;
  patientJourneyRegistration: ContractPendingEffect;
  crmRegistration: ContractPendingEffect;
  patientDelivery: ContractPendingEffect;
  notificationDispatch: ContractPendingEffect;
  analyticsRegistration: ContractPendingEffect;
}

function effect(
  required: boolean,
  ready: boolean,
  key: string,
  reason?: string,
): ContractPendingEffect {
  return {
    required,
    ready: required ? ready : false,
    executed: false,
    idempotencyKey: key,
    reason,
  };
}

export function deriveContractSignedPendingEffects(input: {
  contract: Contract;
  signed: boolean;
  signedPdf?: ContractFileArtifact | null;
  hasFinancialSnapshot: boolean;
  hasClinicalConsent: boolean;
}): ContractSignedPendingEffects {
  const cid = input.contract.id;
  const signed = Boolean(input.signed);

  const financialRequired = input.hasFinancialSnapshot;
  const prontuarioRequired = input.hasClinicalConsent
    || input.contract.documentType === 'INFORMED_CONSENT'
    || input.contract.documentType === 'SERVICE_CONTRACT';
  const crmRequired = String(input.contract.origin || '').toUpperCase().includes('CRM')
    || String(input.contract.origin || '') === 'CRM';
  const deliveryRequired = Boolean(input.signedPdf);

  return {
    financialActivation: effect(
      financialRequired,
      signed && financialRequired,
      `fx_fin_${cid}`,
      financialRequired ? undefined : 'Sem financialSnapshot',
    ),
    prontuarioRegistration: effect(
      prontuarioRequired,
      signed && prontuarioRequired,
      `fx_pront_${cid}`,
    ),
    patientJourneyRegistration: effect(
      true,
      signed,
      `fx_journey_${cid}`,
    ),
    crmRegistration: effect(
      crmRequired,
      signed && crmRequired,
      `fx_crm_${cid}`,
      crmRequired ? undefined : 'Origin não CRM',
    ),
    patientDelivery: effect(
      deliveryRequired,
      signed && Boolean(input.signedPdf?.id),
      `fx_delivery_${cid}`,
    ),
    notificationDispatch: effect(
      true,
      signed,
      `fx_notify_${cid}`,
      'Notificações permanecem não executadas',
    ),
    analyticsRegistration: effect(
      true,
      signed,
      `fx_analytics_${cid}`,
    ),
  };
}
