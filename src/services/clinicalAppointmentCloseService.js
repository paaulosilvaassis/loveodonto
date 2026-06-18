import { finishAppointment } from './appointmentService.js';
import { getBudget, logClinicalEvent, updateBudgetStatus, BUDGET_STATUS } from './clinicalService.js';
import { listPatientBudgetHistory } from './clinicalBudgetLockService.js';
import { formatFriendlyBudgetNumber } from '../utils/friendlyNumbers.js';
import { createTask, TASK_TYPE } from './crmTaskService.js';
import { createFollowUp } from './followUpService.js';
import { notifyClinicalBudgetUpdated } from './clinicalBudgetApprovedService.js';

/** Dias padrão para follow-up após encerrar com orçamento pendente. */
export const DEFAULT_APPOINTMENT_CLOSE_FOLLOWUP_DAYS = 3;

export const APPOINTMENT_CLOSE_REASON = {
  BUDGET_APPROVED: 'budget_approved',
  ANALYZE_LATER: 'analyze_later',
  TREATMENT_REFUSED: 'treatment_refused',
  RETURN_OTHER_DATE: 'return_other_date',
  OTHER: 'other',
};

export const APPOINTMENT_CLOSE_REASON_LABELS = {
  [APPOINTMENT_CLOSE_REASON.BUDGET_APPROVED]: 'Paciente aprovou orçamento',
  [APPOINTMENT_CLOSE_REASON.ANALYZE_LATER]: 'Paciente vai analisar posteriormente',
  [APPOINTMENT_CLOSE_REASON.TREATMENT_REFUSED]: 'Paciente recusou o tratamento',
  [APPOINTMENT_CLOSE_REASON.RETURN_OTHER_DATE]: 'Retornar em outra data',
  [APPOINTMENT_CLOSE_REASON.OTHER]: 'Outro motivo',
};

const PENDING_DECISION_STATUSES = new Set([
  BUDGET_STATUS.NEGOCIACAO,
  BUDGET_STATUS.ENVIADO,
  BUDGET_STATUS.RASCUNHO,
]);

const CLOSED_BUDGET_STATUSES = new Set([
  BUDGET_STATUS.APROVADO,
  BUDGET_STATUS.CONTRATO_GERADO,
  BUDGET_STATUS.HISTORICO,
  BUDGET_STATUS.REPROVADO,
  BUDGET_STATUS.CANCELADO,
]);

export function findPendingDecisionBudget(patientId) {
  if (!patientId) return null;
  const history = listPatientBudgetHistory(patientId);
  return history.find(
    (row) => !row.isHistorical
      && PENDING_DECISION_STATUSES.has(row.status)
      && !CLOSED_BUDGET_STATUSES.has(row.status),
  ) || null;
}

/** Pendente comercial (negociação/enviado ou rascunho com valor) prevalece sobre aprovado na Central. */
export function shouldPreferPendingBudgetOverApproved(pending) {
  if (!pending?.id) return false;
  if (pending.status === BUDGET_STATUS.NEGOCIACAO || pending.status === BUDGET_STATUS.ENVIADO) {
    return true;
  }
  if (pending.status === BUDGET_STATUS.RASCUNHO) {
    return (pending.totalValue || 0) > 0;
  }
  return false;
}

function resolveFollowUpDays() {
  return DEFAULT_APPOINTMENT_CLOSE_FOLLOWUP_DAYS;
}

function shouldCreateFollowUp(reason, budget) {
  if (!budget?.id) return false;
  if (reason === APPOINTMENT_CLOSE_REASON.BUDGET_APPROVED) return false;
  if (reason === APPOINTMENT_CLOSE_REASON.TREATMENT_REFUSED) return false;
  if (CLOSED_BUDGET_STATUSES.has(budget.status)) return false;
  return PENDING_DECISION_STATUSES.has(budget.status);
}

function createPendingBudgetFollowUp(user, { patientId, budgetId, appointmentId, reason, notes }) {
  const days = resolveFollowUpDays();
  const due = new Date();
  due.setDate(due.getDate() + days);
  const dueAt = due.toISOString();
  const reasonLabel = APPOINTMENT_CLOSE_REASON_LABELS[reason] || 'Follow-up pós-consulta';

  const task = createTask(user, {
    patientId,
    budgetId,
    appointmentId,
    title: `Contato em ${days} dias`,
    description: [reasonLabel, notes].filter(Boolean).join(' — '),
    type: TASK_TYPE.FOLLOWUP_BUDGET,
    dueAt,
    assignedTo: user?.id || null,
  });

  const followUp = createFollowUp(user, {
    patientId,
    budgetId,
    appointmentId,
    originType: 'orcamento',
    type: 'orcamento_pendente',
    description: `Orçamento pendente de decisão — ${reasonLabel}${notes ? `. ${notes}` : ''}`,
    dueDate: dueAt.slice(0, 10),
    priority: 'medium',
    assignedTo: user?.id || null,
  });

  return { task, followUp, dueInDays: days };
}

/**
 * Encerra o atendimento clínico sem exigir aprovação do orçamento.
 * Não gera contrato, financeiro ou parcelas.
 */
export function closeClinicalAppointment(user, payload) {
  const {
    appointmentId,
    patientId,
    budgetId = null,
    reason,
    notes = '',
  } = payload || {};

  if (!appointmentId) throw new Error('Atendimento não informado.');
  if (!reason) throw new Error('Selecione o motivo do encerramento.');
  if (!Object.values(APPOINTMENT_CLOSE_REASON).includes(reason)) {
    throw new Error('Motivo de encerramento inválido.');
  }

  const budget = budgetId
    ? listPatientBudgetHistory(patientId).find((b) => b.id === budgetId)
    : getBudget(appointmentId);

  if (reason === APPOINTMENT_CLOSE_REASON.TREATMENT_REFUSED && budget?.id) {
    updateBudgetStatus(user, appointmentId, BUDGET_STATUS.REPROVADO);
  }

  const finished = finishAppointment(user, appointmentId);
  const budgetAfter = getBudget(appointmentId);
  const history = listPatientBudgetHistory(patientId);
  const budgetIndex = history.findIndex((b) => b.id === budget?.id);
  const budgetNumber = budget
    ? formatFriendlyBudgetNumber(budget.budgetNumber, budgetIndex >= 0 ? budgetIndex + 1 : 1)
    : null;

  logClinicalEvent(
    appointmentId,
    'appointment_finished',
    {
      reason,
      reasonLabel: APPOINTMENT_CLOSE_REASON_LABELS[reason],
      notes: String(notes || '').trim(),
      budgetId: budget?.id || budgetId || null,
      budgetNumber,
      budgetStatus: budgetAfter?.status || budget?.status || null,
      userName: user?.name || user?.email || null,
    },
    user?.id || null,
  );

  let followUp = null;
  if (patientId && shouldCreateFollowUp(reason, budgetAfter || budget)) {
    followUp = createPendingBudgetFollowUp(user, {
      patientId,
      budgetId: budget?.id || budgetId,
      appointmentId,
      reason,
      notes,
    });
  }

  if (patientId) {
    notifyClinicalBudgetUpdated(patientId);
  }

  return {
    appointment: finished,
    followUp,
    budgetStatus: budgetAfter?.status || budget?.status || null,
  };
}
