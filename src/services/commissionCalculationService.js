import { loadDb, withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId } from './helpers.js';
import { listFinancings } from './financingsService.js';
import { listReceivables, RECEIVABLE_STATUS } from './receivablesService.js';
import { listCommissionRules, COMMISSION_RULE_TYPE, COMMISSION_ROLE } from './commissionRulesService.js';

export const COMMISSION_STATUS = {
  PENDING: 'pending',
  AVAILABLE: 'available',
  PAID: 'paid',
  REVERSED: 'reversed',
};

/** Base semântica do lançamento (produção, recebimento, captação, fechamento). */
export const COMMISSION_BASIS = {
  PRODUCTION: 'production',
  RECEIVED: 'received',
  PATIENT_CHECKIN: 'patient_checkin',
  PATIENT_CLOSING: 'patient_closing',
};

/** Valor legado (migração 41 renomeia para patient_closing). */
const LEGACY_CLOSING_BASIS = 'patient_conversion';

function isPatientClosingBasis(basis) {
  return basis === COMMISSION_BASIS.PATIENT_CLOSING || basis === LEGACY_CLOSING_BASIS;
}

function isPatientClosingRuleType(t) {
  return t === COMMISSION_RULE_TYPE.PATIENT_CLOSING || t === 'patient_conversion';
}

const ACTIVE_FINANCING_STATUSES = new Set([
  'approved',
  'active',
  'partially_paid',
  'paid_off',
  'overdue',
  'defaulted',
]);
const EXCLUDED_RECEIVABLE_STATUSES = new Set([RECEIVABLE_STATUS.CANCELED, RECEIVABLE_STATUS.RENEGOTIATED]);

const toDay = (iso) => String(iso || '').slice(0, 10);
const toNumber = (v) => Number(v || 0);
const norm = (v) => String(v || '').trim();
const normLower = (v) => norm(v).toLowerCase();

const isInRange = (day, startDate, endDate) => {
  if (!day) return false;
  if (startDate && day < startDate) return false;
  if (endDate && day > endDate) return false;
  return true;
};

function getProcedureCost(db, procedureId) {
  if (!procedureId) return 0;
  const p = (db.priceTableProcedures || []).find((x) => x.id === procedureId);
  return p ? toNumber(p.costPrice) : 0;
}

function getSpecialtyByProfessional(db, professionalId) {
  if (!professionalId) return '';
  const c = (db.collaborators || []).find((x) => x.id === professionalId);
  if (!c) return '';
  if (Array.isArray(c.especialidades) && c.especialidades.length > 0) return String(c.especialidades[0] || '');
  return String(c.cargo || '');
}

function getLeadSourceForPatient(db, patientId) {
  if (!patientId) return '';
  const lead = (db.crmLeads || []).find((l) => l.patientId === patientId);
  return lead?.source ? String(lead.source) : '';
}

function getLeadSourceForAppointment(db, apt) {
  if (!apt) return '';
  if (apt.leadId) {
    const lead = (db.crmLeads || []).find((l) => l.id === apt.leadId);
    if (lead?.source) return String(lead.source);
  }
  if (apt.patientId) return getLeadSourceForPatient(db, apt.patientId);
  return '';
}

function findCollaboratorIdForUserId(db, userId) {
  if (!userId) return null;
  const access = (db.collaboratorAccess || []).find(
    (x) => (x.userId || x.user_id) === userId
  );
  const cid = access?.collaboratorId || access?.collaborator_id;
  return cid || null;
}

/**
 * Prioridade: 1) usuário do evento (quem confirmou/aprovou) → colaborador vinculado
 * 2) responsável do lead 3) colaborador fixo na regra 4) dentista da venda
 */
function resolvePayeeForClosingRule(db, patientId, professionalIdFromSale, rule, triggerUserId, leadId = null) {
  if (triggerUserId) {
    const fromActor = findCollaboratorIdForUserId(db, triggerUserId);
    if (fromActor) return fromActor;
  }
  let lead = null;
  if (leadId) lead = (db.crmLeads || []).find((l) => l.id === leadId);
  if (!lead && patientId) lead = (db.crmLeads || []).find((l) => l.patientId === patientId);
  if (lead?.assignedToUserId) {
    const fromLead = findCollaboratorIdForUserId(db, lead.assignedToUserId);
    if (fromLead) return fromLead;
  }
  if (rule.professional_id) return rule.professional_id;
  const role = normLower(rule.role);
  if (role === normLower(COMMISSION_ROLE.DENTISTA) || role === 'dentista') {
    return professionalIdFromSale || null;
  }
  return null;
}

function resolvePayeeForCheckinRule(db, apt, rule, triggerUserId) {
  if (triggerUserId) {
    const fromActor = findCollaboratorIdForUserId(db, triggerUserId);
    if (fromActor) return fromActor;
  }
  if (rule.professional_id) return rule.professional_id;
  const role = normLower(rule.role);
  if (role === normLower(COMMISSION_ROLE.DENTISTA) || role === 'dentista') {
    return apt.professionalId || apt.dentistId || null;
  }
  let lead = null;
  if (apt.leadId) lead = (db.crmLeads || []).find((l) => l.id === apt.leadId);
  if (!lead && apt.patientId) lead = (db.crmLeads || []).find((l) => l.patientId === apt.patientId);
  const uid = lead?.assignedToUserId || null;
  return findCollaboratorIdForUserId(db, uid);
}

