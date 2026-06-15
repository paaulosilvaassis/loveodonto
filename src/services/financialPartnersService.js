import { loadDb, withDb } from '../db/index.js';
import { requirePermission, can } from '../permissions/permissions.js';
import { createId } from './helpers.js';
import { FINANCING_INTEREST_TYPES } from './financingCalculator.js';

export const FINANCIAL_PARTNER_TYPES = {
  OWN: 'own_financing',
  BANK: 'bank',
  FINTECH: 'fintech',
  CARD: 'card',
  EXTERNAL: 'external_finance',
  AGREEMENT: 'agreement',
};

export const FINANCIAL_PARTNER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
};

export const FINANCIAL_PARTNER_SPECIAL_IDS = {
  OWN: 'fpartner-own',
  OTHER: 'fpartner-other',
};

export const FINANCIAL_PARTNER_TYPE_LABELS = {
  [FINANCIAL_PARTNER_TYPES.OWN]: 'Financiamento próprio',
  [FINANCIAL_PARTNER_TYPES.BANK]: 'Banco',
  [FINANCIAL_PARTNER_TYPES.FINTECH]: 'Fintech',
  [FINANCIAL_PARTNER_TYPES.CARD]: 'Cartão',
  [FINANCIAL_PARTNER_TYPES.EXTERNAL]: 'Financeira externa',
  [FINANCIAL_PARTNER_TYPES.AGREEMENT]: 'Convênio/parceiro',
};

const nowIso = () => new Date().toISOString();

export const DEFAULT_FINANCIAL_PARTNERS = () => ([
  {
    id: FINANCIAL_PARTNER_SPECIAL_IDS.OWN,
    name: 'Financiamento próprio',
    type: FINANCIAL_PARTNER_TYPES.OWN,
    default_interest_type: FINANCING_INTEREST_TYPES.SIMPLE,
    default_interest_rate: 1.99,
    max_installments: 48,
    min_entry_percent: 10,
    min_entry_amount: 0,
    admin_fee_rate: 0,
    admin_fee_amount: 0,
    avg_approval_days: 1,
    status: FINANCIAL_PARTNER_STATUS.ACTIVE,
    notes: 'Financiamento administrado pela clínica. Configure taxas conforme política interna.',
    is_system: true,
    is_manual: false,
    created_at: nowIso(),
    updated_at: nowIso(),
  },
  {
    id: FINANCIAL_PARTNER_SPECIAL_IDS.OTHER,
    name: 'Outro parceiro',
    type: FINANCIAL_PARTNER_TYPES.EXTERNAL,
    default_interest_type: FINANCING_INTEREST_TYPES.NONE,
    default_interest_rate: 0,
    max_installments: 60,
    min_entry_percent: 0,
    min_entry_amount: 0,
    admin_fee_rate: 0,
    admin_fee_amount: 0,
    avg_approval_days: 5,
    status: FINANCIAL_PARTNER_STATUS.ACTIVE,
    notes: 'Permite preenchimento manual das condições no orçamento.',
    is_system: true,
    is_manual: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  },
]);

export function ensureFinancialPartnersSeeded() {
  return withDb((db) => {
    if (!Array.isArray(db.financialPartners)) db.financialPartners = [];
    if (db.financialPartners.length === 0) {
      db.financialPartners = DEFAULT_FINANCIAL_PARTNERS();
    } else {
      const ids = new Set(db.financialPartners.map((p) => p.id));
      for (const seed of DEFAULT_FINANCIAL_PARTNERS()) {
        if (!ids.has(seed.id)) db.financialPartners.push(seed);
      }
    }
    return db.financialPartners;
  });
}

export const listFinancialPartners = (filters = {}) => {
  ensureFinancialPartnersSeeded();
  const db = loadDb();
  let items = Array.isArray(db.financialPartners) ? [...db.financialPartners] : [];
  if (filters.status) items = items.filter((p) => p.status === filters.status);
  if (filters.activeOnly) items = items.filter((p) => p.status === FINANCIAL_PARTNER_STATUS.ACTIVE);
  if (filters.type) items = items.filter((p) => p.type === filters.type);
  items.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  return items;
};

