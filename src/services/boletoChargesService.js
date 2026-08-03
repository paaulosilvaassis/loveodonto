import { loadDb, withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId } from './helpers.js';
import { boletoProviderService, BOLETO_PROVIDER } from './boletoProviderService.js';
import { patchFinancingInstallment } from './financingInstallmentsService.js';
import { BOLETO_STATUS_EVENT_TYPE, createBoletoChargeStatusHistory } from './boletoChargeStatusHistoryService.js';
import {
  AUDIT_EVENT_KEY,
  AUDIT_EVENT_SOURCE,
  AUDIT_OPERATION_CONTEXT,
  BOLETO_CHARGE_STATUS,
  BOLETO_CHARGE_TYPE,
  FINANCIAL_PAYMENT_METHOD,
  assertEnumValue,
  normalizeEnumValue,
} from './auditEventCatalog.js';
export { BOLETO_CHARGE_STATUS };

const todayIso = () => new Date().toISOString().slice(0, 10);

export const listBoletoCharges = (filters = {}) => {
  const db = loadDb();
  let items = Array.isArray(db.boletoCharges) ? [...db.boletoCharges] : [];
  if (filters.status && Object.values(BOLETO_CHARGE_STATUS).includes(filters.status)) {
    items = items.filter((item) => item.status === filters.status);
  }
  if (filters.patient_id) items = items.filter((item) => item.patient_id === filters.patient_id);
  if (filters.financing_id) items = items.filter((item) => item.financing_id === filters.financing_id);
  if (filters.installment_id) items = items.filter((item) => item.installment_id === filters.installment_id);
  if (filters.startDate) items = items.filter((item) => (item.due_date || '') >= filters.startDate);
  if (filters.endDate) items = items.filter((item) => (item.due_date || '') <= filters.endDate);
  if (filters.type) items = items.filter((item) => item.charge_type === filters.type);
  items = items.map((item) => {
    if (item.status === BOLETO_CHARGE_STATUS.PAID || item.status === BOLETO_CHARGE_STATUS.CANCELED) return item;
    if (item.due_date && item.due_date < todayIso()) {
      return { ...item, status: BOLETO_CHARGE_STATUS.OVERDUE };
    }
    return item;
  });
  items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return items;
};

export const getBoletoChargeById = (id) => {
  const db = loadDb();
  const items = Array.isArray(db.boletoCharges) ? db.boletoCharges : [];
  return items.find((item) => item.id === id) || null;
};

