/**
 * Serviço de Orçamentos do CRM (crm_budgets).
 * Regras: em_analise → cria follow-up; aprovado → cria/vincula paciente; negado → motivo obrigatório.
 */

import { withDb, loadDb } from '../db/index.js';
import { createId } from './helpers.js';
import { addLeadEvent, moveLeadToStage, convertLeadToPatient } from './crmService.js';
import { CRM_EVENT_TYPE } from './crmService.js';
import { createTask, TASK_TYPE } from './crmTaskService.js';
import { createPatientFromLead } from './patientService.js';

const DEFAULT_CLINIC_ID = 'clinic-1';
/** Dias para vencimento da tarefa de follow-up quando orçamento fica "em análise" */
const FOLLOWUP_BUDGET_DAYS = 2;

export const BUDGET_STATUS = {
  EM_ANALISE: 'em_analise',
  APROVADO: 'aprovado',
  NEGADO: 'negado',
};

export const BUDGET_STATUS_LABELS = {
  [BUDGET_STATUS.EM_ANALISE]: 'Em análise',
  [BUDGET_STATUS.APROVADO]: 'Aprovado',
  [BUDGET_STATUS.NEGADO]: 'Negado',
};

function getClinicId() {
  const db = loadDb();
  return db?.clinicProfile?.id || DEFAULT_CLINIC_ID;
}

/**
 * Calcula total a partir de itemsJson. itemsJson: [{ description, value }, ...].
 */
function totalFromItems(itemsJson) {
  if (!Array.isArray(itemsJson) || itemsJson.length === 0) return 0;
  return itemsJson.reduce((sum, item) => sum + (Number(item?.value) || 0), 0);
}

/**
 * Cria orçamento vinculado ao lead, registro em crm_budget_links e evento na timeline.
 * @param {Object} user
 * @param {Object} data - { leadId, title, itemsJson, totalValue? }
 */
export function createCrmBudget(user, data) {
  const clinicId = data.clinicId || getClinicId();
  const leadId = data.leadId;
  const title = (data.title || '').trim();
  const itemsJson = Array.isArray(data.itemsJson) ? data.itemsJson : [];

  if (!leadId) throw new Error('Lead é obrigatório.');
  if (!title) throw new Error('Título do orçamento é obrigatório.');

  const totalValue = data.totalValue != null ? Number(data.totalValue) : totalFromItems(itemsJson);

  return withDb((db) => {
    const lead = (db.crmLeads || []).find((l) => l.id === leadId);
    if (!lead) throw new Error('Lead não encontrado.');

    if (!db.crmBudgets) db.crmBudgets = [];
    if (!db.crmBudgetLinks) db.crmBudgetLinks = [];

    const now = new Date().toISOString();
    const id = createId('crmbudget');

    const budget = {
      id,
      clinicId,
      leadId,
      patientId: null,
      title,
      totalValue,
      itemsJson,
      status: BUDGET_STATUS.EM_ANALISE,
      deniedReason: null,
      createdBy: user?.id || null,
      createdAt: now,
      updatedAt: now,
      approvedAt: null,
      deniedAt: null,
    };

    db.crmBudgets.push(budget);

    const link = {
      id: createId('crmbl'),
      clinicId,
      leadId,
      budgetId: id,
      createdAt: now,
    };
    db.crmBudgetLinks.push(link);

    addLeadEvent(user, leadId, CRM_EVENT_TYPE.BUDGET_CREATED, {
      budgetId: id,
      title,
      totalValue,
      description: `Orçamento criado: ${title}`,
    });

    return { budget, leadId: budget.leadId };
  });

  // Follow-up fora do withDb para não aninhar persistência
  const due = new Date();
  due.setDate(due.getDate() + FOLLOWUP_BUDGET_DAYS);
  createTask(user, {
    leadId: result.leadId,
    title: 'Retornar orçamento',
    type: TASK_TYPE.FOLLOWUP_BUDGET,
    dueAt: due.toISOString(),
    budgetId: result.budget.id,
  });
  addLeadEvent(user, result.leadId, CRM_EVENT_TYPE.BUDGET_EM_ANALISE_FOLLOWUP, {
    budgetId: result.budget.id,
    description: 'Orçamento em análise → Follow-up criado',
  });

  return result.budget;
}

/**
 * Lista orçamentos com filtros por clinicId, período, status, busca.
 * @param {Object} opts - { clinicId?, range?: { start, end }, status?, query?, assignedToUserId? }
 */
