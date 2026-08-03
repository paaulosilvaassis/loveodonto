/**
 * Serviço legado: Gestão de Atendimento (KPIs, fluxo, acompanhamento, alertas).
 * Mantido para compatibilidade com integrações existentes.
 */

import { loadDb } from '../db/index.js';
import { fetchAppointmentsByDate } from './patientFlowService.js';
import { listCrmBudgets, BUDGET_STATUS } from './crmBudgetService.js';
import { listTasks, TASK_STATUS } from './crmTaskService.js';
import { getDelinquency } from './financeService.js';
import { APPOINTMENT_STATUS } from './appointmentService.js';

const TODAY = () => new Date().toISOString().slice(0, 10);
const TOMORROW = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function getAppointmentTypeLabel(apt) {
  const proc = (apt?.procedureName || '').toLowerCase();
  if (apt?.isReturn) return 'Retorno';
  if (proc.includes('cirurgia')) return 'Cirurgia';
  if (proc.includes('avaliação') || proc.includes('avaliacao')) return 'Avaliação';
  return 'Procedimento';
}

export function getAppointmentStatusLabel(apt) {
  const s = apt?.status;
  if (s === APPOINTMENT_STATUS.FALTOU || s === 'faltou') return 'Falta';
  if ([APPOINTMENT_STATUS.CONFIRMADO, APPOINTMENT_STATUS.CHEGOU, APPOINTMENT_STATUS.EM_ESPERA,
    APPOINTMENT_STATUS.EM_ATENDIMENTO, APPOINTMENT_STATUS.FINALIZADO, APPOINTMENT_STATUS.ATENDIDO].includes(s)) {
    return 'Confirmado';
  }
  return 'Agendado';
}

export function getDayKpis(date = TODAY()) {
  const appointments = fetchAppointmentsByDate(date);
  const cancelados = new Set([APPOINTMENT_STATUS.CANCELADO, APPOINTMENT_STATUS.REAGENDAR]);
  const ativos = appointments.filter((a) => !cancelados.has(a.status));

  const confirmados = ativos.filter((a) =>
    [APPOINTMENT_STATUS.CONFIRMADO, APPOINTMENT_STATUS.CHEGOU, APPOINTMENT_STATUS.EM_ESPERA,
      APPOINTMENT_STATUS.EM_ATENDIMENTO, APPOINTMENT_STATUS.FINALIZADO, APPOINTMENT_STATUS.ATENDIDO].includes(a.status)
  ).length;
  const naoConfirmados = ativos.filter((a) =>
    [APPOINTMENT_STATUS.AGENDADO, APPOINTMENT_STATUS.EM_CONFIRMACAO, APPOINTMENT_STATUS.ATRASADO].includes(a.status)
  ).length;
  const faltas = appointments.filter((a) => a.status === APPOINTMENT_STATUS.FALTOU || a.status === 'faltou').length;

  return {
    pacientesHoje: ativos.length,
    confirmados,
    naoConfirmados,
    faltas,
    primeirasConsultas: ativos.filter((a) => !a.isReturn).length,
    cirurgias: ativos.filter((a) => (a.procedureName || '').toLowerCase().includes('cirurgia')).length,
    retornos: ativos.filter((a) => a.isReturn).length,
  };
}

export function getDayFlow(date = TODAY()) {
  return fetchAppointmentsByDate(date)
    .filter((a) => !['cancelado', 'reagendar'].includes(a.status))
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
}

export const PRIORITY = { ATRASADO: 'atrasado', ATENCAO: 'atencao', NORMAL: 'normal' };

function daysBetween(dateStr, toDateStr) {
  if (!dateStr || !toDateStr) return null;
  return Math.floor((new Date(toDateStr) - new Date(dateStr)) / (24 * 60 * 60 * 1000));
}