function ruleSpecificity(rule) {
  let score = 0;
  if (rule.professional_id) score += 100;
  if (rule.procedure_id) score += 40;
  if (rule.specialty) score += 30;
  if (rule.role) score += 20;
  if (rule.lead_source) score += 25;
  return score;
}

function ruleMatchesTransaction(rule, tx) {
  if (rule.active === false) return false;

  if (rule.type === COMMISSION_RULE_TYPE.PATIENT_CHECKIN) {
    if (tx.commission_basis !== COMMISSION_BASIS.PATIENT_CHECKIN) return false;
    if (rule.professional_id && rule.professional_id !== tx.professional_id) return false;
    const rLead = rule.lead_source ? norm(rule.lead_source) : '';
    const txLead = tx.metadata?.lead_source ? norm(tx.metadata.lead_source) : '';
    if (rLead && rLead !== txLead) return false;
    return true;
  }

  if (isPatientClosingRuleType(rule.type)) {
    if (!isPatientClosingBasis(tx.commission_basis)) return false;
    if (rule.professional_id && rule.professional_id !== tx.professional_id) return false;
    const rLead = rule.lead_source ? norm(rule.lead_source) : '';
    const txLead = tx.metadata?.lead_source ? norm(tx.metadata.lead_source) : '';
    if (rLead && rLead !== txLead) return false;
    if (rule.specialty && normLower(rule.specialty) !== normLower(tx.specialty)) return false;
    if (rule.procedure_id && rule.procedure_id !== tx.procedure_id) return false;
    return true;
  }

  if (rule.professional_id && rule.professional_id !== tx.professional_id) return false;
  if (rule.role && normLower(rule.role) !== normLower(tx.role)) return false;
  if (rule.specialty && normLower(rule.specialty) !== normLower(tx.specialty)) return false;
  if (rule.procedure_id && rule.procedure_id !== tx.procedure_id) return false;
  if (rule.type === COMMISSION_RULE_TYPE.PRODUCTION && tx.commission_basis !== 'production') return false;
  if (rule.type === COMMISSION_RULE_TYPE.RECEIVED && tx.commission_basis !== 'received') return false;
  if (
    (rule.type === COMMISSION_RULE_TYPE.FIXED || rule.type === COMMISSION_RULE_TYPE.PROFIT) &&
    tx.commission_basis !== 'production'
  ) {
    return false;
  }
  return true;
}

function selectRuleForTransaction(rules, tx) {
  const matches = rules.filter((r) => ruleMatchesTransaction(r, tx));
  matches.sort((a, b) => {
    const pa = Number(a.priority || 999);
    const pb = Number(b.priority || 999);
    if (pa !== pb) return pa - pb;
    return ruleSpecificity(b) - ruleSpecificity(a);
  });
  return matches[0] || null;
}

function getTierPercentage(rule, amountBase) {
  const tiers = Array.isArray(rule?.metadata?.tiers) ? rule.metadata.tiers : [];
  if (tiers.length === 0) return Number(rule.percentage || 0);
  let selected = Number(rule.percentage || 0);
  tiers.forEach((tier) => {
    const min = Number(tier?.min || 0);
    const max = tier?.max !== undefined && tier?.max !== null && tier?.max !== '' ? Number(tier.max) : null;
    if (amountBase >= min && (max === null || amountBase <= max)) {
      selected = Number(tier.percentage || selected);
    }
  });
  return selected;
}

function calculateAmountByRule(rule, tx) {
  const baseFromApplyOn = rule.apply_on === 'net_value' ? toNumber(tx.amount_net) : toNumber(tx.amount_total);
  if (rule.type === COMMISSION_RULE_TYPE.PATIENT_CHECKIN) {
    const amt = toNumber(rule.fixed_amount);
    return {
      amount_base: amt,
      commission_amount: amt,
      metadata: { formula: 'patient_checkin_fixed' },
    };
  }
  if (isPatientClosingRuleType(rule.type)) {
    const base = baseFromApplyOn;
    const fixed = toNumber(rule.fixed_amount);
    const pct = Number(rule.percentage || 0);
    if (fixed > 0 && pct <= 0) {
      return {
        amount_base: base,
        commission_amount: fixed,
        metadata: { formula: 'patient_closing_fixed' },
      };
    }
    const appliedPct = getTierPercentage(rule, base);
    return {
      amount_base: base,
      commission_amount: (base * appliedPct) / 100,
      metadata: { formula: 'patient_closing_percentage', applied_percentage: appliedPct },
    };
  }
  if (rule.type === COMMISSION_RULE_TYPE.FIXED) {
    return {
      amount_base: baseFromApplyOn,
      commission_amount: toNumber(rule.fixed_amount),
      metadata: { formula: 'fixed_amount' },
    };
  }
  if (rule.type === COMMISSION_RULE_TYPE.PROFIT) {
    const profitBase = Math.max(toNumber(tx.revenue_amount) - toNumber(tx.cost_amount), 0);
    const pct = getTierPercentage(rule, profitBase);
    return {
      amount_base: profitBase,
      commission_amount: (profitBase * pct) / 100,
      metadata: { formula: 'profit_percentage', applied_percentage: pct },
    };
  }
  const pct = getTierPercentage(rule, baseFromApplyOn);
  return {
    amount_base: baseFromApplyOn,
    commission_amount: (baseFromApplyOn * pct) / 100,
    metadata: { formula: `${rule.type}_percentage`, applied_percentage: pct },
  };
}