export const createBoletoCharge = (user, payload) => {
  requirePermission(user, 'finance:write');
  if (payload.external_provider !== undefined && !Object.values(BOLETO_PROVIDER).includes(payload.external_provider)) {
    throw new Error(`external_provider inválido: "${String(payload.external_provider)}".`);
  }
  if (payload.status !== undefined) {
    assertEnumValue('status', BOLETO_CHARGE_STATUS, payload.status);
  }
  if (payload.charge_type !== undefined) {
    assertEnumValue('charge_type', BOLETO_CHARGE_TYPE, payload.charge_type);
  }
  if (payload.payment_method !== undefined) {
    assertEnumValue('payment_method', FINANCIAL_PAYMENT_METHOD, payload.payment_method);
  }
  const now = new Date().toISOString();
  const provider = payload.external_provider || BOLETO_PROVIDER.MANUAL;
  const providerCharge = boletoProviderService.createCharge(provider, payload);
  const record = {
    id: createId('blt'),
    financing_id: payload.financing_id || null,
    installment_id: payload.installment_id || null,
    receivable_id: payload.receivable_id || null,
    patient_id: payload.patient_id || null,
    external_provider: providerCharge.external_provider || provider,
    external_charge_id: providerCharge.external_charge_id || null,
    charge_type: normalizeEnumValue(BOLETO_CHARGE_TYPE, payload.charge_type, BOLETO_CHARGE_TYPE.BOLETO),
    boleto_number: providerCharge.boleto_number || '',
    nosso_numero: providerCharge.nosso_numero || '',
    barcode: providerCharge.barcode || '',
    linha_digitavel: providerCharge.linha_digitavel || '',
    boleto_url: providerCharge.boleto_url || '',
    invoice_url: providerCharge.invoice_url || '',
    status: normalizeEnumValue(
      BOLETO_CHARGE_STATUS,
      providerCharge.status || payload.status,
      BOLETO_CHARGE_STATUS.GENERATED
    ),
    issue_date: payload.issue_date || todayIso(),
    due_date: payload.due_date || '',
    paid_at: null,
    canceled_at: null,
    viewed_at: null,
    sent_at: null,
    recipient_name: payload.recipient_name || '',
    recipient_document: payload.recipient_document || '',
    recipient_email: payload.recipient_email || '',
    recipient_phone: payload.recipient_phone || '',
    payer_name: payload.payer_name || '',
    payer_document: payload.payer_document || '',
    payer_email: payload.payer_email || '',
    payer_phone: payload.payer_phone || '',
    payer_zip_code: payload.payer_zip_code || '',
    payer_street: payload.payer_street || '',
    payer_number: payload.payer_number || '',
    payer_complement: payload.payer_complement || '',
    payer_district: payload.payer_district || '',
    payer_city: payload.payer_city || '',
    payer_state: payload.payer_state || '',
    amount: Number(payload.amount || 0),
    discount_amount: Number(payload.discount_amount || 0),
    interest_amount: Number(payload.interest_amount || 0),
    fine_amount: Number(payload.fine_amount || 0),
    instructions: payload.instructions || '',
    message_template: payload.message_template || '',
    payment_method: normalizeEnumValue(
      FINANCIAL_PAYMENT_METHOD,
      payload.payment_method,
      FINANCIAL_PAYMENT_METHOD.BOLETO
    ),
    created_at: now,
    updated_at: now,
  };
  withDb((db) => {
    if (!Array.isArray(db.boletoCharges)) db.boletoCharges = [];
    db.boletoCharges.push(record);
    return db;
  });
  if (record.installment_id) {
    patchFinancingInstallment(record.installment_id, {
      boleto_charge_id: record.id,
      last_charge_at: now,
      boleto_enabled: true,
    });
  }
  createBoletoChargeStatusHistory({
    boleto_charge_id: record.id,
    financing_id: record.financing_id,
    installment_id: record.installment_id,
    receivable_id: record.receivable_id,
    from_status: null,
    to_status: record.status,
    event_type: BOLETO_STATUS_EVENT_TYPE.CREATED,
    change_reason: 'Cobrança criada.',
    source: record.external_provider === BOLETO_PROVIDER.MANUAL
      ? AUDIT_EVENT_SOURCE.INTERNAL_MANUAL
      : AUDIT_EVENT_SOURCE.PROVIDER_SYNC,
    actor_id: user?.id || null,
    external_provider: record.external_provider,
    external_charge_id: record.external_charge_id,
    provider_status: record.status,
    metadata: {
      event_key: AUDIT_EVENT_KEY.BOLETO_CREATED,
      operation_context: AUDIT_OPERATION_CONTEXT.CREATE_CHARGE,
      charge_type: record.charge_type,
      issue_date: record.issue_date,
      due_date: record.due_date,
      amount: record.amount,
    },
  });
  return record;
};

