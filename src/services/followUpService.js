/**
 * Follow-ups estratégicos (Gestão Comercial).
 * Tabela: followUps. Campos: id, clinicId, patientId, budgetId?, originType, type, description, dueDate, priority, status, assignedTo, createdAt, completedAt.
 * @typedef {Object} FollowUp
 * @property {string} id
 * @property {string} clinicId
 * @property {string} [patientId]
 * @property {string} [leadId]
 * @property {string} [budgetId]
 * @property {string} originType - 'crm' | 'agenda' | 'orcamento' | 'manual'
 * @property {string} type - 'retorno' | 'clinico' | 'comercial' | 'orcamento_pendente'
 * @property {string} [description]
 * @property {string} dueDate - ISO date
 * @property {string} priority - 'low' | 'medium' | 'high'
 * @property {string} status - 'pending' | 'completed' | 'cancelled'
 * @property {string} [assignedTo]
 * @property {string} createdAt
 * @property {string} [completedAt]
 */

import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';

const DEFAULT_CLINIC_ID = 'clinic-1';

const getClinicId = () => {
  const db = loadDb();
  return db?.clinicProfile?.id || DEFAULT_CLINIC_ID;
};

/**
 * @param {Object} [filters]
 * @param {string} [filters.clinicId]
 * @param {string} [filters.patientId]
 * @param {string} [filters.leadId]
 * @param {string} [filters.status] - 'pending' | 'completed'
 * @returns {FollowUp[]}
 */
export function listFollowUps(filters = {}) {
  const db = loadDb();
  const clinicId = filters.clinicId || getClinicId();
  let list = [...(db.followUps || [])].filter((f) => f.clinicId === clinicId);
  if (filters.patientId) list = list.filter((f) => f.patientId === filters.patientId);
  if (filters.leadId) list = list.filter((f) => f.leadId === filters.leadId);
  if (filters.status === 'pending') list = list.filter((f) => f.status === 'pending');
  if (filters.status === 'completed') list = list.filter((f) => f.status === 'completed');
  list.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  return list;
}

/**
 * Resumo para cards: atrasados, hoje, próximos 7 dias, orçamentos pendentes.
 * @returns {{ atrasados: number, hoje: number, proximos7: number, orcamentosPendentes: number }}
 */
export function getFollowUpSummary() {
  const pending = listFollowUps({ status: 'pending' });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);
  const in7Str = in7.toISOString().slice(0, 10);

  let atrasados = 0;
  let hoje = 0;
  let proximos7 = 0;
  let orcamentosPendentes = 0;

  pending.forEach((f) => {
    const d = f.dueDate?.slice(0, 10) || '';
    if (d < todayStr) atrasados += 1;
    else if (d === todayStr) hoje += 1;
    else if (d <= in7Str) proximos7 += 1;
    if (f.type === 'orcamento_pendente' && f.status === 'pending') orcamentosPendentes += 1;
  });

  return { atrasados, hoje, proximos7, orcamentosPendentes };
}

/**
 * @param {Object} user
 * @param {Partial<FollowUp>} data
 * @returns {FollowUp}
 */
export function createFollowUp(user, data) {
  return withDb((db) => {
    if (!db.followUps) db.followUps = [];
    const clinicId = getClinicId();
    const now = new Date().toISOString();
    const dueDate = data.dueDate || now.slice(0, 10);
    const followUp = {
      id: createId('fup'),
      clinicId,
      patientId: data.patientId || null,
      leadId: data.leadId || null,
      budgetId: data.budgetId || null,
      originType: data.originType || 'manual',
      type: data.type || 'retorno',
      description: data.description || '',
      dueDate,
      priority: data.priority || 'medium',
      status: 'pending',
      assignedTo: data.assignedTo || user?.id || null,
      createdAt: now,
      completedAt: null,
    };
    db.followUps.push(followUp);
    return followUp;
  });
}

/**
 * Marca follow-up como concluído.
 * @param {Object} user
 * @param {string} followUpId
 */
export function completeFollowUp(user, followUpId) {
  return withDb((db) => {
    const list = db.followUps || [];
    const idx = list.findIndex((f) => f.id === followUpId);
    if (idx === -1) return null;
    const now = new Date().toISOString();
    list[idx] = { ...list[idx], status: 'completed', completedAt: now };
    return list[idx];
  });
}

/**
 * Opcional: ao criar orçamento vinculado a lead, criar follow-up em X dias.
 * @param {Object} user
 * @param {{ leadId: string, budgetId?: string, patientId?: string, daysFromNow?: number }} options
 */
export function maybeCreateFollowUpOnBudget(user, options = {}) {
  const daysFromNow = options.daysFromNow ?? 7;
  const due = new Date();
  due.setDate(due.getDate() + daysFromNow);
  return createFollowUp(user, {
    leadId: options.leadId,
    budgetId: options.budgetId,
    patientId: options.patientId,
    originType: 'orcamento',
    type: 'orcamento_pendente',
    description: 'Retorno pós-orçamento',
    dueDate: due.toISOString().slice(0, 10),
    priority: 'medium',
    assignedTo: user?.id,
  });
}

/**
 * Opcional: lead parado em estágio há N dias → gerar follow-up.
 * @param {Object} user
 * @param {{ leadId: string, stageKey: string, patientId?: string }} options
 */
export function maybeCreateFollowUpOnStuckLead(user, options = {}) {
  return createFollowUp(user, {
    leadId: options.leadId,
    patientId: options.patientId,
    originType: 'crm',
    type: 'comercial',
    description: `Lead parado em ${options.stageKey}`,
    dueDate: new Date().toISOString().slice(0, 10),
    priority: 'high',
    assignedTo: user?.id,
  });
}