function buildProductionTransactions(db, filters = {}) {
  const rows = [];
  const financings = listFinancings({});
  financings.forEach((f) => {
    if (!ACTIVE_FINANCING_STATUSES.has(f.status)) return;
    const referenceDate = toDay(f.created_at || f.issue_date);
    if (!isInRange(referenceDate, filters.startDate, filters.endDate)) return;
    rows.push({
      source_type: 'financing',
      source_id: f.id,
      source_reference_id: f.id,
      commission_basis: 'production',
      payment_id: null,
      professional_id: f.professional_id || null,
      role: 'dentista',
      specialty: getSpecialtyByProfessional(db, f.professional_id),
      procedure_id: f.treatment_plan_id || null,
      amount_total: toNumber(f.total_amount),
      amount_net: Math.max(toNumber(f.total_amount) - toNumber(f.discount_amount), 0),
      revenue_amount: toNumber(f.total_amount),
      cost_amount: getProcedureCost(db, f.treatment_plan_id),
      reference_date: referenceDate,
      metadata: { financing_status: f.status, description: f.description || '' },
    });
  });

  const receivables = listReceivables({});
  receivables.forEach((r) => {
    if (r.financing_id) return;
    if (EXCLUDED_RECEIVABLE_STATUSES.has(r.status)) return;
    const referenceDate = toDay(r.created_at || r.issue_date);
    if (!isInRange(referenceDate, filters.startDate, filters.endDate)) return;
    rows.push({
      source_type: 'receivable',
      source_id: r.id,
      source_reference_id: r.id,
      commission_basis: 'production',
      payment_id: null,
      professional_id: r.professional_id || null,
      role: 'dentista',
      specialty: getSpecialtyByProfessional(db, r.professional_id),
      procedure_id: r.treatment_plan_id || null,
      amount_total: toNumber(r.net_amount),
      amount_net: toNumber(r.net_amount),
      revenue_amount: toNumber(r.net_amount),
      cost_amount: getProcedureCost(db, r.treatment_plan_id),
      reference_date: referenceDate,
      metadata: { receivable_status: r.status, description: r.description || '' },
    });
  });
  return rows;
}

function buildReceivedTransactions(db, filters = {}) {
  const rows = [];
  const receivables = listReceivables({});
  const receivableById = new Map(receivables.map((r) => [r.id, r]));
  const financingById = new Map((Array.isArray(db.financings) ? db.financings : []).map((f) => [f.id, f]));
  const payments = Array.isArray(db.receivablePayments) ? db.receivablePayments : [];

  payments.forEach((p) => {
    const referenceDate = toDay(p.payment_date || p.created_at);
    if (!isInRange(referenceDate, filters.startDate, filters.endDate)) return;
    const recv = receivableById.get(p.receivable_id);
    if (!recv || EXCLUDED_RECEIVABLE_STATUSES.has(recv.status)) return;
    const hasFinancing = Boolean(recv.financing_id);
    const financing = hasFinancing ? financingById.get(recv.financing_id) : null;
    const effectiveReceived =
      toNumber(p.amount_received) + toNumber(p.interest_amount) + toNumber(p.fine_amount) - toNumber(p.discount_amount);
    if (effectiveReceived <= 0) return;
    rows.push({
      source_type: hasFinancing ? 'financing' : 'receivable',
      source_id: hasFinancing ? recv.financing_id : recv.id,
      source_reference_id: recv.id,
      commission_basis: 'received',
      payment_id: p.id,
      professional_id: recv.professional_id || financing?.professional_id || null,
      role: 'dentista',
      specialty: getSpecialtyByProfessional(db, recv.professional_id || financing?.professional_id),
      procedure_id: recv.treatment_plan_id || financing?.treatment_plan_id || null,
      amount_total: effectiveReceived,
      amount_net: effectiveReceived,
      revenue_amount: effectiveReceived,
      cost_amount: 0,
      reference_date: referenceDate,
      metadata: {
        receivable_id: recv.id,
        payment_method: p.payment_method || null,
        payment_date: p.payment_date || null,
      },
    });
  });
  return rows;
}

/** Só após “Confirmar chegada” na recepção (`checkInAt` preenchido). */
function appointmentQualifiesForCheckin(apt) {
  if (!apt || !apt.patientId) return false;
  if (apt.status === 'cancelado' || apt.status === 'faltou') return false;
  return Boolean(apt.checkInAt);
}

