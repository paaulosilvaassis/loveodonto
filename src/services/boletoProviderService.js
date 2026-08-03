import { createId } from './helpers.js';
import { BOLETO_CHARGE_STATUS } from './auditEventCatalog.js';

export const BOLETO_PROVIDER = {
  MANUAL: 'manual',
  ASAAS: 'asaas',
  FUTURE_OTHER_PROVIDER: 'future_other_provider',
};

const toMoneyTag = (value) =>
  String(Number(value || 0).toFixed(2)).replace('.', '').padStart(10, '0');

const fakeBarcode = (amount, dueDate) => {
  const duePart = String((dueDate || '').replaceAll('-', '')).slice(2).padEnd(8, '0');
  const amountPart = toMoneyTag(amount);
  const randomPart = String(Date.now()).slice(-10);
  return `34191${duePart}${amountPart}${randomPart}`.slice(0, 44).padEnd(44, '0');
};

const toLinhaDigitavel = (barcode) => {
  if (!barcode) return '';
  const clean = String(barcode).replace(/\D/g, '');
  return `${clean.slice(0, 5)}.${clean.slice(5, 10)} ${clean.slice(10, 15)}.${clean.slice(15, 21)} ${clean.slice(21, 26)}.${clean.slice(26, 32)} ${clean.slice(32, 33)} ${clean.slice(33, 47)}`.trim();
};

const normalizeProviderStatus = (value) => {
  const raw = String(value || '').toLowerCase().trim();
  const map = {
    pending: BOLETO_CHARGE_STATUS.GENERATED,
    waiting_payment: BOLETO_CHARGE_STATUS.GENERATED,
    generated: BOLETO_CHARGE_STATUS.GENERATED,
    sent: BOLETO_CHARGE_STATUS.SENT,
    viewed: BOLETO_CHARGE_STATUS.VIEWED,
    confirmed: BOLETO_CHARGE_STATUS.PAID,
    received: BOLETO_CHARGE_STATUS.PAID,
    paid: BOLETO_CHARGE_STATUS.PAID,
    overdue: BOLETO_CHARGE_STATUS.OVERDUE,
    canceled: BOLETO_CHARGE_STATUS.CANCELED,
    cancelled: BOLETO_CHARGE_STATUS.CANCELED,
    failed: BOLETO_CHARGE_STATUS.FAILED,
  };
  return map[raw] || null;
};

const manualProvider = {
  key: BOLETO_PROVIDER.MANUAL,
  createCharge(payload) {
    const chargeId = createId('bltman');
    const barcode = payload.barcode || fakeBarcode(payload.amount, payload.due_date);
    return {
      external_provider: BOLETO_PROVIDER.MANUAL,
      external_charge_id: payload.external_charge_id || chargeId,
      boleto_number: payload.boleto_number || `BOL-${String(Date.now()).slice(-8)}`,
      nosso_numero: payload.nosso_numero || String(Date.now()).slice(-10),
      barcode,
      linha_digitavel: payload.linha_digitavel || toLinhaDigitavel(barcode),
      boleto_url: payload.boleto_url || '',
      invoice_url: payload.invoice_url || '',
      status: payload.status || BOLETO_CHARGE_STATUS.GENERATED,
    };
  },
  createInstallmentCharges({ installments, basePayload }) {
    return (installments || []).map((installment) => this.createCharge({
      ...basePayload,
      due_date: installment.due_date,
      amount: installment.net_amount,
    }));
  },
  getCharge(charge) {
    return { ...charge };
  },
  syncChargeStatus(charge, status) {
    const normalized = normalizeProviderStatus(status) || charge.status;
    return {
      ...charge,
      status: normalized,
      provider_status: status || normalized,
      provider_payload: {
        provider: BOLETO_PROVIDER.MANUAL,
        synced_at: new Date().toISOString(),
      },
    };
  },
  getBoletoAssets(charge) {
    return {
      barcode: charge.barcode || '',
      linha_digitavel: charge.linha_digitavel || '',
      boleto_url: charge.boleto_url || '',
      invoice_url: charge.invoice_url || '',
    };
  },
  generateSecondCopy(charge) {
    return {
      ...charge,
      status: charge.status === BOLETO_CHARGE_STATUS.CANCELED
        ? BOLETO_CHARGE_STATUS.CANCELED
        : BOLETO_CHARGE_STATUS.GENERATED,
      boleto_url: charge.boleto_url || '',
      invoice_url: charge.invoice_url || '',
    };
  },
  cancelCharge(charge) {
    return {
      ...charge,
      status: BOLETO_CHARGE_STATUS.CANCELED,
      canceled_at: new Date().toISOString(),
    };
  },
  normalizeWebhookEvent(payload = {}) {
    return {
      external_charge_id: payload?.external_charge_id || payload?.charge_id || null,
      status: normalizeProviderStatus(payload?.status) || null,
      provider_status: payload?.status || null,
      paid_at: payload?.paid_at || null,
      due_date: payload?.due_date || null,
      amount: Number(payload?.amount || 0) || null,
      metadata: payload?.metadata || {},
      raw_payload: payload,
    };
  },
};

