import { loadDb, withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId } from './helpers.js';

export const COMMISSION_RULE_TYPE = {
  PRODUCTION: 'production',
  RECEIVED: 'received',
  FIXED: 'fixed',
  PROFIT: 'profit',
  /** Valor fixo por paciente que compareceu (agenda / check-in). */
  PATIENT_CHECKIN: 'patient_checkin',
  /** Fixo ou % sobre fechamento (orçamento aprovado, venda, financiamento). */
  PATIENT_CLOSING: 'patient_closing',
};

export const COMMISSION_APPLY_ON = {
  TOTAL_VALUE: 'total_value',
  NET_VALUE: 'net_value',
};

export const COMMISSION_ROLE = {
  DENTISTA: 'dentista',
  AVALIADOR: 'avaliador',
  COMERCIAL: 'comercial',
  GESTOR: 'gestor',
  RECEPCAO: 'recepcao',
};

const RULE_TYPES = Object.values(COMMISSION_RULE_TYPE);
const APPLY_ON_VALUES = Object.values(COMMISSION_APPLY_ON);
const ROLE_VALUES = Object.values(COMMISSION_ROLE);

const normText = (v) => String(v || '').trim();
const normNullable = (v) => {
  const t = normText(v);
  return t ? t : null;
};

function normalizeRulePayload(payload = {}) {
  let type = payload.type || COMMISSION_RULE_TYPE.PRODUCTION;
  if (type === 'patient_conversion') type = COMMISSION_RULE_TYPE.PATIENT_CLOSING;
  if (!RULE_TYPES.includes(type)) throw new Error('Tipo de comissão inválido.');
  const applyOn = payload.apply_on || COMMISSION_APPLY_ON.TOTAL_VALUE;
  if (!APPLY_ON_VALUES.includes(applyOn)) throw new Error('Campo apply_on inválido.');
  const role = payload.role || COMMISSION_ROLE.DENTISTA;
  if (!ROLE_VALUES.includes(role)) throw new Error('Perfil da regra inválido.');
  const percentage = Number(payload.percentage || 0);
  const fixedAmount = Number(payload.fixed_amount || 0);
  if (Number.isNaN(percentage) || percentage < 0) throw new Error('Percentual inválido.');
  if (Number.isNaN(fixedAmount) || fixedAmount < 0) throw new Error('Valor fixo inválido.');
  const name = normText(payload.name) || 'Regra de comissão';
  const lead_source = normNullable(payload.lead_source);

  return {
    name,
    type,
    percentage,
    fixed_amount: fixedAmount,
    apply_on: applyOn,
    professional_id: normNullable(payload.professional_id),
    role,
    specialty: normNullable(payload.specialty),
    procedure_id: normNullable(payload.procedure_id),
    lead_source,
    active: payload.active !== false,
    priority: Number(payload.priority || 100),
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
  };
}

export function listCommissionRules({ onlyActive = false } = {}) {
  const db = loadDb();
  let rules = Array.isArray(db.commissionRules) ? [...db.commissionRules] : [];
  if (onlyActive) rules = rules.filter((r) => r.active !== false);
  rules.sort((a, b) => Number(a.priority || 100) - Number(b.priority || 100));
  return rules;
}

export function createCommissionRule(user, payload) {
  requirePermission(user, 'finance:write');
  const normalized = normalizeRulePayload(payload);
  return withDb((db) => {
    db.commissionRules = Array.isArray(db.commissionRules) ? db.commissionRules : [];
    const now = new Date().toISOString();
    const row = {
      id: createId('comrule'),
      ...normalized,
      created_at: now,
      updated_at: now,
      created_by: user?.id || null,
    };
    db.commissionRules.push(row);
    return row;
  });
}

export function updateCommissionRule(user, ruleId, payload) {
  requirePermission(user, 'finance:write');
  return withDb((db) => {
    db.commissionRules = Array.isArray(db.commissionRules) ? db.commissionRules : [];
    const idx = db.commissionRules.findIndex((r) => r.id === ruleId);
    if (idx < 0) throw new Error('Regra de comissão não encontrada.');
    const current = db.commissionRules[idx];
    const normalized = normalizeRulePayload({ ...current, ...payload });
    db.commissionRules[idx] = {
      ...current,
      ...normalized,
      updated_at: new Date().toISOString(),
      updated_by: user?.id || null,
    };
    return db.commissionRules[idx];
  });
}

export function setCommissionRuleActive(user, ruleId, active) {
  requirePermission(user, 'finance:write');
  return updateCommissionRule(user, ruleId, { active: Boolean(active) });
}

export function reorderCommissionRulePriorities(user, orderedIds = []) {
  requirePermission(user, 'finance:write');
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return listCommissionRules();
  return withDb((db) => {
    db.commissionRules = Array.isArray(db.commissionRules) ? db.commissionRules : [];
    const now = new Date().toISOString();
    orderedIds.forEach((id, index) => {
      const idx = db.commissionRules.findIndex((r) => r.id === id);
      if (idx >= 0) {
        db.commissionRules[idx].priority = index + 1;
        db.commissionRules[idx].updated_at = now;
      }
    });
    return [...db.commissionRules].sort((a, b) => Number(a.priority || 100) - Number(b.priority || 100));
  });
}

export function getCommissionRuleById(ruleId) {
  const db = loadDb();
  const list = Array.isArray(db.commissionRules) ? db.commissionRules : [];
  return list.find((r) => r.id === ruleId) || null;
}

export function deleteCommissionRule(user, ruleId) {
  requirePermission(user, 'finance:write');
  return withDb((db) => {
    db.commissionRules = Array.isArray(db.commissionRules) ? db.commissionRules : [];
    const before = db.commissionRules.length;
    db.commissionRules = db.commissionRules.filter((r) => r.id !== ruleId);
    if (db.commissionRules.length === before) {
      throw new Error('Regra de comissão não encontrada.');
    }
    return true;
  });
}