function buildPatientCheckinTransactions(db, filters = {}) {
  const rules = listCommissionRules({ onlyActive: true }).filter(
    (r) => r.type === COMMISSION_RULE_TYPE.PATIENT_CHECKIN
  );
  if (rules.length === 0) return [];

  const appointments = Array.isArray(db.appointments) ? db.appointments : [];
  const txs = [];
  const triggerUserId = filters.triggerUserId || null;

  for (const apt of appointments) {
    if (filters.appointmentId && apt.id !== filters.appointmentId) continue;
    if (!appointmentQualifiesForCheckin(apt)) continue;
    const refDate = toDay(apt.checkInAt || apt.date);
    if (!isInRange(refDate, filters.startDate, filters.endDate)) continue;

    const leadSource = getLeadSourceForAppointment(db, apt);
    const payees = new Set();
    for (const rule of rules) {
      if (rule.lead_source && norm(rule.lead_source) !== norm(leadSource)) continue;
      const payee = resolvePayeeForCheckinRule(db, apt, rule, triggerUserId);
      if (!payee) continue;
      if (rule.professional_id && rule.professional_id !== payee) continue;
      payees.add(payee);
    }
    for (const payee of payees) {
      txs.push({
        source_type: 'appointment',
        source_id: apt.id,
        source_reference_id: apt.id,
        commission_basis: COMMISSION_BASIS.PATIENT_CHECKIN,
        payment_id: null,
        professional_id: payee,
        role: COMMISSION_ROLE.RECEPCAO,
        specialty: '',
        procedure_id: null,
        amount_total: 0,
        amount_net: 0,
        revenue_amount: 0,
        cost_amount: 0,
        reference_date: refDate,
        metadata: {
          patient_id: apt.patientId,
          appointment_id: apt.id,
          lead_source: leadSource,
          appointment_status: apt.status || null,
        },
      });
    }
  }
  return txs;
}

function buildPatientClosingTransactions(db, filters = {}) {
  const rules = listCommissionRules({ onlyActive: true }).filter((r) => isPatientClosingRuleType(r.type));
  if (rules.length === 0) return [];

  const txs = [];
  const triggerUserId = filters.triggerUserId || null;

  const budgets = Array.isArray(db.crmBudgets) ? db.crmBudgets : [];
  for (const b of budgets) {
    if (filters.budgetId && b.id !== filters.budgetId) continue;
    if (b.status !== 'aprovado') continue;
    const patientId = b.patientId || null;
    if (!patientId) continue;
    const referenceDate = toDay(b.approvedAt || b.updatedAt || b.createdAt);
    if (!isInRange(referenceDate, filters.startDate, filters.endDate)) continue;
    const leadSource = getLeadSourceForPatient(db, patientId) || (b.leadId
      ? String((db.crmLeads || []).find((l) => l.id === b.leadId)?.source || '')
      : '');
    const payees = new Set();
    for (const rule of rules) {
      if (rule.lead_source && norm(rule.lead_source) !== norm(leadSource)) continue;
      const payee = resolvePayeeForClosingRule(
        db,
        patientId,
        null,
        rule,
        triggerUserId,
        b.leadId || null
      );
      if (!payee) continue;
      if (rule.professional_id && rule.professional_id !== payee) continue;
      payees.add(payee);
    }
    for (const payee of payees) {
      txs.push({
        source_type: 'crm_budget',
        source_id: b.id,
        source_reference_id: b.id,
        commission_basis: COMMISSION_BASIS.PATIENT_CLOSING,
        payment_id: null,
        professional_id: payee,
        role: COMMISSION_ROLE.COMERCIAL,
        specialty: '',
        procedure_id: null,
        amount_total: toNumber(b.totalValue),
        amount_net: toNumber(b.totalValue),
        revenue_amount: toNumber(b.totalValue),
        cost_amount: 0,
        reference_date: referenceDate,
        metadata: {
          patient_id: patientId,
          budget_id: b.id,
          lead_id: b.leadId || null,
          lead_source: leadSource,
          description: b.title || '',
        },
      });
    }
  }

  const financings = listFinancings({});
  for (const f of financings) {
    if (filters.financingId && f.id !== filters.financingId) continue;
    if (!ACTIVE_FINANCING_STATUSES.has(f.status)) continue;
    const referenceDate = toDay(f.created_at || f.issue_date);
    if (!isInRange(referenceDate, filters.startDate, filters.endDate)) continue;
    const leadSource = getLeadSourceForPatient(db, f.patient_id);
    const payees = new Set();
    for (const rule of rules) {
      if (rule.lead_source && norm(rule.lead_source) !== norm(leadSource)) continue;
      const payee = resolvePayeeForClosingRule(
        db,
        f.patient_id,
        f.professional_id || null,
        rule,
        triggerUserId,
        null
      );
      if (!payee) continue;
      if (rule.professional_id && rule.professional_id !== payee) continue;
      payees.add(payee);
    }
    for (const payee of payees) {
      txs.push({
        source_type: 'financing',
        source_id: f.id,
        source_reference_id: f.id,
        commission_basis: COMMISSION_BASIS.PATIENT_CLOSING,
        payment_id: null,
        professional_id: payee,
        role: COMMISSION_ROLE.DENTISTA,
        specialty: getSpecialtyByProfessional(db, f.professional_id),
        procedure_id: f.treatment_plan_id || null,
        amount_total: toNumber(f.total_amount),
        amount_net: Math.max(toNumber(f.total_amount) - toNumber(f.discount_amount), 0),
        revenue_amount: toNumber(f.total_amount),
        cost_amount: getProcedureCost(db, f.treatment_plan_id),
        reference_date: referenceDate,
        metadata: {
          patient_id: f.patient_id,
          lead_source: leadSource,
          financing_status: f.status,
          description: f.description || '',
        },
      });
    }
  }

  const receivables = listReceivables({});
  for (const r of receivables) {
    if (filters.receivableId && r.id !== filters.receivableId) continue;
    if (r.financing_id) continue;
    if (EXCLUDED_RECEIVABLE_STATUSES.has(r.status)) continue;
    if (r.origin_type === 'financing') continue;
    const referenceDate = toDay(r.created_at || r.issue_date);
    if (!isInRange(referenceDate, filters.startDate, filters.endDate)) continue;
    const leadSource = getLeadSourceForPatient(db, r.patient_id);
    const payees = new Set();
    for (const rule of rules) {
      if (rule.lead_source && norm(rule.lead_source) !== norm(leadSource)) continue;
      const payee = resolvePayeeForClosingRule(
        db,
        r.patient_id,
        r.professional_id || null,
        rule,
        triggerUserId,
        null
      );
      if (!payee) continue;
      if (rule.professional_id && rule.professional_id !== payee) continue;
      payees.add(payee);
    }
    for (const payee of payees) {
      txs.push({
        source_type: 'receivable',
        source_id: r.id,
        source_reference_id: r.id,
        commission_basis: COMMISSION_BASIS.PATIENT_CLOSING,
        payment_id: null,
        professional_id: payee,
        role: COMMISSION_ROLE.DENTISTA,
        specialty: getSpecialtyByProfessional(db, r.professional_id),
        procedure_id: r.treatment_plan_id || null,
        amount_total: toNumber(r.net_amount),
        amount_net: toNumber(r.net_amount),
        revenue_amount: toNumber(r.net_amount),
        cost_amount: getProcedureCost(db, r.treatment_plan_id),
        reference_date: referenceDate,
        metadata: {
          patient_id: r.patient_id,
          lead_source: leadSource,
          receivable_status: r.status,
          description: r.description || '',
        },
      });
    }
  }

  return txs;
}