const asaasProvider = {
  key: BOLETO_PROVIDER.ASAAS,
  createCharge(payload) {
    const chargeId = createId('asaas');
    const barcode = payload.barcode || fakeBarcode(payload.amount, payload.due_date);
    return {
      external_provider: BOLETO_PROVIDER.ASAAS,
      external_charge_id: payload.external_charge_id || chargeId,
      boleto_number: payload.boleto_number || `ASA-${String(Date.now()).slice(-8)}`,
      nosso_numero: payload.nosso_numero || String(Date.now()).slice(-10),
      barcode,
      linha_digitavel: payload.linha_digitavel || toLinhaDigitavel(barcode),
      boleto_url: payload.boleto_url || payload.payment_url || '',
      invoice_url: payload.invoice_url || payload.invoiceUrl || '',
      status: normalizeProviderStatus(payload.status) || BOLETO_CHARGE_STATUS.GENERATED,
      provider_payload: {
        provider: BOLETO_PROVIDER.ASAAS,
        mode: 'fallback_stub',
      },
    };
  },
  createInstallmentCharges({ installments, basePayload }) {
    return (installments || []).map((installment) => this.createCharge({
      ...basePayload,
      due_date: installment.due_date,
      amount: installment.net_amount,
    }));
  },
  getCharge(charge) {
    return { ...charge };
  },
  syncChargeStatus(charge, status) {
    const normalized = normalizeProviderStatus(status) || charge.status;
    return {
      ...charge,
      status: normalized,
      provider_status: status || normalized,
      provider_payload: {
        provider: BOLETO_PROVIDER.ASAAS,
        synced_at: new Date().toISOString(),
      },
    };
  },
  getBoletoAssets(charge) {
    return {
      barcode: charge.barcode || '',
      linha_digitavel: charge.linha_digitavel || '',
      boleto_url: charge.boleto_url || '',
      invoice_url: charge.invoice_url || '',
    };
  },
  generateSecondCopy(charge) {
    return {
      ...charge,
      status: charge.status === BOLETO_CHARGE_STATUS.CANCELED
        ? BOLETO_CHARGE_STATUS.CANCELED
        : BOLETO_CHARGE_STATUS.GENERATED,
      boleto_url: charge.boleto_url || '',
      invoice_url: charge.invoice_url || '',
    };
  },
  cancelCharge(charge) {
    return {
      ...charge,
      status: BOLETO_CHARGE_STATUS.CANCELED,
      canceled_at: new Date().toISOString(),
    };
  },
  normalizeWebhookEvent(payload = {}) {
    return {
      external_charge_id: payload?.payment?.id || payload?.id || payload?.external_charge_id || null,
      status: normalizeProviderStatus(payload?.event || payload?.status || payload?.payment?.status) || null,
      provider_status: payload?.event || payload?.status || payload?.payment?.status || null,
      paid_at: payload?.payment?.clientPaymentDate || payload?.paid_at || null,
      due_date: payload?.payment?.dueDate || payload?.due_date || null,
      amount: Number(payload?.payment?.value || payload?.amount || 0) || null,
      metadata: {
        event: payload?.event || null,
      },
      raw_payload: payload,
    };
  },
};

const providersMap = {
  [BOLETO_PROVIDER.MANUAL]: manualProvider,
  [BOLETO_PROVIDER.ASAAS]: asaasProvider,
};

export const getBoletoProvider = (providerKey) =>
  providersMap[providerKey] || manualProvider;

export const boletoProviderService = {
  createCharge(providerKey, payload) {
    return getBoletoProvider(providerKey).createCharge(payload);
  },
  createInstallmentCharges(providerKey, payload) {
    return getBoletoProvider(providerKey).createInstallmentCharges(payload);
  },
  getCharge(providerKey, charge) {
    return getBoletoProvider(providerKey).getCharge(charge);
  },
  syncChargeStatus(providerKey, charge, status) {
    return getBoletoProvider(providerKey).syncChargeStatus(charge, status);
  },
  getBoletoAssets(providerKey, charge) {
    return getBoletoProvider(providerKey).getBoletoAssets(charge);
  },
  generateSecondCopy(providerKey, charge) {
    return getBoletoProvider(providerKey).generateSecondCopy(charge);
  },
  cancelCharge(providerKey, charge) {
    return getBoletoProvider(providerKey).cancelCharge(charge);
  },
  normalizeWebhookEvent(providerKey, payload) {
    const provider = getBoletoProvider(providerKey);
    if (typeof provider.normalizeWebhookEvent !== 'function') {
      return manualProvider.normalizeWebhookEvent(payload);
    }
    return provider.normalizeWebhookEvent(payload);
  },
  normalizeProviderStatus,
};
