/**
 * Serviço de Tarefas/Follow-up do CRM.
 * Tabela: crmTasks. Referencia leadId OU patientId (obrigatório pelo menos um).
 */

import { withDb, loadDb } from '../db/index.js';
import { createId } from './helpers.js';
import { addLeadEvent } from './crmService.js';
import { CRM_EVENT_TYPE } from './crmService.js';

const DEFAULT_CLINIC_ID = 'clinic-1';

export const TASK_TYPE = {
  FOLLOWUP_BUDGET: 'followup_budget',
  FOLLOWUP_LEAD: 'followup_lead',
  POST_CONSULT: 'post_consult',
  INACTIVE_PATIENT: 'inactive_patient',
  CUSTOM: 'custom',
};

export const TASK_TYPE_LABELS = {
  [TASK_TYPE.FOLLOWUP_BUDGET]: 'Follow-up orçamento',
  [TASK_TYPE.FOLLOWUP_LEAD]: 'Lead sem resposta',
  [TASK_TYPE.POST_CONSULT]: 'Retorno clínico',
  [TASK_TYPE.INACTIVE_PATIENT]: 'Paciente inativo',
  [TASK_TYPE.CUSTOM]: 'Personalizado',
};

export const TASK_CHANNEL = {
  WHATSAPP: 'whatsapp',
  CALL: 'call',
  EMAIL: 'email',
  IN_PERSON: 'in_person',
};

export const TASK_CHANNEL_LABELS = {
  [TASK_CHANNEL.WHATSAPP]: 'WhatsApp',
  [TASK_CHANNEL.CALL]: 'Ligação',
  [TASK_CHANNEL.EMAIL]: 'E-mail',
  [TASK_CHANNEL.IN_PERSON]: 'Presencial',
};

export const TASK_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
};

export const TASK_PRIORITY_LABELS = {
  [TASK_PRIORITY.LOW]: 'Baixa',
  [TASK_PRIORITY.MEDIUM]: 'Média',
  [TASK_PRIORITY.HIGH]: 'Alta',
};

export const TASK_STATUS = {
  PENDING: 'pending',
  DONE: 'done',
  CANCELED: 'canceled',
};

function getClinicId() {
  const db = loadDb();
  return db?.clinicProfile?.id || DEFAULT_CLINIC_ID;
}

/**
 * @param {Object} filters
 * @param {string} [filters.leadId]
 * @param {string} [filters.patientId]
 * @param {string} [filters.status]
 * @returns {Object[]}
 */
export function listTasks(filters = {}) {
  const db = loadDb();
  const clinicId = filters.clinicId || getClinicId();
  let list = [...(db.crmTasks || [])].filter((t) => t.clinicId === clinicId);
  if (filters.leadId) list = list.filter((t) => t.leadId === filters.leadId);
  if (filters.patientId) list = list.filter((t) => t.patientId === filters.patientId);
  if (filters.status) list = list.filter((t) => t.status === filters.status);
  list.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  return list;
}

/**
 * Resumo para cards da tela /comercial/follow-up: atrasados, hoje, próximos 7 dias, orç. pendentes.
 * @returns {{ atrasados: number, hoje: number, proximos7: number, orcamentosPendentes: number }}
 */
export function getTaskSummary() {
  const pending = listTasks({ status: TASK_STATUS.PENDING });
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

  pending.forEach((t) => {
    const d = (t.dueAt || '').toString().slice(0, 10);
    if (!d) return;
    if (d < todayStr) atrasados += 1;
    else if (d === todayStr) hoje += 1;
    else if (d <= in7Str) proximos7 += 1;
    if (t.type === TASK_TYPE.FOLLOWUP_BUDGET) orcamentosPendentes += 1;
  });

  return { atrasados, hoje, proximos7, orcamentosPendentes };
}

/**
 * Agrupa tarefas em: atrasadas, hoje, proximas, concluidas
 */
export function groupTasksByStatus(tasks) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;

  const atrasadas = [];
  const hoje = [];
  const proximas = [];
  const concluidas = [];

  tasks.forEach((t) => {
    if (t.status === TASK_STATUS.DONE || t.status === TASK_STATUS.CANCELED) {
      concluidas.push(t);
      return;
    }
    const due = new Date(t.dueAt).getTime();
    if (due < todayStart) atrasadas.push(t);
    else if (due >= todayStart && due <= todayEnd) hoje.push(t);
    else proximas.push(t);
  });

  atrasadas.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  hoje.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  proximas.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  concluidas.sort((a, b) => new Date(b.doneAt || b.updatedAt) - new Date(a.doneAt || a.updatedAt));

  return { atrasadas, hoje, proximas, concluidas };
}

/**
 * @param {Object} user
 * @param {Object} data
 * @param {string} data.title
 * @param {string} data.dueAt
 * @param {string} [data.leadId]
 * @param {string} [data.patientId]
 * @param {string} [data.budgetId]
 * @param {string} [data.appointmentId]
 * @param {string} [data.type]
 * @param {string} [data.channel]
 * @param {string} [data.priority]
 * @param {string} [data.assignedTo]
 * @param {string} [data.description]
 * @returns {Object}
 */