function buildUniqueKey(tx, ruleId) {
  return [
    tx.source_type,
    tx.source_id,
    tx.source_reference_id || '',
    tx.commission_basis,
    tx.reference_date,
    tx.payment_id || '',
    tx.professional_id || '',
    tx.role || '',
    ruleId,
  ].join(':');
}

function upsertCommissionRows(db, rows, actorId = null) {
  db.commissions = Array.isArray(db.commissions) ? db.commissions : [];
  const existingByKey = new Map();
  db.commissions.forEach((c) => {
    const key = c?.metadata?.unique_key;
    if (key) existingByKey.set(key, c);
  });
  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;

  const persisted = rows.map((row) => {
    const key = row.metadata.unique_key;
    const found = key ? existingByKey.get(key) : null;
    if (found) {
      if (found.status === COMMISSION_STATUS.REVERSED) {
        return found;
      }
      found.amount_base = row.amount_base;
      found.commission_amount = row.commission_amount;
      found.status = found.status || COMMISSION_STATUS.PENDING;
      found.reference_date = row.reference_date;
      found.metadata = { ...(found.metadata || {}), ...(row.metadata || {}) };
      found.updated_at = now;
      found.updated_by = actorId;
      updated += 1;
      return found;
    }
    const createdRow = {
      ...row,
      id: createId('comm'),
      status: row.status || COMMISSION_STATUS.PENDING,
      created_at: now,
      updated_at: now,
      created_by: actorId,
      updated_by: actorId,
    };
    db.commissions.push(createdRow);
    created += 1;
    return createdRow;
  });
  return { persisted, created, updated };
}

export function calculateCommissionForTransaction(transaction, options = {}) {
  const db = options.db || loadDb();
  const rules = options.rules || listCommissionRules({ onlyActive: true });
  const tx = {
    source_type: transaction.source_type || 'receivable',
    source_id: transaction.source_id || null,
    source_reference_id: transaction.source_reference_id || transaction.source_id || null,
    commission_basis: transaction.commission_basis || 'production',
    payment_id: transaction.payment_id || null,
    professional_id: transaction.professional_id || null,
    role: transaction.role || 'dentista',
    specialty: norm(transaction.specialty),
    procedure_id: transaction.procedure_id || null,
    amount_total: toNumber(transaction.amount_total),
    amount_net: toNumber(transaction.amount_net ?? transaction.amount_total),
    revenue_amount: toNumber(transaction.revenue_amount ?? transaction.amount_total),
    cost_amount: toNumber(transaction.cost_amount || 0),
    reference_date: transaction.reference_date || toDay(new Date().toISOString()),
    metadata: transaction.metadata && typeof transaction.metadata === 'object' ? transaction.metadata : {},
  };
  const rule = selectRuleForTransaction(rules, tx);
  if (!rule) return null;
  const calc = calculateAmountByRule(rule, tx);
  const commissionAmount = Number(calc.commission_amount || 0);
  if (commissionAmount <= 0) return null;
  const uniqueKey = buildUniqueKey(tx, rule.id);
  return {
    professional_id: tx.professional_id,
    role: rule.role || tx.role,
    source_type: tx.source_type,
    source_id: tx.source_id,
    amount_base: Number(calc.amount_base || 0),
    commission_amount: commissionAmount,
    rule_id: rule.id,
    status: COMMISSION_STATUS.PENDING,
    reference_date: tx.reference_date,
    payment_date: null,
    metadata: {
      ...tx.metadata,
      ...calc.metadata,
      unique_key: uniqueKey,
      commission_basis: tx.commission_basis,
      source_reference_id: tx.source_reference_id,
      payment_id: tx.payment_id,
      rule_name: rule.name,
      rule_priority: rule.priority,
    },
  };
}