export function getPacientesAcompanhamento() {
  const db = loadDb();
  const today = TODAY();
  const thirtyDaysAgoStr = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const appointments = db.appointments || [];
  const patients = db.patients || [];
  const getPatientName = (id) => {
    const p = patients.find((x) => x.id === id);
    return p?.full_name || p?.nickname || 'Paciente';
  };

  const posOpByPatient = new Map();
  appointments
    .filter((a) => a.date >= thirtyDaysAgoStr && a.date <= today)
    .filter((a) => ['finalizado', 'atendido'].includes(a.status))
    .filter((a) => (a.procedureName || '').toLowerCase().includes('cirurgia'))
    .forEach((a) => {
      if (!a.patientId) return;
      const existing = posOpByPatient.get(a.patientId);
      if (!existing || a.date > existing.date) posOpByPatient.set(a.patientId, { date: a.date, procedureName: a.procedureName || 'Cirurgia' });
    });

  const posOperatorioAtivo = Array.from(posOpByPatient.entries()).map(([patientId, info]) => {
    const dias = daysBetween(info.date, today);
    let priority = PRIORITY.NORMAL;
    if (dias != null && dias > 14) priority = PRIORITY.ATRASADO;
    else if (dias != null && dias > 7) priority = PRIORITY.ATENCAO;
    return { patientId, name: getPatientName(patientId), subinfo: `${info.procedureName} • ${dias}d`, priority };
  });

  const nextByPatient = new Map();
  appointments
    .filter((a) => a.date >= today && !['cancelado', 'reagendar', 'faltou'].includes(a.status))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .forEach((a) => {
      if (a.patientId && !nextByPatient.has(a.patientId)) nextByPatient.set(a.patientId, { date: a.date, procedureName: a.procedureName || 'Consulta' });
    });

  const emTratamento = Array.from(nextByPatient.entries()).map(([patientId, info]) => ({
    patientId, name: getPatientName(patientId), subinfo: `Próximo: ${info.procedureName}`, priority: PRIORITY.NORMAL,
  }));

  const aguardandoOrcamento = listCrmBudgets({ status: BUDGET_STATUS.EM_ANALISE }).map((b) => {
    const lead = (db.crmLeads || []).find((l) => l.id === b.leadId);
    return { leadId: b.leadId, patientId: lead?.patientId || null, name: lead?.name || 'Lead', subinfo: b.title || 'Orçamento', priority: PRIORITY.NORMAL };
  });

  return { posOperatorioAtivo, emTratamento, aguardandoRetorno: [], aguardandoOrcamento };
}

export function getAlertasOperacionais() {
  const tomorrow = TOMORROW();
  const naoConfirmadosAmanha = fetchAppointmentsByDate(tomorrow).filter((a) =>
    !['cancelado', 'reagendar', 'faltou'].includes(a.status) &&
    [APPOINTMENT_STATUS.AGENDADO, APPOINTMENT_STATUS.EM_CONFIRMACAO, APPOINTMENT_STATUS.ATRASADO].includes(a.status)
  );
  const orcamentosAguardando = listCrmBudgets({ status: BUDGET_STATUS.EM_ANALISE });
  const db = loadDb();
  const today = TODAY();
  const followUpsAtrasados = listTasks({ status: TASK_STATUS.PENDING }).filter((t) => t.dueAt && t.dueAt.slice(0, 10) < today);

  return {
    pacientesNaoConfirmadosAmanha: naoConfirmadosAmanha.map((a) => ({
      appointmentId: a.id, date: a.date, startTime: a.startTime,
      patientName: a.patientName || 'Paciente', professionalName: a.professionalName,
    })),
    orcamentosAguardandoResposta: orcamentosAguardando.map((b) => {
      const lead = (db.crmLeads || []).find((l) => l.id === b.leadId);
      return { budgetId: b.id, leadId: b.leadId, leadName: lead?.name || 'Lead', title: b.title, totalValue: b.totalValue };
    }),
    followUpsAtrasados: followUpsAtrasados.map((t) => ({ taskId: t.id, title: t.title, dueAt: t.dueAt, leadId: t.leadId })),
    parcelasVencidas: getDelinquency().map((t) => ({ id: t.id, patientId: t.patientId, dueDate: t.dueDate, amount: t.amount })),
  };
}
