export const AUDIT_EVENT_SOURCE = {
  INTERNAL_MANUAL: 'internal_manual',
  FINANCIAL_OPERATION: 'financial_operation',
  PROVIDER_SYNC: 'provider_sync',
};

export const AUDIT_OPERATION_CONTEXT = {
  CREATE_CHARGE: 'create_charge',
  UPDATE_CHARGE_STATUS: 'update_charge_status',
  GENERATE_SECOND_COPY: 'generate_second_copy',
  CANCEL_CHARGE: 'cancel_charge',
  REGISTER_FINANCING_PAYMENT: 'register_financing_payment',
  REVERSE_FINANCING_PAYMENT_AUDIT: 'reverse_financing_payment_audit',
  FINANCE_OPERATION: 'finance_operation',
  RUN_BOLETO_REMINDER_RULE: 'run_boleto_reminder_rule',
  CREATE_RECEIVABLE_CHARGE: 'create_receivable_charge',
  SYNC_CHARGE_STATUS: 'sync_charge_status',
  PROCESS_PROVIDER_WEBHOOK: 'process_provider_webhook',
};

export const AUDIT_EVENT_KEY = {
  BOLETO_STATUS_EVENT: 'boleto_status_event',
  BOLETO_CREATED: 'boleto_created',
  BOLETO_STATUS_CHANGED: 'boleto_status_changed',
  BOLETO_SECOND_COPY_GENERATED: 'boleto_second_copy_generated',
  BOLETO_CANCELED: 'boleto_canceled',
  PAYMENT_ALLOCATION_CREATED: 'payment_allocation_created',
  PAYMENT_ALLOCATION_PARTIAL: 'payment_allocation_partial',
  PAYMENT_ALLOCATION_TOTAL_SETTLEMENT: 'payment_allocation_total_settlement',
  PAYMENT_ALLOCATION_REVERSED: 'payment_allocation_reversed',
  BOLETO_REMINDER_SCHEDULED: 'boleto_reminder_scheduled',
  RECEIVABLE_CHARGE_CREATED: 'receivable_charge_created',
  BOLETO_PROVIDER_STATUS_SYNCED: 'boleto_provider_status_synced',
  BOLETO_PROVIDER_WEBHOOK_PROCESSED: 'boleto_provider_webhook_processed',
  BOLETO_PROVIDER_SYNC_FAILED: 'boleto_provider_sync_failed',
};

export const BOLETO_REMINDER_EVENT_KEY = {
  BEFORE_3_DAYS: 'before_3_days',
  DUE_TODAY: 'due_today',
  AFTER_3_DAYS: 'after_3_days',
  AFTER_7_DAYS: 'after_7_days',
  AFTER_15_DAYS: 'after_15_days',
};

export const BOLETO_REMINDER_CHANNEL = {
  INTERNAL_NOTIFICATION: 'internal_notification',
};

export const BOLETO_REMINDER_STATUS = {
  GENERATED: 'generated',
};

export const RECEIVABLE_CHARGE_EVENT_TYPE = {
  CREATED: 'created',
  STATUS_CHANGED: 'status_changed',
  CANCELED: 'canceled',
  PAID: 'paid',
  FAILED: 'failed',
};

export const BOLETO_STATUS_EVENT_TYPE = {
  CREATED: 'created',
  STATUS_CHANGED: 'status_changed',
  SECOND_COPY_GENERATED: 'second_copy_generated',
  CANCELED: 'canceled',
  PAYMENT_CONFIRMED: 'payment_confirmed',
  REVERSED: 'reversed',
};

export const FINANCING_PAYMENT_ALLOCATION_STATUS = {
  APPLIED: 'applied',
  REVERSED: 'reversed',
};

export const FINANCING_PAYMENT_ALLOCATION_TYPE = {
  INSTALLMENT_PAYMENT: 'installment_payment',
  PARTIAL_PAYMENT: 'partial_payment',
  TOTAL_SETTLEMENT: 'total_settlement',
  REVERSAL: 'reversal',
};

