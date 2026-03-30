import {
  BOLETO_CHARGE_STATUS,
  processBoletoProviderWebhook,
  syncBoletoChargeStatusFromProvider,
  syncOpenBoletoChargesFromProvider,
} from './boletoChargesService.js';
import { executeReceivementFlow } from './financingOperationalFlowsService.js';
import { listFinancingInstallments } from './financingInstallmentsService.js';

const settleFromChargeIfNeeded = (user, charge) => {
  if (!charge || charge.status !== BOLETO_CHARGE_STATUS.PAID) {
    return { settled: false, reason: 'status_not_paid' };
  }
  const installment = charge.installment_id
    ? listFinancingInstallments({}).find((item) => item.id === charge.installment_id)
    : null;
  if (!installment) return { settled: false, reason: 'installment_not_found' };
  const remaining = Number(installment.remaining_amount || 0);
  if (remaining <= 0) return { settled: false, reason: 'already_settled' };
  executeReceivementFlow(user, {
    installment_id: installment.id,
    payment_date: charge.paid_at ? String(charge.paid_at).slice(0, 10) : new Date().toISOString().slice(0, 10),
    amount_received: remaining,
    payment_method: 'boleto',
    notes: 'Baixa automática por confirmação do provider.',
  });
  return { settled: true, installment_id: installment.id, amount_settled: remaining };
};

export const syncBoletoAndApplyFinancialFlow = (user, chargeId, providerPayload = null) => {
  const sync = syncBoletoChargeStatusFromProvider(user, chargeId, providerPayload);
  const settlement = settleFromChargeIfNeeded(user, sync.charge);
  return {
    ...sync,
    settlement,
  };
};

export const syncOpenBoletosAndApplyFinancialFlow = (user, options = {}) => {
  const syncResults = syncOpenBoletoChargesFromProvider(user, options);
  return syncResults.map((entry) => ({
    ...entry,
    settlement: settleFromChargeIfNeeded(user, entry.charge),
  }));
};

export const processProviderWebhookAndApplyFlow = (user, payload = {}) => {
  const webhookResult = processBoletoProviderWebhook(user, payload);
  if (!webhookResult.matched) {
    return {
      ...webhookResult,
      settlement: { settled: false, reason: 'charge_not_matched' },
    };
  }
  return {
    ...webhookResult,
    settlement: settleFromChargeIfNeeded(user, webhookResult.charge),
  };
};