export const updateBoletoChargeStatus = (user, id, nextStatus, extra = {}) => {
  if (extra.charge_type !== undefined) {
    assertEnumValue('extra.charge_type', BOLETO_CHARGE_TYPE, extra.charge_type);
  }
  requirePermission(user, 'finance:write');
  assertEnumValue('nextStatus', BOLETO_CHARGE_STATUS, nextStatus);
  if (extra.event_type !== undefined) {
    assertEnumValue('extra.event_type', BOLETO_STATUS_EVENT_TYPE, extra.event_type);
  }
  if (extra.source !== undefined) {
    assertEnumValue('extra.source', AUDIT_EVENT_SOURCE, extra.source);
  }
  if (extra.metadata?.event_key !== undefined) {
    assertEnumValue('extra.metadata.event_key', AUDIT_EVENT_KEY, extra.metadata.event_key);
  }
  if (extra.metadata?.operation_context !== undefined) {
    assertEnumValue('extra.metadata.operation_context', AUDIT_OPERATION_CONTEXT, extra.metadata.operation_context);
  }
  let result = null;
  let historyPayload = null;
  withDb((db) => {
    const items = Array.isArray(db.boletoCharges) ? db.boletoCharges : [];
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Cobrança de boleto não encontrada.');
    const current = items[index];
    const now = new Date().toISOString();
    const next = {
      ...current,
      status: nextStatus,
      ...extra,
      updated_at: now,
    };
    if (nextStatus === BOLETO_CHARGE_STATUS.SENT && !next.sent_at) next.sent_at = now;
    if (nextStatus === BOLETO_CHARGE_STATUS.VIEWED && !next.viewed_at) next.viewed_at = now;
    if (nextStatus === BOLETO_CHARGE_STATUS.PAID && !next.paid_at) next.paid_at = now;
    if (nextStatus === BOLETO_CHARGE_STATUS.CANCELED && !next.canceled_at) next.canceled_at = now;
    items[index] = next;
    db.boletoCharges = items;
    result = next;
    historyPayload = {
      boleto_charge_id: next.id,
      financing_id: next.financing_id,
      installment_id: next.installment_id,
      receivable_id: next.receivable_id,
      from_status: current.status || null,
      to_status: next.status,
      event_type: normalizeEnumValue(BOLETO_STATUS_EVENT_TYPE, extra.event_type, (
        next.status === BOLETO_CHARGE_STATUS.CANCELED
          ? BOLETO_STATUS_EVENT_TYPE.CANCELED
          : next.status === BOLETO_CHARGE_STATUS.PAID
            ? BOLETO_STATUS_EVENT_TYPE.PAYMENT_CONFIRMED
            : BOLETO_STATUS_EVENT_TYPE.STATUS_CHANGED
      )),
      change_reason: extra.change_reason || '',
      source: normalizeEnumValue(
        AUDIT_EVENT_SOURCE,
        extra.source,
        AUDIT_EVENT_SOURCE.INTERNAL_MANUAL
      ),
      actor_id: user?.id || null,
      external_provider: next.external_provider,
      external_charge_id: next.external_charge_id,
      provider_status: extra.provider_status || next.status,
      provider_payload: extra.provider_payload || {},
      metadata: {
        event_key: normalizeEnumValue(
          AUDIT_EVENT_KEY,
          extra.metadata?.event_key,
          AUDIT_EVENT_KEY.BOLETO_STATUS_CHANGED
        ),
        operation_context: normalizeEnumValue(
          AUDIT_OPERATION_CONTEXT,
          extra.metadata?.operation_context,
          AUDIT_OPERATION_CONTEXT.UPDATE_CHARGE_STATUS
        ),
        operation_id: extra.metadata?.operation_id || null,
        previous_status: current.status || null,
        next_status: next.status,
        charge_type: next.charge_type,
        due_date: next.due_date,
        amount: next.amount,
        ...extra.metadata,
      },
    };
    return db;
  });
  if (historyPayload) createBoletoChargeStatusHistory(historyPayload);
  return result;
};

export const generateSecondCopy = (user, id) => {
  requirePermission(user, 'finance:write');
  const current = getBoletoChargeById(id);
  if (!current) throw new Error('Cobrança de boleto não encontrada.');
  const providerResult = boletoProviderService.generateSecondCopy(current.external_provider, current);
  return updateBoletoChargeStatus(user, id, BOLETO_CHARGE_STATUS.GENERATED, {
    boleto_url: providerResult.boleto_url || current.boleto_url,
    invoice_url: providerResult.invoice_url || current.invoice_url,
    charge_type: BOLETO_CHARGE_TYPE.SECOND_COPY,
    event_type: BOLETO_STATUS_EVENT_TYPE.SECOND_COPY_GENERATED,
    change_reason: 'Segunda via gerada.',
    source: AUDIT_EVENT_SOURCE.INTERNAL_MANUAL,
    metadata: {
      event_key: AUDIT_EVENT_KEY.BOLETO_SECOND_COPY_GENERATED,
      operation_context: AUDIT_OPERATION_CONTEXT.GENERATE_SECOND_COPY,
      original_charge_type: current.charge_type || 'boleto',
    },
  });
};

export const cancelBoletoCharge = (user, id, reason = '') => {
  requirePermission(user, 'finance:write');
  return updateBoletoChargeStatus(user, id, BOLETO_CHARGE_STATUS.CANCELED, {
    instructions: reason || '',
    event_type: BOLETO_STATUS_EVENT_TYPE.CANCELED,
    change_reason: reason || 'Cobrança cancelada manualmente.',
    source: AUDIT_EVENT_SOURCE.INTERNAL_MANUAL,
    metadata: {
      event_key: AUDIT_EVENT_KEY.BOLETO_CANCELED,
      operation_context: AUDIT_OPERATION_CONTEXT.CANCEL_CHARGE,
      cancellation_reason: reason || '',
    },
  });
};