export const listActiveFinancialPartners = () => (
  listFinancialPartners({ activeOnly: true })
);

export const getFinancialPartnerById = (id) => {
  if (!id) return null;
  ensureFinancialPartnersSeeded();
  const db = loadDb();
  return (db.financialPartners || []).find((p) => p.id === id) || null;
};

export const createFinancialPartner = (user, payload) => {
  requirePermission(user, 'financeiro_financiamentos:edit');
  if (!payload.name?.trim()) throw new Error('Nome do parceiro é obrigatório.');
  const id = createId('fpartner');
  const record = {
    id,
    name: payload.name.trim(),
    type: payload.type || FINANCIAL_PARTNER_TYPES.EXTERNAL,
    default_interest_type: payload.default_interest_type || FINANCING_INTEREST_TYPES.NONE,
    default_interest_rate: Number(payload.default_interest_rate || 0),
    max_installments: Math.max(1, Number(payload.max_installments || 36)),
    min_entry_percent: Math.max(0, Number(payload.min_entry_percent || 0)),
    min_entry_amount: Math.max(0, Number(payload.min_entry_amount || 0)),
    admin_fee_rate: Math.max(0, Number(payload.admin_fee_rate || 0)),
    admin_fee_amount: Math.max(0, Number(payload.admin_fee_amount || 0)),
    avg_approval_days: Math.max(0, Number(payload.avg_approval_days || 0)),
    status: payload.status || FINANCIAL_PARTNER_STATUS.ACTIVE,
    notes: payload.notes || '',
    is_system: false,
    is_manual: Boolean(payload.is_manual),
    created_at: nowIso(),
    updated_at: nowIso(),
    created_by: user?.id || null,
  };
  withDb((db) => {
    if (!Array.isArray(db.financialPartners)) db.financialPartners = [];
    db.financialPartners.push(record);
    return db;
  });
  return record;
};

export const updateFinancialPartner = (user, partnerId, patch) => {
  requirePermission(user, 'financeiro_financiamentos:edit');
  const current = getFinancialPartnerById(partnerId);
  if (!current) throw new Error('Parceiro financeiro não encontrado.');
  const updated = {
    ...current,
    name: patch.name !== undefined ? String(patch.name).trim() : current.name,
    type: patch.type ?? current.type,
    default_interest_type: patch.default_interest_type ?? current.default_interest_type,
    default_interest_rate: patch.default_interest_rate !== undefined
      ? Number(patch.default_interest_rate)
      : current.default_interest_rate,
    max_installments: patch.max_installments !== undefined
      ? Math.max(1, Number(patch.max_installments))
      : current.max_installments,
    min_entry_percent: patch.min_entry_percent !== undefined
      ? Math.max(0, Number(patch.min_entry_percent))
      : current.min_entry_percent,
    min_entry_amount: patch.min_entry_amount !== undefined
      ? Math.max(0, Number(patch.min_entry_amount))
      : current.min_entry_amount,
    admin_fee_rate: patch.admin_fee_rate !== undefined
      ? Math.max(0, Number(patch.admin_fee_rate))
      : current.admin_fee_rate,
    admin_fee_amount: patch.admin_fee_amount !== undefined
      ? Math.max(0, Number(patch.admin_fee_amount))
      : current.admin_fee_amount,
    avg_approval_days: patch.avg_approval_days !== undefined
      ? Math.max(0, Number(patch.avg_approval_days))
      : current.avg_approval_days,
    status: patch.status ?? current.status,
    notes: patch.notes !== undefined ? patch.notes : current.notes,
    updated_at: nowIso(),
    updated_by: user?.id || null,
  };
  withDb((db) => {
    const list = Array.isArray(db.financialPartners) ? db.financialPartners : [];
    const index = list.findIndex((p) => p.id === partnerId);
    if (index < 0) throw new Error('Parceiro financeiro não encontrado.');
    list[index] = updated;
    db.financialPartners = list;
    return db;
  });
  return updated;
};