export function calculateCommissionForFinancing(financing) {
  if (!financing) return null;
  return calculateCommissionForTransaction({
    source_type: 'financing',
    source_id: financing.id,
    source_reference_id: financing.id,
    commission_basis: 'production',
    professional_id: financing.professional_id || null,
    role: 'dentista',
    specialty: '',
    procedure_id: financing.treatment_plan_id || null,
    amount_total: toNumber(financing.total_amount),
    amount_net: Math.max(toNumber(financing.total_amount) - toNumber(financing.discount_amount), 0),
    revenue_amount: toNumber(financing.total_amount),
    cost_amount: 0,
    reference_date: toDay(financing.created_at || financing.issue_date),
    metadata: { financing_status: financing.status || null },
  });
}

export function calculateCommissionForReceivable(receivable) {
  if (!receivable) return null;
  return calculateCommissionForTransaction({
    source_type: receivable.financing_id ? 'financing' : 'receivable',
    source_id: receivable.financing_id || receivable.id,
    source_reference_id: receivable.id,
    commission_basis: 'production',
    professional_id: receivable.professional_id || null,
    role: 'dentista',
    specialty: '',
    procedure_id: receivable.treatment_plan_id || null,
    amount_total: toNumber(receivable.net_amount),
    amount_net: toNumber(receivable.net_amount),
    revenue_amount: toNumber(receivable.net_amount),
    cost_amount: 0,
    reference_date: toDay(receivable.created_at || receivable.issue_date),
    metadata: { receivable_status: receivable.status || null },
  });
}

export function listCommissions(filters = {}) {
  const db = loadDb();
  let items = Array.isArray(db.commissions) ? [...db.commissions] : [];
  if (filters.professional_id) items = items.filter((c) => c.professional_id === filters.professional_id);
  if (filters.role) items = items.filter((c) => normLower(c.role) === normLower(filters.role));
  if (filters.source_type) items = items.filter((c) => c.source_type === filters.source_type);
  if (filters.status) items = items.filter((c) => c.status === filters.status);
  if (filters.commission_basis && filters.commission_basis !== 'all') {
    items = items.filter((c) => {
      const meta = c.metadata?.commission_basis;
      if (meta) {
        if (meta === filters.commission_basis) return true;
        if (
          filters.commission_basis === COMMISSION_BASIS.PATIENT_CLOSING &&
          meta === LEGACY_CLOSING_BASIS
        ) {
          return true;
        }
        return false;
      }
      if (filters.commission_basis === COMMISSION_BASIS.RECEIVED) {
        return Boolean(c.metadata?.payment_id);
      }
      if (filters.commission_basis === COMMISSION_BASIS.PRODUCTION) {
        return !c.metadata?.payment_id;
      }
      return false;
    });
  }
  if (filters.startDate) items = items.filter((c) => (c.reference_date || '') >= filters.startDate);
  if (filters.endDate) items = items.filter((c) => (c.reference_date || '') <= filters.endDate);
  items.sort((a, b) => String(b.reference_date || '').localeCompare(String(a.reference_date || '')));
  return items;
}

export function setCommissionStatus(user, commissionId, status, paymentDate = null) {
  requirePermission(user, 'finance:write');
  if (!Object.values(COMMISSION_STATUS).includes(status)) throw new Error('Status de comissão inválido.');
  return withDb((db) => {
    db.commissions = Array.isArray(db.commissions) ? db.commissions : [];
    const idx = db.commissions.findIndex((c) => c.id === commissionId);
    if (idx < 0) throw new Error('Comissão não encontrada.');
    db.commissions[idx].status = status;
    db.commissions[idx].payment_date = paymentDate || (status === COMMISSION_STATUS.PAID ? toDay(new Date().toISOString()) : null);
    db.commissions[idx].updated_at = new Date().toISOString();
    db.commissions[idx].updated_by = user?.id || null;
    return db.commissions[idx];
  });
}

export function calculateCommissionForPeriod(filters = {}, options = {}) {
  const db = loadDb();
  const rules = listCommissionRules({ onlyActive: true });
  const production = buildProductionTransactions(db, filters);
  const received = buildReceivedTransactions(db, filters);
  const checkin = buildPatientCheckinTransactions(db, filters);
  const closing = buildPatientClosingTransactions(db, filters);
  const includeBasis = filters.commission_basis || 'all';
  const selectedTransactions = [...production, ...received, ...checkin, ...closing].filter((tx) => {
    if (includeBasis === 'all') return true;
    if (includeBasis === COMMISSION_BASIS.PATIENT_CLOSING && tx.commission_basis === LEGACY_CLOSING_BASIS) {
      return true;
    }
    return tx.commission_basis === includeBasis;
  });
  const calculated = selectedTransactions
    .map((tx) => calculateCommissionForTransaction(tx, { db, rules }))
    .filter(Boolean);

  let persisted = [];
  let created = 0;
  let updated = 0;
  if (options.persist !== false) {
    const actorId = options.actor?.id || null;
    const result = withDb((state) => upsertCommissionRows(state, calculated, actorId));
    persisted = result.persisted;
    created = result.created;
    updated = result.updated;
  }

  return {
    transactions_count: selectedTransactions.length,
    calculated_count: calculated.length,
    created_count: created,
    updated_count: updated,
    commissions: options.persist === false ? calculated : persisted,
  };
}

function commissionBasisLabel(basis) {
  if (basis === COMMISSION_BASIS.RECEIVED) return 'Recebimento';
  if (basis === COMMISSION_BASIS.PATIENT_CHECKIN) return 'Comparecimento';
  if (isPatientClosingBasis(basis)) return 'Fechamento';
  return 'Produção';
}

