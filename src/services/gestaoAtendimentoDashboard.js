/**
 * Central Operacional — agregador completo da Gestão de Atendimento.
 */

import { loadDb } from '../db/index.js';
import { fetchAppointmentsByDate } from './patientFlowService.js';
import { listCrmBudgets, BUDGET_STATUS } from './crmBudgetService.js';
import { APPOINTMENT_STATUS } from './appointmentService.js';
import { getCashSummaryForDate } from './cashRegisterService.js';
import { listCollaborators } from './collaboratorService.js';
import { listRooms } from './teamService.js';
import { getWaitTimeSeconds } from '../utils/journeyUtils.js';

export {
  getAppointmentTypeLabel,
  getAppointmentStatusLabel,
  getDayKpis,
  getDayFlow,
  getPacientesAcompanhamento,
  getAlertasOperacionais,
  PRIORITY,
} from './gestaoAtendimentoLegacy.js';

const CANCELLED = new Set([APPOINTMENT_STATUS.CANCELADO, APPOINTMENT_STATUS.REAGENDAR, 'cancelado', 'reagendar']);

const CONFIRMED_STATUSES = new Set([
  APPOINTMENT_STATUS.CONFIRMADO, APPOINTMENT_STATUS.CHEGOU, APPOINTMENT_STATUS.EM_ESPERA,
  APPOINTMENT_STATUS.CHAMADO, APPOINTMENT_STATUS.EM_ATENDIMENTO,
  APPOINTMENT_STATUS.FINALIZADO, APPOINTMENT_STATUS.ATENDIDO,
]);

const PENDING_CONFIRM_STATUSES = new Set([
  APPOINTMENT_STATUS.AGENDADO, APPOINTMENT_STATUS.EM_CONFIRMACAO, APPOINTMENT_STATUS.ATRASADO,
]);

const WAITING_STATUSES = new Set([APPOINTMENT_STATUS.CHEGOU, APPOINTMENT_STATUS.EM_ESPERA]);
const IN_PROGRESS_STATUSES = new Set([APPOINTMENT_STATUS.EM_ATENDIMENTO, APPOINTMENT_STATUS.CHAMADO]);
const DONE_STATUSES = new Set([APPOINTMENT_STATUS.FINALIZADO, APPOINTMENT_STATUS.ATENDIDO]);

export const DISPLAY_STATUS = {
  agendado: { label: 'Agendado', tone: 'neutral', emoji: '⚪' },
  em_confirmacao: { label: 'Aguardando confirmação', tone: 'warning', emoji: '🟡' },
  atrasado: { label: 'Aguardando confirmação', tone: 'warning', emoji: '🟡' },
  confirmado: { label: 'Confirmado', tone: 'success', emoji: '🟢' },
  chegou: { label: 'Chegou', tone: 'info', emoji: '🔵' },
  em_espera: { label: 'Chegou', tone: 'info', emoji: '🔵' },
  em_atendimento: { label: 'Em atendimento', tone: 'primary', emoji: '🔵' },
  chamado: { label: 'Em atendimento', tone: 'primary', emoji: '🔵' },
  finalizado: { label: 'Finalizado', tone: 'done', emoji: '✅' },
  atendido: { label: 'Finalizado', tone: 'done', emoji: '✅' },
  faltou: { label: 'Faltou', tone: 'danger', emoji: '❌' },
  cancelado: { label: 'Cancelado', tone: 'muted', emoji: '⛔' },
};

export function getDisplayStatus(apt) {
  const key = apt?.status || 'agendado';
  return DISPLAY_STATUS[key] || DISPLAY_STATUS.agendado;
}

