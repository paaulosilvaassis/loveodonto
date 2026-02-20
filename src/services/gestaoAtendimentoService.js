/**
 * Serviço: Gestão de Atendimento
 * Central de comando do dia: KPIs do dia, fluxo, acompanhamento e alertas.
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

/** Tipo de consulta para exibição (Avaliação, Retorno, Cirurgia, Procedimento) */
export function getAppointmentTypeLabel(apt) {
  const proc = (apt?.procedureName || '').toLowerCase();
  if (apt?.isReturn) return 'Retorno';
  if (proc.includes('cirurgia')) return 'Cirurgia';
  if (proc.includes('avaliação') || proc.includes('avaliacao')) return 'Avaliação';
  return 'Procedimento';
}

/** Status simplificado para a tabela (Agendado, Confirmado, Falta) */
export function getAppointmentStatusLabel(apt) {
  const s = apt?.status;
  if (s === APPOINTMENT_STATUS.FALTOU || s === 'faltou') return 'Falta';
  if ([APPOINTMENT_STATUS.CONFIRMADO, APPOINTMENT_STATUS.CHEGOU, APPOINTMENT_STATUS.EM_ESPERA,
       APPOINTMENT_STATUS.EM_ATENDIMENTO, APPOINTMENT_STATUS.FINALIZADO, APPOINTMENT_STATUS.ATENDIDO].includes(s)) {
    return 'Confirmado';
  }
  return 'Agendado';
}

/**
 * KPIs do dia calculados a partir da agenda.
 * @param {string} [date] - ISO date (YYYY-MM-DD). Default: hoje.
 */
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

  const primeirasConsultas = ativos.filter((a) => !a.isReturn).length;
  const cirurgias = ativos.filter((a) => (a.procedureName || '').toLowerCase().includes('cirurgia')).length;
  const retornos = ativos.filter((a) => a.isReturn).length;

  return {
    pacientesHoje: ativos.length,
    confirmados,
    naoConfirmados,
    faltas,
    primeirasConsultas,
    cirurgias,
    retornos,
  };
}

/**
 * Fluxo do dia: lista de agendamentos para a tabela (já enriquecidos por fetchAppointmentsByDate).
 * @param {string} [date] - ISO date. Default: hoje.
 */
export function getDayFlow(date = TODAY()) {
  const list = fetchAppointmentsByDate(date);
  return list
    .filter((a) => !['cancelado', 'reagendar'].includes(a.status))
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
}

/** Prioridade para indicador visual: atrasado | atencao | normal */
export const PRIORITY = { ATRASADO: 'atrasado', ATENCAO: 'atencao', NORMAL: 'normal' };