export function listCrmBudgets(opts = {}) {
  const db = loadDb();
  const clinicId = opts.clinicId || getClinicId();
  let list = [...(db.crmBudgets || [])].filter((b) => b.clinicId === clinicId);

  if (opts.status) list = list.filter((b) => b.status === opts.status);

  if (opts.range?.start || opts.range?.end) {
    const start = opts.range.start ? new Date(opts.range.start).getTime() : 0;
    const end = opts.range.end ? new Date(opts.range.end).getTime() : Number.MAX_SAFE_INTEGER;
    list = list.filter((b) => {
      const t = new Date(b.createdAt).getTime();
      return t >= start && t <= end;
    });
  }

  if (opts.assignedToUserId) {
    const leadIds = (db.crmLeads || [])
      .filter((l) => l.assignedToUserId === opts.assignedToUserId)
      .map((l) => l.id);
    list = list.filter((b) => leadIds.includes(b.leadId));
  }

  if (opts.query && opts.query.trim()) {
    const q = opts.query.trim().toLowerCase();
    const leadIds = (db.crmLeads || []).filter(
      (l) =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.phone || '').includes(q)
    ).map((l) => l.id);
    list = list.filter(
      (b) =>
        leadIds.includes(b.leadId) ||
        (b.title || '').toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  return list;
}

/**
 * Retorna um orçamento por id.
 */
export function getCrmBudgetById(budgetId) {
  const db = loadDb();
  return (db.crmBudgets || []).find((b) => b.id === budgetId) || null;
}

/**
 * Atualiza título e itens do orçamento; recalcula totalValue.
 */
export function updateCrmBudget(user, budgetId, data) {
  const { title, itemsJson } = data;
  return withDb((db) => {
    const idx = (db.crmBudgets || []).findIndex((b) => b.id === budgetId);
    if (idx < 0) throw new Error('Orçamento não encontrado.');
    const budget = db.crmBudgets[idx];
    const nextItems = Array.isArray(itemsJson) ? itemsJson : budget.itemsJson || [];
    const totalValue = totalFromItems(nextItems);
    const now = new Date().toISOString();
    db.crmBudgets[idx] = {
      ...budget,
      title: (title != null && String(title).trim()) ? String(title).trim() : budget.title,
      itemsJson: nextItems,
      totalValue,
      updatedAt: now,
    };
    return db.crmBudgets[idx];
  });
}

/**
 * Atualiza status do orçamento e aplica regras automáticas:
 * - em_analise: cria tarefa follow-up (Retornar orçamento) e registra na timeline
 * - aprovado: cria/vincula paciente, atualiza budget.patientId e lead, timeline, opcional moveLead stage
 * - negado: exige deniedReason, salva deniedAt, timeline
 */
export function updateCrmBudgetStatus(user, payload) {
  const { budgetId, status, deniedReason } = payload;

  if (!budgetId || !status) throw new Error('budgetId e status são obrigatórios.');
  if (status === BUDGET_STATUS.NEGADO && !(deniedReason && String(deniedReason).trim())) {
    throw new Error('Motivo da negativa é obrigatório quando o orçamento é negado.');
  }

  return withDb((db) => {
    const idx = (db.crmBudgets || []).findIndex((b) => b.id === budgetId);
    if (idx < 0) throw new Error('Orçamento não encontrado.');
    const budget = db.crmBudgets[idx];
    const lead = (db.crmLeads || []).find((l) => l.id === budget.leadId);
    if (!lead) throw new Error('Lead do orçamento não encontrado.');

    const now = new Date().toISOString();
    const prevStatus = budget.status;

    if (status === BUDGET_STATUS.NEGADO) {
      db.crmBudgets[idx] = {
        ...budget,
        status: BUDGET_STATUS.NEGADO,
        deniedReason: String(deniedReason).trim(),
        deniedAt: now,
        updatedAt: now,
      };
      addLeadEvent(user, budget.leadId, CRM_EVENT_TYPE.BUDGET_REJECTED, {
        budgetId,
        deniedReason: String(deniedReason).trim(),
        description: `Orçamento negado • Motivo: ${String(deniedReason).trim()}`,
      });
      try {
        moveLeadToStage(user, budget.leadId, 'perdido', { lossReason: deniedReason });
      } catch {
        // etapa "perdido" pode não existir
      }
      return db.crmBudgets[idx];
    }

    if (status === BUDGET_STATUS.APROVADO) {
      let patientId = lead.patientId || budget.patientId;
      if (!patientId) {
        const { patientId: newId } = createPatientFromLead(user, lead);
        patientId = newId;
        convertLeadToPatient(user, budget.leadId, patientId);
      } else {
        convertLeadToPatient(user, budget.leadId, patientId);
      }
      db.crmBudgets[idx] = {
        ...budget,
        status: BUDGET_STATUS.APROVADO,
        patientId,
        approvedAt: now,
        updatedAt: now,
      };
      addLeadEvent(user, budget.leadId, CRM_EVENT_TYPE.BUDGET_APPROVED, {
        budgetId,
        patientId,
        description: 'Orçamento aprovado → Paciente criado/vinculado',
      });
      try {
        moveLeadToStage(user, budget.leadId, 'aprovado');
      } catch {
        // etapa pode não existir
      }
      return db.crmBudgets[idx];
    }

    if (status === BUDGET_STATUS.EM_ANALISE) {
      db.crmBudgets[idx] = {
        ...budget,
        status: BUDGET_STATUS.EM_ANALISE,
        updatedAt: now,
      };
      const due = new Date();
      due.setDate(due.getDate() + FOLLOWUP_BUDGET_DAYS);
      createTask(user, {
        leadId: budget.leadId,
        title: 'Retornar orçamento',
        type: TASK_TYPE.FOLLOWUP_BUDGET,
        dueAt: due.toISOString(),
        budgetId: budget.id,
      });
      addLeadEvent(user, budget.leadId, CRM_EVENT_TYPE.BUDGET_EM_ANALISE_FOLLOWUP, {
        budgetId,
        description: 'Orçamento em análise → Follow-up criado',
      });
      return db.crmBudgets[idx];
    }

    return budget;
  });
}

/**
 * KPIs de orçamentos no período (e totais).
 * @param {Object} opts - { clinicId?, range?: { start, end } }
 */
export function getCrmBudgetKPIs(opts = {}) {
  const list = listCrmBudgets({ ...opts });
  const emAnalise = list.filter((b) => b.status === BUDGET_STATUS.EM_ANALISE).length;
  const aprovados = list.filter((b) => b.status === BUDGET_STATUS.APROVADO).length;
  const negados = list.filter((b) => b.status === BUDGET_STATUS.NEGADO).length;
  const total = list.length;
  const taxaAprovacao = total > 0 ? Math.round((aprovados / total) * 100) : 0;
  return {
    total,
    emAnalise,
    aprovados,
    negados,
    taxaAprovacao,
  };
}