export function computeMinEntryAmount(partner, totalAmount) {
  if (!partner) return 0;
  const total = Number(totalAmount || 0);
  const byPercent = total * (Number(partner.min_entry_percent || 0) / 100);
  const byFixed = Number(partner.min_entry_amount || 0);
  return Math.max(byPercent, byFixed, 0);
}

export const ENTRY_QUICK_PERCENTS = [10, 20, 30, 40, 50];

export function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function calcEntryAmountFromPercent(totalAmount, percent) {
  return roundMoney(Number(totalAmount || 0) * (Number(percent || 0) / 100));
}

export function calcEntryPercentFromAmount(totalAmount, entryAmount) {
  const total = Number(totalAmount || 0);
  if (total <= 0) return 0;
  return roundMoney((Number(entryAmount || 0) / total) * 100);
}

export function getPartnerMinEntryPercent(partner, totalAmount) {
  if (!partner || partner.is_manual) return 0;
  const byPercent = Number(partner.min_entry_percent || 0);
  const byFixed = Number(partner.min_entry_amount || 0);
  const total = Number(totalAmount || 0);
  if (total > 0 && byFixed > 0) {
    return Math.max(byPercent, calcEntryPercentFromAmount(total, byFixed));
  }
  return byPercent;
}

export function resolveEntryPercentMode(percent) {
  const rounded = Math.round(Number(percent || 0));
  if (ENTRY_QUICK_PERCENTS.includes(rounded) && Math.abs(Number(percent) - rounded) < 0.05) {
    return String(rounded);
  }
  if (Number(percent) > 0) return 'custom';
  return null;
}

export function isQuickPercentAllowed(percent, partner, totalAmount) {
  return percent >= getPartnerMinEntryPercent(partner, totalAmount) - 0.001;
}

export function validateEntryPercent(percent, partner, totalAmount) {
  const min = getPartnerMinEntryPercent(partner, totalAmount);
  if (min > 0 && Number(percent) + 0.009 < min) {
    const label = min % 1 === 0 ? `${min}%` : `${min.toFixed(1)}%`;
    return `A entrada mínima para este parceiro é de ${label}.`;
  }
  if (Number(percent) > 100) return 'Entrada não pode exceder 100% do tratamento.';
  return null;
}

export function canOverridePartnerTerms(user) {
  if (!user) return false;
  return can(user, 'financeiro_financiamentos:edit')
    || can(user, 'prontuario_orcamentos:edit')
    || can(user, 'prontuario_orcamentos:approve');
}

export function applyPartnerDefaultsToOption(partner, totalAmount) {
  if (!partner) return {};
  if (partner.is_manual) {
    return {
      partnerId: partner.id,
      partner: partner.name,
    };
  }
  const minEntry = computeMinEntryAmount(partner, totalAmount);
  const downPayment = minEntry > 0 ? Number(minEntry.toFixed(2)) : 0;
  const downPaymentPercent = calcEntryPercentFromAmount(totalAmount, downPayment);
  const minPercent = getPartnerMinEntryPercent(partner, totalAmount);
  let entryPercentMode = null;
  if (downPayment > 0) {
    entryPercentMode = resolveEntryPercentMode(downPaymentPercent);
  } else if (minPercent > 0 && ENTRY_QUICK_PERCENTS.includes(Math.round(minPercent))) {
    entryPercentMode = String(Math.round(minPercent));
  }

  return {
    partnerId: partner.id,
    partner: partner.name,
    interestType: partner.default_interest_type,
    interestRate: Number(partner.default_interest_rate || 0),
    installments: partner.max_installments || 36,
    downPayment,
    downPaymentPercent,
    entryPercentMode,
    adminFeeRate: Number(partner.admin_fee_rate || 0),
    adminFeeAmount: Number(partner.admin_fee_amount || 0),
  };
}