export function getCommissionsDashboard(filters = {}) {
  const db = loadDb();
  const dashboardFilters = { ...filters };
  if (dashboardFilters.commission_basis === 'all') {
    delete dashboardFilters.commission_basis;
  }
  let commissions = listCommissions(dashboardFilters);
  commissions = commissions.filter((c) => c.status !== COMMISSION_STATUS.REVERSED);

  const collaborators = Array.isArray(db.collaborators) ? db.collaborators : [];
  const getProfessionalName = (id) => {
    const c = collaborators.find((x) => x.id === id);
    return c ? (c.apelido || c.nomeCompleto || id) : (id || 'Sem profissional');
  };
  const total = commissions.reduce((s, c) => s + toNumber(c.commission_amount), 0);
  const pending = commissions
    .filter((c) => c.status === COMMISSION_STATUS.PENDING || c.status === COMMISSION_STATUS.AVAILABLE)
    .reduce((s, c) => s + toNumber(c.commission_amount), 0);
  const paid = commissions
    .filter((c) => c.status === COMMISSION_STATUS.PAID)
    .reduce((s, c) => s + toNumber(c.commission_amount), 0);

  const byProfessionalMap = new Map();
  const bySpecialtyMap = new Map();
  const byTypeMap = new Map();
  const rankingCheckinMap = new Map();
  const rankingClosingMap = new Map();
  let totalCheckin = 0;
  let totalClosing = 0;
  const checkinPatients = new Set();
  const closingPatients = new Set();

  commissions.forEach((c) => {
    const pro = getProfessionalName(c.professional_id);
    byProfessionalMap.set(pro, (byProfessionalMap.get(pro) || 0) + toNumber(c.commission_amount));
    const specialty = c.metadata?.specialty || 'Não informado';
    bySpecialtyMap.set(specialty, (bySpecialtyMap.get(specialty) || 0) + toNumber(c.commission_amount));
    const basisRaw = c.metadata?.commission_basis || COMMISSION_BASIS.PRODUCTION;
    const t = commissionBasisLabel(basisRaw);
    byTypeMap.set(t, (byTypeMap.get(t) || 0) + toNumber(c.commission_amount));
    if (basisRaw === COMMISSION_BASIS.PATIENT_CHECKIN) {
      totalCheckin += toNumber(c.commission_amount);
      if (c.metadata?.patient_id) checkinPatients.add(c.metadata.patient_id);
      rankingCheckinMap.set(pro, (rankingCheckinMap.get(pro) || 0) + toNumber(c.commission_amount));
    }
    if (isPatientClosingBasis(basisRaw)) {
      totalClosing += toNumber(c.commission_amount);
      if (c.metadata?.patient_id) closingPatients.add(c.metadata.patient_id);
      rankingClosingMap.set(pro, (rankingClosingMap.get(pro) || 0) + toNumber(c.commission_amount));
    }
  });

  const toArray = (map, key) => [...map.entries()]
    .map(([label, value]) => ({ [key]: label, value }))
    .sort((a, b) => b.value - a.value);

  const uniqueCheckins = checkinPatients.size;
  const uniqueClosings = closingPatients.size;
  const conversionRatePercent =
    uniqueCheckins > 0 ? Math.round((uniqueClosings / uniqueCheckins) * 1000) / 10 : null;

  return {
    total,
    pending,
    paid,
    count: commissions.length,
    totalCheckin,
    totalClosing,
    totalConversion: totalClosing,
    conversionRatePercent,
    uniqueCheckins,
    uniqueClosings,
    uniqueConversions: uniqueClosings,
    rankingByProfessional: toArray(byProfessionalMap, 'professional').slice(0, 10),
    rankingByCheckin: toArray(rankingCheckinMap, 'professional').slice(0, 10),
    rankingByClosing: toArray(rankingClosingMap, 'professional').slice(0, 10),
    bySpecialty: toArray(bySpecialtyMap, 'specialty').slice(0, 12),
    byType: toArray(byTypeMap, 'type'),
  };
}

/** Sincroniza comissões de comparecimento (chamado pela agenda; sem exigir finance:write). */
export function syncCheckinCommissionsForAppointment(user, appointmentId) {
  if (!appointmentId) return { created: 0, updated: 0 };
  const db = loadDb();
  const rules = listCommissionRules({ onlyActive: true });
  if (!rules.some((r) => r.type === COMMISSION_RULE_TYPE.PATIENT_CHECKIN)) {
    return { created: 0, updated: 0 };
  }
  const txs = buildPatientCheckinTransactions(db, { appointmentId, triggerUserId: user?.id || null });
  const calculated = txs
    .map((tx) => calculateCommissionForTransaction(tx, { db, rules }))
    .filter(Boolean);
  if (calculated.length === 0) return { created: 0, updated: 0 };
  return withDb((state) => upsertCommissionRows(state, calculated, user?.id || null));
}

/** Sincroniza comissões de fechamento para orçamento CRM aprovado. */
export function syncClosingCommissionsForBudget(user, budgetId) {
  if (!budgetId) return { created: 0, updated: 0 };
  const db = loadDb();
  const rules = listCommissionRules({ onlyActive: true });
  if (!rules.some((r) => isPatientClosingRuleType(r.type))) {
    return { created: 0, updated: 0 };
  }
  const txs = buildPatientClosingTransactions(db, {
    budgetId,
    triggerUserId: user?.id || null,
  });
  const calculated = txs
    .map((tx) => calculateCommissionForTransaction(tx, { db, rules }))
    .filter(Boolean);
  if (calculated.length === 0) return { created: 0, updated: 0 };
  return withDb((state) => upsertCommissionRows(state, calculated, user?.id || null));
}

