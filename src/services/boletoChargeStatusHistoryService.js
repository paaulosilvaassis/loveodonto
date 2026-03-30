import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';
import {
  AUDIT_EVENT_KEY,
  AUDIT_EVENT_SOURCE,
  AUDIT_OPERATION_CONTEXT,
  BOLETO_CHARGE_STATUS,
  BOLETO_STATUS_EVENT_TYPE,
  FINANCIAL_PAYMENT_METHOD,
  assertEnumValue,
  normalizeEnumValue,
} from './auditEventCatalog.js';

const nowIso = () => new Date().toISOString();
export { BOLETO_STATUS_EVENT_TYPE };

const normalizeProviderPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return {};
  return {
    external_provider: payload.external_provider || null,
    external_charge_id: payload.external_charge_id || null,
    provider_status: payload.provider_status || null,
    provider_payload: payload.provider_payload || {},
  };
};

export const createBoletoChargeStatusHistory = (payload) => {
  if (!payload || typeof payload !== 'object') throw new Error('Payload de histórico de cobrança inválido.');
  if (!payload.boleto_charge_id) throw new Error('boleto_charge_id é obrigatório.');
  if (!payload.to_status) throw new Error('to_status é obrigatório.');
  assertEnumValue('to_status', BOLETO_CHARGE_STATUS, payload.to_status);
  if (payload.from_status !== undefined && payload.from_status !== null) {
    assertEnumValue('from_status', BOLETO_CHARGE_STATUS, payload.from_status);
  }
  if (payload.event_type !== undefined) {
    assertEnumValue('event_type', BOLETO_STATUS_EVENT_TYPE, payload.event_type);
  }
  if (payload.source !== undefined) {
    assertEnumValue('source', AUDIT_EVENT_SOURCE, payload.source);
  }
  if (payload.metadata?.event_key !== undefined) {
    assertEnumValue('metadata.event_key', AUDIT_EVENT_KEY, payload.metadata.event_key);
  }
  if (payload.metadata?.operation_context !== undefined) {
    assertEnumValue('metadata.operation_context', AUDIT_OPERATION_CONTEXT, payload.metadata.operation_context);
  }
  if (payload.metadata?.payment_method !== undefined) {
    assertEnumValue('metadata.payment_method', FINANCIAL_PAYMENT_METHOD, payload.metadata.payment_method);
  }
  const createdAt = nowIso();
  const providerData = normalizeProviderPayload(payload);
  const record = {
    id: payload.id || createId('bltst'),
    boleto_charge_id: payload.boleto_charge_id,
    financing_id: payload.financing_id || null,
    installment_id: payload.installment_id || null,
    receivable_id: payload.receivable_id || null,
    from_status: payload.from_status || null,
    to_status: payload.to_status,
    change_reason: payload.change_reason || '',
    event_type: normalizeEnumValue(
      BOLETO_STATUS_EVENT_TYPE,
      payload.event_type,
      BOLETO_STATUS_EVENT_TYPE.STATUS_CHANGED
    ),
    source: normalizeEnumValue(
      AUDIT_EVENT_SOURCE,
      payload.source,
      AUDIT_EVENT_SOURCE.INTERNAL_MANUAL
    ),
    actor_id: payload.actor_id || null,
    ...providerData,
    metadata: {
      event_key: normalizeEnumValue(
        AUDIT_EVENT_KEY,
        payload.metadata?.event_key,
        AUDIT_EVENT_KEY.BOLETO_STATUS_EVENT
      ),
      operation_context: normalizeEnumValue(
        AUDIT_OPERATION_CONTEXT,
        payload.metadata?.operation_context,
        AUDIT_OPERATION_CONTEXT.FINANCE_OPERATION
      ),
      payment_method: payload.metadata?.payment_method || null,
      operation_id: payload.metadata?.operation_id || null,
      ...payload.metadata,
    },
    created_at: createdAt,
  };
  withDb((db) => {
    if (!Array.isArray(db.boletoChargeStatusHistory)) db.boletoChargeStatusHistory = [];
    db.boletoChargeStatusHistory.push(record);
    return db;
  });
  return record;
};

export const getBoletoChargeStatusHistoryById = (id) => {
  const db = loadDb();
  const items = Array.isArray(db.boletoChargeStatusHistory) ? db.boletoChargeStatusHistory : [];
  return items.find((item) => item.id === id) || null;
};

export const listBoletoChargeStatusHistory = (filters = {}) => {
  const db = loadDb();
  let items = Array.isArray(db.boletoChargeStatusHistory) ? [...db.boletoChargeStatusHistory] : [];
  if (filters.boleto_charge_id) items = items.filter((item) => item.boleto_charge_id === filters.boleto_charge_id);
  if (filters.financing_id) items = items.filter((item) => item.financing_id === filters.financing_id);
  if (filters.installment_id) items = items.filter((item) => item.installment_id === filters.installment_id);
  if (filters.receivable_id) items = items.filter((item) => item.receivable_id === filters.receivable_id);
  if (filters.to_status && Object.values(BOLETO_CHARGE_STATUS).includes(filters.to_status)) {
    items = items.filter((item) => item.to_status === filters.to_status);
  }
  if (filters.event_type && Object.values(BOLETO_STATUS_EVENT_TYPE).includes(filters.event_type)) {
    items = items.filter((item) => item.event_type === filters.event_type);
  }
  if (filters.source && Object.values(AUDIT_EVENT_SOURCE).includes(filters.source)) {
    items = items.filter((item) => item.source === filters.source);
  }
  if (filters.operation_context && Object.values(AUDIT_OPERATION_CONTEXT).includes(filters.operation_context)) {
    items = items.filter((item) => item.metadata?.operation_context === filters.operation_context);
  }
  if (filters.event_key && Object.values(AUDIT_EVENT_KEY).includes(filters.event_key)) {
    items = items.filter((item) => item.metadata?.event_key === filters.event_key);
  }
  items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return items;
};

export const getLatestBoletoChargeStatus = (boletoChargeId) => {
  const history = listBoletoChargeStatusHistory({ boleto_charge_id: boletoChargeId });
  return history[0] || null;
};