export function createTask(user, data) {
  if (!data.leadId && !data.patientId) {
    throw new Error('É obrigatório informar lead ou paciente.');
  }
  if (!(data.title || '').trim()) {
    throw new Error('Título é obrigatório.');
  }
  if (!data.dueAt) {
    throw new Error('Data de vencimento é obrigatória.');
  }
  const dueDate = new Date(data.dueAt);
  if (Number.isNaN(dueDate.getTime())) {
    throw new Error('Data de vencimento inválida.');
  }

  return withDb((db) => {
    if (!db.crmTasks) db.crmTasks = [];
    const clinicId = getClinicId();
    const now = new Date().toISOString();
    const id = createId('crmtask');

    const task = {
      id,
      clinicId,
      leadId: data.leadId || null,
      patientId: data.patientId || null,
      budgetId: data.budgetId || null,
      appointmentId: data.appointmentId || null,
      title: (data.title || '').trim(),
      description: (data.description || '').trim() || null,
      type: data.type || TASK_TYPE.CUSTOM,
      channel: data.channel || null,
      dueAt: data.dueAt,
      priority: data.priority || TASK_PRIORITY.MEDIUM,
      status: TASK_STATUS.PENDING,
      assignedTo: data.assignedTo || null,
      createdBy: user?.id || null,
      createdAt: now,
      updatedAt: now,
      doneAt: null,
    };

    db.crmTasks.push(task);

    const leadId = task.leadId;
    if (leadId) {
      addLeadEvent(user, leadId, CRM_EVENT_TYPE.TASK_CREATED, {
        taskId: id,
        taskTitle: task.title,
        dueAt: task.dueAt,
        description: `${task.title} • Venc.: ${formatDueForTimeline(task.dueAt)}`,
      });
    }

    return task;
  });
}

function formatDueForTimeline(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

/**
 * @param {Object} user
 * @param {string} taskId
 * @param {Object} data
 */
export function updateTask(user, taskId, data) {
  return withDb((db) => {
    const idx = (db.crmTasks || []).findIndex((t) => t.id === taskId);
    if (idx < 0) throw new Error('Tarefa não encontrada.');
    const prev = db.crmTasks[idx];
    const now = new Date().toISOString();
    const next = {
      ...prev,
      ...data,
      updatedAt: now,
    };
    if (data.dueAt !== undefined) next.dueAt = data.dueAt;
    if (data.title !== undefined) next.title = (data.title || '').trim();
    if (data.description !== undefined) next.description = (data.description || '').trim() || null;
    db.crmTasks[idx] = next;
    return next;
  });
}

/**
 * Marca tarefa como concluída e registra evento na timeline.
 */
export function completeTask(user, taskId) {
  return withDb((db) => {
    const idx = (db.crmTasks || []).findIndex((t) => t.id === taskId);
    if (idx < 0) throw new Error('Tarefa não encontrada.');
    const task = db.crmTasks[idx];
    const now = new Date().toISOString();
    db.crmTasks[idx] = {
      ...task,
      status: TASK_STATUS.DONE,
      doneAt: now,
      updatedAt: now,
    };

    if (task.leadId) {
      addLeadEvent(user, task.leadId, CRM_EVENT_TYPE.TASK_DONE, {
        taskId,
        taskTitle: task.title,
        description: task.title,
      });
    }

    return db.crmTasks[idx];
  });
}

/**
 * Cancela tarefa.
 */
export function cancelTask(user, taskId) {
  return withDb((db) => {
    const idx = (db.crmTasks || []).findIndex((t) => t.id === taskId);
    if (idx < 0) throw new Error('Tarefa não encontrada.');
    const now = new Date().toISOString();
    db.crmTasks[idx] = {
      ...db.crmTasks[idx],
      status: TASK_STATUS.CANCELED,
      updatedAt: now,
    };
    return db.crmTasks[idx];
  });
}

/**
 * Remove tarefa (soft delete via cancelamento) ou remove do array.
 */
export function deleteTask(user, taskId) {
  return withDb((db) => {
    const idx = (db.crmTasks || []).findIndex((t) => t.id === taskId);
    if (idx < 0) throw new Error('Tarefa não encontrada.');
    db.crmTasks.splice(idx, 1);
    return null;
  });
}

/**
 * Vincula appointmentId à tarefa, marca como done e registra evento na timeline.
 */
export function linkAppointmentAndComplete(user, taskId, appointmentId) {
  return withDb((db) => {
    const idx = (db.crmTasks || []).findIndex((t) => t.id === taskId);
    if (idx < 0) throw new Error('Tarefa não encontrada.');
    const task = db.crmTasks[idx];
    const now = new Date().toISOString();
    db.crmTasks[idx] = {
      ...task,
      appointmentId,
      status: TASK_STATUS.DONE,
      doneAt: now,
      updatedAt: now,
    };

    if (task.leadId) {
      addLeadEvent(user, task.leadId, CRM_EVENT_TYPE.APPOINTMENT_SCHEDULED, {
        appointmentId,
        source: 'follow_up',
        description: 'Agendamento criado a partir do follow-up',
      });
      addLeadEvent(user, task.leadId, CRM_EVENT_TYPE.TASK_DONE, {
        taskId,
        taskTitle: task.title,
        appointmentId,
        description: `Tarefa concluída via agendamento: ${task.title}`,
      });
    }

    return db.crmTasks[idx];
  });
}