export const FINANCING_TIMELINE_EVENT = {
  PROPOSAL_CREATED: 'proposal_created',
  FINANCING_APPROVED: 'financing_approved',
  ENTRY_RECEIVABLE_CREATED: 'entry_receivable_created',
  ENTRY_RECEIVED: 'entry_received',
  INSTALLMENTS_GENERATED: 'installments_generated',
  BOLETO_GENERATED: 'boleto_generated',
  INSTALLMENT_PARTIALLY_PAID: 'installment_partially_paid',
  INSTALLMENT_PAID: 'installment_paid',
  PAYMENT_REVERSED: 'payment_reversed',
  FINANCING_REJECTED: 'financing_rejected',
  FINANCING_CANCELED: 'financing_canceled',
  CARNE_GENERATED: 'carne_generated',
  FINANCING_RENEGOTIATED: 'financing_renegotiated',
  TERMS_UPDATED: 'terms_updated',
  CLINICAL_BUDGET_SYNCED: 'clinical_budget_synced',
  CONTRACT_LINKED: 'contract_linked',
};

export const FINANCING_STATUS = {
  DRAFT: 'draft',
  PENDING_ANALYSIS: 'pending_analysis',
  APPROVED: 'approved',
  ACTIVE: 'active',
  PARTIALLY_PAID: 'partially_paid',
  PAID_OFF: 'paid_off',
  OVERDUE: 'overdue',
  RENEGOTIATED: 'renegotiated',
  CANCELED: 'canceled',
  DEFAULTED: 'defaulted',
};

export const FINANCING_INSTALLMENT_STATUS = {
  PENDING: 'pending',
  DUE_TODAY: 'due_today',
  UPCOMING: 'upcoming',
  OVERDUE: 'overdue',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  CANCELED: 'canceled',
  RENEGOTIATED: 'renegotiated',
};

export const BOLETO_CHARGE_STATUS = {
  DRAFT: 'draft',
  GENERATED: 'generated',
  SENT: 'sent',
  VIEWED: 'viewed',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELED: 'canceled',
  FAILED: 'failed',
};

export const RECEIVABLE_STATUS = {
  PENDING: 'pending',
  DUE_TODAY: 'due_today',
  UPCOMING: 'upcoming',
  OVERDUE: 'overdue',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  CANCELED: 'canceled',
  RENEGOTIATED: 'renegotiated',
};

export const RECEIVABLE_CHARGE_STATUS = {
  DRAFT: 'draft',
  GENERATED: 'generated',
  SENT: 'sent',
  VIEWED: 'viewed',
  PAID: 'paid',
  CANCELED: 'canceled',
  FAILED: 'failed',
};

export const BOLETO_CHARGE_TYPE = {
  BOLETO: 'boleto',
  CARNE: 'carne',
  SECOND_COPY: 'second_copy',
};

export const RECEIVABLE_CHARGE_TYPE = {
  NONE: 'none',
  BOLETO: 'boleto',
  PIX: 'pix',
  CARD_LINK: 'card_link',
  WHATSAPP_REMINDER: 'whatsapp_reminder',
  EMAIL_REMINDER: 'email_reminder',
  SMS_REMINDER: 'sms_reminder',
};

export const FINANCIAL_PAYMENT_METHOD = {
  CASH: 'dinheiro',
  PIX: 'pix',
  BOLETO: 'boleto',
  DEBIT_CARD: 'cartao_debito',
  CREDIT_CARD: 'cartao_credito',
  PAYMENT_LINK: 'link_pagamento',
  TRANSFER: 'transferencia',
  INSURANCE: 'convenio',
  CHECK: 'cheque',
  DIGITAL_WALLET: 'carteira_digital',
  OTHERS: 'outros',
};

export const enumValues = (enumObj) => Object.values(enumObj || {});

export const isEnumValue = (enumObj, value) => enumValues(enumObj).includes(value);

export const assertEnumValue = (fieldName, enumObj, value) => {
  if (!isEnumValue(enumObj, value)) {
    throw new Error(`${fieldName} inválido: "${String(value)}".`);
  }
  return value;
};

export const normalizeEnumValue = (enumObj, value, fallback) => {
  if (isEnumValue(enumObj, value)) return value;
  return fallback;
};