export const syncBoletoChargeStatusFromProvider = (user, id, providerPayload = null) => {
  requirePermission(user, 'finance:write');
  const current = getBoletoChargeById(id);
  if (!current) throw new Error('Cobrança de boleto não encontrada.');
  const resolvedPayload = providerPayload
    || boletoProviderService.getCharge(current.external_provider, current)
    || {};
  const normalizedStatus = normalizeEnumValue(
    BOLETO_CHARGE_STATUS,
    resolvedPayload.status,
    current.status
  );
  const hasStatusChange = normalizedStatus !== current.status;
  const hasBoletoAssetChange = (
    (resolvedPayload.linha_digitavel && resolvedPayload.linha_digitavel !== current.linha_digitavel)
    || (resolvedPayload.barcode && resolvedPayload.barcode !== current.barcode)
    || (resolvedPayload.boleto_url && resolvedPayload.boleto_url !== current.boleto_url)
    || (resolvedPayload.invoice_url && resolvedPayload.invoice_url !== current.invoice_url)
  );
  if (!hasStatusChange && !hasBoletoAssetChange) {
    return { updated: false, charge: current };
  }
  const updated = updateBoletoChargeStatus(user, id, normalizedStatus, {
    linha_digitavel: resolvedPayload.linha_digitavel || current.linha_digitavel,
    barcode: resolvedPayload.barcode || current.barcode,
    boleto_url: resolvedPayload.boleto_url || current.boleto_url,
    invoice_url: resolvedPayload.invoice_url || current.invoice_url,
    provider_status: resolvedPayload.provider_status || resolvedPayload.status || normalizedStatus,
    provider_payload: resolvedPayload.provider_payload || resolvedPayload.raw_payload || resolvedPayload,
    event_type: BOLETO_STATUS_EVENT_TYPE.STATUS_CHANGED,
    source: AUDIT_EVENT_SOURCE.PROVIDER_SYNC,
    change_reason: 'Status sincronizado com provider de cobrança.',
    metadata: {
      event_key: AUDIT_EVENT_KEY.BOLETO_PROVIDER_STATUS_SYNCED,
      operation_context: AUDIT_OPERATION_CONTEXT.SYNC_CHARGE_STATUS,
      sync_mode: 'polling',
    },
  });
  return { updated: true, charge: updated };
};

export const syncOpenBoletoChargesFromProvider = (user, options = {}) => {
  requirePermission(user, 'finance:write');
  const openStatuses = [
    BOLETO_CHARGE_STATUS.DRAFT,
    BOLETO_CHARGE_STATUS.GENERATED,
    BOLETO_CHARGE_STATUS.SENT,
    BOLETO_CHARGE_STATUS.VIEWED,
    BOLETO_CHARGE_STATUS.OVERDUE,
  ];
  const limit = Number(options.limit || 0);
  const list = listBoletoCharges({})
    .filter((item) => openStatuses.includes(item.status));
  const selected = limit > 0 ? list.slice(0, limit) : list;
  const results = [];
  for (const charge of selected) {
    const providerResult = boletoProviderService.syncChargeStatus(charge.external_provider, charge, options.forceStatus || null);
    const syncResult = syncBoletoChargeStatusFromProvider(user, charge.id, providerResult);
    results.push({ charge_id: charge.id, ...syncResult });
  }
  return results;
};

export const processBoletoProviderWebhook = (user, payload = {}) => {
  requirePermission(user, 'finance:write');
  const provider = payload.provider || BOLETO_PROVIDER.MANUAL;
  const normalized = boletoProviderService.normalizeWebhookEvent(provider, payload);
  if (!normalized?.external_charge_id) {
    throw new Error('Webhook inválido: external_charge_id não informado.');
  }
  const db = loadDb();
  const items = Array.isArray(db.boletoCharges) ? db.boletoCharges : [];
  const charge = items.find((item) =>
    item.external_charge_id === normalized.external_charge_id
    && item.external_provider === provider
  );
  if (!charge) {
    return {
      matched: false,
      external_charge_id: normalized.external_charge_id,
      provider,
    };
  }
  const nextStatus = normalizeEnumValue(BOLETO_CHARGE_STATUS, normalized.status, charge.status);
  const updated = updateBoletoChargeStatus(user, charge.id, nextStatus, {
    paid_at: normalized.paid_at || charge.paid_at,
    due_date: normalized.due_date || charge.due_date,
    amount: normalized.amount || charge.amount,
    provider_status: normalized.provider_status || normalized.status || nextStatus,
    provider_payload: normalized.raw_payload || payload,
    event_type: nextStatus === BOLETO_CHARGE_STATUS.PAID
      ? BOLETO_STATUS_EVENT_TYPE.PAYMENT_CONFIRMED
      : BOLETO_STATUS_EVENT_TYPE.STATUS_CHANGED,
    source: AUDIT_EVENT_SOURCE.PROVIDER_SYNC,
    change_reason: 'Webhook processado do provider de cobrança.',
    metadata: {
      event_key: AUDIT_EVENT_KEY.BOLETO_PROVIDER_WEBHOOK_PROCESSED,
      operation_context: AUDIT_OPERATION_CONTEXT.PROCESS_PROVIDER_WEBHOOK,
      provider_event: normalized.metadata?.event || null,
    },
  });
  return {
    matched: true,
    provider,
    charge: updated,
  };
};