function isoDateOffset(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function calcTrend(current, previous) {
  if (previous === 0 && current === 0) return { delta: 0, direction: 'flat' };
  if (previous === 0) return { delta: 100, direction: 'up' };
  const delta = Math.round(((current - previous) / previous) * 100);
  return { delta, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' };
}

function kpiWithTrend(current, previous) {
  const trend = calcTrend(current, previous);
  return { value: current, previous, ...trend };
}

function activeAppointments(list) {
  return list.filter((a) => !CANCELLED.has(a.status));
}

function parseDurationMinutes(apt) {
  if (apt.durationMinutes) return Number(apt.durationMinutes);
  if (apt.startTime && apt.endTime) {
    const [sh, sm] = apt.startTime.split(':').map(Number);
    const [eh, em] = apt.endTime.split(':').map(Number);
    return Math.max(15, (eh * 60 + em) - (sh * 60 + sm));
  }
  return 30;
}

function getPhoneDigits(apt) {
  const phone = apt.phone || apt.patient?.phones?.[0];
  if (typeof phone === 'string') return phone.replace(/\D/g, '');
  if (phone?.ddd && phone?.number) return `${phone.ddd}${phone.number}`.replace(/\D/g, '');
  const db = loadDb();
  const phones = (db.patientPhones || []).filter((p) => p.patient_id === apt.patientId);
  const primary = phones.find((p) => p.is_primary) || phones[0];
  if (primary) return `${primary.ddd || ''}${primary.number || ''}`.replace(/\D/g, '');
  return '';
}

function estimateAppointmentValue(apt, db) {
  const clinical = (db.clinicalAppointments || []).find((c) => c.appointmentId === apt.id);
  if (clinical?.budget?.total) return Number(clinical.budget.total) || 0;
  if (clinical?.budget?.value) return Number(clinical.budget.value) || 0;
  return Number(apt.estimatedValue) || 0;
}

function applyFilters(appointments, filters = {}) {
  return appointments.filter((apt) => {
    if (filters.professionalId && apt.professionalId !== filters.professionalId) return false;
    if (filters.roomId && apt.roomId !== filters.roomId && apt.consultorioId !== filters.roomId) return false;
    if (filters.status && apt.status !== filters.status) return false;
    if (filters.specialty) {
      const specs = apt.professional?.specialties || [];
      const match = specs.includes(filters.specialty) || apt.specialty === filters.specialty;
      if (!match) return false;
    }
    return true;
  });
}

function sortByTime(list) {
  return [...list].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
}

function nowTimeOnDate(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  if (dateStr !== today) return dateStr < today ? '23:59' : '00:00';
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

function minutesSince(isoStart) {
  if (!isoStart) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(isoStart).getTime()) / 60000));
}

function buildExecutivePanel(todayList, yesterdayList, db) {
  const todayActive = activeAppointments(todayList);
  const yActive = activeAppointments(yesterdayList);

  const count = (list, fn) => list.filter(fn).length;
  const orcamentosPrevistos = listCrmBudgets({ status: BUDGET_STATUS.EM_ANALISE }).length
    + todayActive.filter((a) => (a.procedureName || '').toLowerCase().includes('orçamento')).length;

  const mk = (key, fn) => kpiWithTrend(count(todayActive, fn), count(yActive, fn));

  return {
    pacientesAgendados: mk('pacientes', () => true),
    confirmados: mk('confirmados', (a) => CONFIRMED_STATUSES.has(a.status)),
    aguardandoConfirmacao: mk('pendentes', (a) => PENDING_CONFIRM_STATUSES.has(a.status)),
    faltas: mk('faltas', (a) => a.status === APPOINTMENT_STATUS.FALTOU),
    primeirasConsultas: mk('primeiras', (a) => !a.isReturn),
    retornos: mk('retornos', (a) => a.isReturn),
    cirurgias: mk('cirurgias', (a) => (a.procedureName || '').toLowerCase().includes('cirurgia')),
    orcamentosPrevistos: kpiWithTrend(
      orcamentosPrevistos,
      listCrmBudgets({ status: BUDGET_STATUS.EM_ANALISE }).length
    ),
  };
}

function buildTimeline(list) {
  return sortByTime(activeAppointments(list)).map((apt) => ({
    id: apt.id,
    startTime: apt.startTime,
    patientName: apt.patientName || apt.leadDisplayName || 'Paciente',
    professionalName: apt.professionalName || '—',
    procedureName: apt.procedureName || (apt.isReturn ? 'Retorno' : 'Consulta'),
    status: apt.status,
    displayStatus: getDisplayStatus(apt),
    patientId: apt.patientId,
    professionalId: apt.professionalId,
    roomName: apt.roomName || apt.consultorioName || '—',
  }));
}