function daysBetween(dateStr, toDateStr) {
  if (!dateStr || !toDateStr) return null;
  const a = new Date(dateStr);
  const b = new Date(toDateStr);
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

/**
 * Pacientes em acompanhamento: quatro listas com subinfo e prioridade para UI escalável.
 */
export function getPacientesAcompanhamento() {
  const db = loadDb();
  const today = TODAY();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

  const appointments = db.appointments || [];
  const patients = db.patients || [];
  const getPatientName = (id) => {
    const p = patients.find((x) => x.id === id);
    return p?.full_name || p?.nickname || p?.social_name || 'Paciente';
  };

  const formatDateShort = (str) => {
    if (!str) return '';
    try {
      return new Date(str + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch {
      return str;
    }
  };

  // Pós-operatório ativo: última cirurgia por paciente + dias desde + prioridade
  const posOpByPatient = new Map();
  appointments
    .filter((a) => a.date >= thirtyDaysAgoStr && a.date <= today)
    .filter((a) => ['finalizado', 'atendido'].includes(a.status))
    .filter((a) => (a.procedureName || '').toLowerCase().includes('cirurgia'))
    .forEach((a) => {
      if (!a.patientId) return;
      const existing = posOpByPatient.get(a.patientId);
      if (!existing || a.date > existing.date) {
        posOpByPatient.set(a.patientId, { date: a.date, procedureName: a.procedureName || 'Cirurgia' });
      }
    });
  const posOperatorioAtivo = Array.from(posOpByPatient.entries()).map(([patientId, info]) => {
    const dias = daysBetween(info.date, today);
    let priority = PRIORITY.NORMAL;
    if (dias != null) {
      if (dias > 14) priority = PRIORITY.ATRASADO;
      else if (dias > 7) priority = PRIORITY.ATENCAO;
    }
    const proc = (info.procedureName || 'Cirurgia').trim();
    const subinfo = dias != null ? `${proc} • ${dias} dia${dias !== 1 ? 's' : ''}` : proc;
    return { patientId, name: getPatientName(patientId), subinfo, priority };
  });

  // Em tratamento: próximo agendamento futuro por paciente
  const nextByPatient = new Map();
  appointments
    .filter((a) => a.date >= today && !['cancelado', 'reagendar', 'faltou'].includes(a.status))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .forEach((a) => {
      if (!a.patientId) return;
      if (!nextByPatient.has(a.patientId)) {
        nextByPatient.set(a.patientId, { date: a.date, procedureName: a.procedureName || 'Consulta' });
      }
    });
  const emTratamento = Array.from(nextByPatient.entries()).map(([patientId, info]) => {
    const subinfo = `Próximo: ${formatDateShort(info.date)} • ${info.procedureName}`;
    return { patientId, name: getPatientName(patientId), subinfo, priority: PRIORITY.NORMAL };
  });

  // Aguardando retorno: próximo retorno (isReturn ou procedimento retorno)
  const retornoByPatient = new Map();
  appointments
    .filter((a) => a.date >= today && !['cancelado', 'reagendar', 'faltou'].includes(a.status))
    .filter((a) => a.isReturn || (a.procedureName || '').toLowerCase().includes('retorno'))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .forEach((a) => {
      if (!a.patientId) return;
      if (!retornoByPatient.has(a.patientId)) {
        retornoByPatient.set(a.patientId, { date: a.date });
      }
    });
  const aguardandoRetorno = Array.from(retornoByPatient.entries()).map(([patientId, info]) => {
    const dias = daysBetween(today, info.date);
    let priority = PRIORITY.NORMAL;
    if (dias != null) {
      if (dias < 0) priority = PRIORITY.ATRASADO;
      else if (dias <= 3) priority = PRIORITY.ATENCAO;
    }
    const subinfo = `Retorno em ${formatDateShort(info.date)}`;
    return { patientId, name: getPatientName(patientId), subinfo, priority };
  });

  // Aguardando orçamento: leads com orçamento em análise (subinfo = título orçamento)
  const orcamentosEmAnalise = listCrmBudgets({ status: BUDGET_STATUS.EM_ANALISE });
  const leads = db.crmLeads || [];
  const aguardandoOrcamento = orcamentosEmAnalise.map((b) => {
    const lead = leads.find((l) => l.id === b.leadId);
    return {
      leadId: b.leadId,
      patientId: lead?.patientId || null,
      name: lead?.name || 'Lead',
      subinfo: b.title ? `Orçamento: ${b.title}` : 'Orçamento pendente',
      priority: PRIORITY.NORMAL,
    };
  });

  return {
    posOperatorioAtivo,
    emTratamento,
    aguardandoRetorno,
    aguardandoOrcamento,
  };
}

/**
 * Alertas operacionais.
 */
export function getAlertasOperacionais() {
  const tomorrow = TOMORROW();
  const appointmentsTomorrow = fetchAppointmentsByDate(tomorrow);
  const naoConfirmadosAmanha = appointmentsTomorrow.filter((a) =>
    !['cancelado', 'reagendar', 'faltou'].includes(a.status) &&
    [APPOINTMENT_STATUS.AGENDADO, APPOINTMENT_STATUS.EM_CONFIRMACAO, APPOINTMENT_STATUS.ATRASADO].includes(a.status)
  );

  const orcamentosAguardando = listCrmBudgets({ status: BUDGET_STATUS.EM_ANALISE });

  const pendingTasks = listTasks({ status: TASK_STATUS.PENDING });
  const today = new Date().toISOString().slice(0, 10);
  const followUpsAtrasados = pendingTasks.filter((t) => t.dueAt && t.dueAt.slice(0, 10) < today);

  const parcelasVencidas = getDelinquency();

  return {
    pacientesNaoConfirmadosAmanha: naoConfirmadosAmanha.map((a) => ({
      appointmentId: a.id,
      date: a.date,
      startTime: a.startTime,
      patientName: a.patientName || a.patient?.full_name || a.leadDisplayName || 'Paciente',
      professionalName: a.professionalName,
    })),
    orcamentosAguardandoResposta: (() => {
      const dbAlert = loadDb();
      const leadsList = dbAlert.crmLeads || [];
      return orcamentosAguardando.map((b) => {
        const lead = leadsList.find((l) => l.id === b.leadId);
        return {
          budgetId: b.id,
          leadId: b.leadId,
          leadName: lead?.name || 'Lead',
          title: b.title,
          totalValue: b.totalValue,
        };
      });
    })(),
    followUpsAtrasados: followUpsAtrasados.map((t) => ({
      taskId: t.id,
      title: t.title,
      dueAt: t.dueAt,
      type: t.type,
      leadId: t.leadId,
      patientId: t.patientId,
    })),
    parcelasVencidas: parcelasVencidas.map((t) => ({
      id: t.id,
      patientId: t.patientId,
      dueDate: t.dueDate,
      amount: t.amount,
      description: t.description,
    })),
  };
}