/** Sincroniza comissões de fechamento para financiamento aprovado/ativo. */
export function syncClosingCommissionsForFinancing(user, financingId) {
  if (!financingId) return { created: 0, updated: 0 };
  const db = loadDb();
  const rules = listCommissionRules({ onlyActive: true });
  if (!rules.some((r) => isPatientClosingRuleType(r.type))) {
    return { created: 0, updated: 0 };
  }
  const txs = buildPatientClosingTransactions(db, {
    financingId,
    triggerUserId: user?.id || null,
  });
  const calculated = txs
    .map((tx) => calculateCommissionForTransaction(tx, { db, rules }))
    .filter(Boolean);
  if (calculated.length === 0) return { created: 0, updated: 0 };
  return withDb((state) => upsertCommissionRows(state, calculated, user?.id || null));
}

/** Sincroniza comissões de fechamento para título à vista (sem parcelamento). */
export function syncClosingCommissionsForReceivable(user, receivableId) {
  if (!receivableId) return { created: 0, updated: 0 };
  const db = loadDb();
  const rules = listCommissionRules({ onlyActive: true });
  if (!rules.some((r) => isPatientClosingRuleType(r.type))) {
    return { created: 0, updated: 0 };
  }
  const txs = buildPatientClosingTransactions(db, {
    receivableId,
    triggerUserId: user?.id || null,
  });
  const calculated = txs
    .map((tx) => calculateCommissionForTransaction(tx, { db, rules }))
    .filter(Boolean);
  if (calculated.length === 0) return { created: 0, updated: 0 };
  return withDb((state) => upsertCommissionRows(state, calculated, user?.id || null));
}

export function reverseClosingCommissionsForFinancing(user, financingId, reason = '') {
  requirePermission(user, 'finance:write');
  if (!financingId) return 0;
  return withDb((db) => {
    const now = new Date().toISOString();
    let n = 0;
    db.commissions = Array.isArray(db.commissions) ? db.commissions : [];
    db.commissions.forEach((c) => {
      if (!isPatientClosingBasis(c.metadata?.commission_basis)) return;
      if (c.source_type !== 'financing') return;
      if (c.source_id !== financingId) return;
      if (c.status === COMMISSION_STATUS.REVERSED) return;
      c.status = COMMISSION_STATUS.REVERSED;
      c.metadata = {
        ...(c.metadata || {}),
        reversed_at: now,
        reversed_reason: reason || 'Financiamento cancelado',
      };
      c.updated_at = now;
      c.updated_by = user?.id || null;
      n += 1;
    });
    return n;
  });
}

export function reverseClosingCommissionsForBudget(user, budgetId, reason = '') {
  requirePermission(user, 'finance:write');
  if (!budgetId) return 0;
  return withDb((db) => {
    const now = new Date().toISOString();
    let n = 0;
    db.commissions = Array.isArray(db.commissions) ? db.commissions : [];
    db.commissions.forEach((c) => {
      if (!isPatientClosingBasis(c.metadata?.commission_basis)) return;
      if (c.source_type !== 'crm_budget') return;
      if (c.source_id !== budgetId) return;
      if (c.status === COMMISSION_STATUS.REVERSED) return;
      c.status = COMMISSION_STATUS.REVERSED;
      c.metadata = {
        ...(c.metadata || {}),
        reversed_at: now,
        reversed_reason: reason || 'Orçamento desfeito ou negado',
      };
      c.updated_at = now;
      c.updated_by = user?.id || null;
      n += 1;
    });
    return n;
  });
}

/** Estorna comissões de comparecimento ligadas ao agendamento (ex.: desfazer check-in). */
export function reverseCheckinCommissionsForAppointment(user, appointmentId, reason = '') {
  requirePermission(user, 'agenda:write');
  if (!appointmentId) return 0;
  return withDb((db) => {
    const now = new Date().toISOString();
    let n = 0;
    db.commissions = Array.isArray(db.commissions) ? db.commissions : [];
    db.commissions.forEach((c) => {
      if (c.metadata?.commission_basis !== COMMISSION_BASIS.PATIENT_CHECKIN) return;
      if (c.source_type !== 'appointment') return;
      if (c.source_id !== appointmentId && c.metadata?.appointment_id !== appointmentId) return;
      if (c.status === COMMISSION_STATUS.REVERSED) return;
      c.status = COMMISSION_STATUS.REVERSED;
      c.metadata = {
        ...(c.metadata || {}),
        reversed_at: now,
        reversed_reason: reason || 'Chegada desfeita na recepção',
      };
      c.updated_at = now;
      c.updated_by = user?.id || null;
      n += 1;
    });
    return n;
  });
}

/** @deprecated use syncClosingCommissionsForFinancing */
export const syncConversionCommissionsForFinancing = syncClosingCommissionsForFinancing;
/** @deprecated use syncClosingCommissionsForReceivable */
export const syncConversionCommissionsForReceivable = syncClosingCommissionsForReceivable;
/** @deprecated use reverseClosingCommissionsForFinancing */
export const reverseConversionCommissionsForFinancing = reverseClosingCommissionsForFinancing;