function buildWaiting(list, now = new Date()) {
  return sortByTime(list.filter((a) => WAITING_STATUSES.has(a.status))).map((apt) => {
    const waitSec = getWaitTimeSeconds(apt.checkInAt || apt.checkedInAt, now);
    const waitMin = Math.floor(waitSec / 60);
    return {
      appointmentId: apt.id,
      patientName: apt.patientName || 'Paciente',
      arrivalTime: apt.checkInAt ? new Date(apt.checkInAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : apt.startTime,
      waitMinutes: waitMin,
      waitLabel: waitMin >= 60 ? `${Math.floor(waitMin / 60)}h ${waitMin % 60}min` : `${waitMin} min`,
      isLongWait: waitMin >= 20,
      professionalName: apt.professionalName || '—',
      patientId: apt.patientId,
      phone: getPhoneDigits(apt),
    };
  });
}

function buildInProgress(list) {
  return list.filter((a) => IN_PROGRESS_STATUSES.has(a.status)).map((apt) => ({
    appointmentId: apt.id,
    patientName: apt.patientName || 'Paciente',
    professionalName: apt.professionalName || '—',
    roomName: apt.consultorioName || apt.roomName || 'Sala —',
    procedureName: apt.procedureName || 'Atendimento',
    minutesInService: minutesSince(apt.startedAt || apt.calledAt),
    patientId: apt.patientId,
  }));
}

function buildUpcoming(list, date, limit = 10) {
  const nowTime = nowTimeOnDate(date);
  return sortByTime(activeAppointments(list))
    .filter((a) => !DONE_STATUSES.has(a.status) && !IN_PROGRESS_STATUSES.has(a.status) && (a.startTime || '') >= nowTime)
    .slice(0, limit)
    .map((apt) => ({
      appointmentId: apt.id,
      startTime: apt.startTime,
      patientName: apt.patientName || 'Paciente',
      procedureName: apt.procedureName || 'Consulta',
    }));
}

function buildPendingConfirmations(list) {
  return sortByTime(list.filter((a) => PENDING_CONFIRM_STATUSES.has(a.status))).map((apt) => ({
    appointmentId: apt.id,
    startTime: apt.startTime,
    patientName: apt.patientName || 'Paciente',
    professionalName: apt.professionalName || '—',
    phone: getPhoneDigits(apt),
    patientId: apt.patientId,
  }));
}

function buildNoShows(list, db) {
  return list.filter((a) => a.status === APPOINTMENT_STATUS.FALTOU).map((apt) => ({
    appointmentId: apt.id,
    patientName: apt.patientName || 'Paciente',
    procedureName: apt.procedureName || 'Consulta',
    estimatedValue: estimateAppointmentValue(apt, db),
    professionalName: apt.professionalName || '—',
    reason: apt.noShowReason || apt.notes || 'Não informado',
    patientId: apt.patientId,
  }));
}

function buildProduction(list, date, db) {
  const active = activeAppointments(list);
  const done = active.filter((a) => DONE_STATUSES.has(a.status));
  const isEval = (a) => (a.procedureName || '').toLowerCase().match(/avalia/);
  const budgetsToday = (db.crmBudgets || []).filter((b) => (b.createdAt || '').slice(0, 10) === date);
  const closedToday = budgetsToday.filter((b) => b.status === BUDGET_STATUS.APROVADO);

  const receitaPrevista = active.reduce((s, a) => s + estimateAppointmentValue(a, db), 0);
  const cash = getCashSummaryForDate(date);

  return {
    consultasRealizadas: done.length,
    avaliacoesRealizadas: done.filter(isEval).length,
    orcamentosApresentados: budgetsToday.length,
    tratamentosFechados: closedToday.length,
    receitaPrevista,
    receitaConfirmada: cash.entries,
  };
}

function buildOccupancy(list, date, db) {
  const workHours = db.collaboratorWorkHours || [];
  const byProfessional = {};

  activeAppointments(list).forEach((apt) => {
    if (!apt.professionalId) return;
    if (!byProfessional[apt.professionalId]) {
      byProfessional[apt.professionalId] = { booked: 0, name: apt.professionalName || 'Profissional' };
    }
    byProfessional[apt.professionalId].booked += parseDurationMinutes(apt);
  });

  return Object.entries(byProfessional).map(([id, data]) => {
    const hours = workHours.filter((w) => w.collaboratorId === id && w.ativo !== false);
    let available = 480;
    if (hours.length) {
      available = hours.reduce((sum, w) => {
        const [sh, sm] = (w.inicio || '08:00').split(':').map(Number);
        const [eh, em] = (w.fim || '18:00').split(':').map(Number);
        return sum + Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
      }, 0) || 480;
    }
    const percent = Math.min(100, Math.round((data.booked / available) * 100));
    return { professionalId: id, name: data.name, percent, bookedMinutes: data.booked, availableMinutes: available };
  }).sort((a, b) => b.percent - a.percent);
}

function buildJourneySummary(list) {
  const active = activeAppointments(list);
  const recepcao = active.filter((a) => PENDING_CONFIRM_STATUSES.has(a.status) || a.status === APPOINTMENT_STATUS.CONFIRMADO).length;
  const triagem = active.filter((a) => WAITING_STATUSES.has(a.status)).length;
  const consultorio = active.filter((a) => IN_PROGRESS_STATUSES.has(a.status)).length;
  const avaliacaoComercial = active.filter((a) => (a.procedureName || '').toLowerCase().match(/avalia/) && !DONE_STATUSES.has(a.status)).length;
  const finalizado = active.filter((a) => DONE_STATUSES.has(a.status)).length;

  return [
    { key: 'recepcao', label: 'Recepção', count: recepcao, tone: 'neutral' },
    { key: 'triagem', label: 'Triagem', count: triagem, tone: 'warning' },
    { key: 'consultorio', label: 'Consultório', count: consultorio, tone: 'primary' },
    { key: 'avaliacao', label: 'Avaliação Comercial', count: avaliacaoComercial, tone: 'accent' },
    { key: 'finalizado', label: 'Finalizado', count: finalizado, tone: 'success' },
  ];
}

function buildFinancialSummary(list, date, db) {
  const active = activeAppointments(list);
  const receitaPrevista = active.reduce((s, a) => s + estimateAppointmentValue(a, db), 0);
  const cash = getCashSummaryForDate(date);
  const budgetsToday = (db.crmBudgets || []).filter((b) => (b.createdAt || '').slice(0, 10) === date);
  const negociacao = listCrmBudgets({ status: BUDGET_STATUS.EM_ANALISE });
  const fechamentos = budgetsToday.filter((b) => b.status === BUDGET_STATUS.APROVADO);

  return {
    receitaPrevista,
    receitaRecebida: cash.entries,
    orcamentosEmitidos: budgetsToday.reduce((s, b) => s + Number(b.totalValue || 0), 0),
    valorNegociacao: negociacao.reduce((s, b) => s + Number(b.totalValue || 0), 0),
    fechamentosDia: fechamentos.reduce((s, b) => s + Number(b.totalValue || 0), 0),
  };
}

function buildClinicAlerts(ctx) {
  const alerts = [];
  ctx.waiting.filter((w) => w.isLongWait).forEach((w) => {
    alerts.push({ id: `wait-${w.appointmentId}`, type: 'danger', message: `${w.patientName} aguardando há ${w.waitLabel}` });
  });
  if (ctx.pendingConfirmations.length) {
    alerts.push({ id: 'confirm', type: 'warning', message: `${ctx.pendingConfirmations.length} confirmações pendentes` });
  }
  if (ctx.noShows.length) {
    alerts.push({ id: 'noshow', type: 'danger', message: `${ctx.noShows.length} paciente(s) faltaram hoje` });
  }
  const orcamentos = listCrmBudgets({ status: BUDGET_STATUS.EM_ANALISE });
  if (orcamentos.length) {
    alerts.push({ id: 'budget', type: 'warning', message: `${orcamentos.length} orçamento(s) aguardando retorno` });
  }
  ctx.occupancy.filter((o) => o.percent >= 90).forEach((o) => {
    alerts.push({ id: `occ-${o.professionalId}`, type: 'info', message: `Agenda de ${o.name} com ${o.percent}% de ocupação` });
  });
  return alerts;
}

export function getFilterOptions() {
  const db = loadDb();
  const professionals = listCollaborators().map((c) => ({
    id: c.id,
    name: c.apelido || c.nomeCompleto || c.id,
    specialties: c.especialidades || [],
  }));
  const rooms = listRooms().filter((r) => r.active !== false);
  const specialties = [...new Set(professionals.flatMap((p) => p.specialties || []))].filter(Boolean);
  const statuses = Object.entries(DISPLAY_STATUS).map(([value, meta]) => ({ value, label: meta.label }));

  return { professionals, rooms, specialties, statuses };
}

/**
 * Dashboard operacional completo — 13 seções agregadas.
 */
export function getOperationalDashboard(date, filters = {}) {
  const db = loadDb();
  const yesterday = isoDateOffset(date, -1);
  const rawToday = fetchAppointmentsByDate(date);
  const rawYesterday = fetchAppointmentsByDate(yesterday);
  const todayList = applyFilters(rawToday, filters);
  const yesterdayList = applyFilters(rawYesterday, filters);

  const waiting = buildWaiting(todayList);
  const pendingConfirmations = buildPendingConfirmations(todayList);
  const noShows = buildNoShows(todayList, db);
  const inProgress = buildInProgress(todayList);
  const upcoming = buildUpcoming(todayList, date);
  const occupancy = buildOccupancy(todayList, date, db);
  const production = buildProduction(todayList, date, db);
  const financial = buildFinancialSummary(todayList, date, db);
  const journey = buildJourneySummary(todayList);

  const partial = { waiting, pendingConfirmations, noShows, occupancy };
  const alerts = buildClinicAlerts(partial);

  return {
    date,
    executive: buildExecutivePanel(todayList, yesterdayList, db),
    timeline: buildTimeline(todayList),
    waiting,
    inProgress,
    upcoming,
    pendingConfirmations,
    noShows,
    production,
    occupancy,
    alerts,
    financial,
    journey,
    filterOptions: getFilterOptions(),
    totalAppointments: activeAppointments(todayList).length,
  };
}
