/**
 * Central da Jornada do Paciente — agregador operacional (11 seções).
 */

import { loadDb } from '../db/index.js';
import {
  fetchAppointmentsByDate,
  FLOW_COLUMN,
  FLOW_COLUMN_META,
} from './patientFlowService.js';
import { listCrmBudgets, BUDGET_STATUS } from './crmBudgetService.js';
import { APPOINTMENT_STATUS } from './appointmentService.js';
import { getCashSummaryForDate } from './cashRegisterService.js';
import { listCollaborators } from './collaboratorService.js';
import { listRooms } from './teamService.js';
import { getWaitTimeSeconds } from '../utils/journeyUtils.js';

const CANCELLED = new Set([
  APPOINTMENT_STATUS.CANCELADO, APPOINTMENT_STATUS.REAGENDAR, 'cancelado', 'reagendar', 'desmarcou',
]);

const PRESENT_COLUMNS = new Set([
  FLOW_COLUMN.RECEPCAO,
  FLOW_COLUMN.SALA_ESPERA,
  FLOW_COLUMN.CONSULTORIO,
  FLOW_COLUMN.AVALIACAO_COMERCIAL,
  FLOW_COLUMN.FINANCEIRO,
]);

const FLOW_STATUS_LABELS = {
  [FLOW_COLUMN.AGENDADOS]: 'Agendado',
  [FLOW_COLUMN.RECEPCAO]: 'Recepção',
  [FLOW_COLUMN.SALA_ESPERA]: 'Sala de Espera',
  [FLOW_COLUMN.CONSULTORIO]: 'Consultório',
  [FLOW_COLUMN.AVALIACAO_COMERCIAL]: 'Avaliação Comercial',
  [FLOW_COLUMN.FINANCEIRO]: 'Financeiro',
  [FLOW_COLUMN.FINALIZADO]: 'Finalizado',
  [FLOW_COLUMN.FALTA_CANCELADO]: 'Falta / Cancelado',
};

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
  return { value: current, previous, ...calcTrend(current, previous) };
}

function activeAppointments(list) {
  return list.filter((a) => !CANCELLED.has(a.status) && a.flowColumn !== FLOW_COLUMN.FALTA_CANCELADO);
}

function sortByTime(list) {
  return [...list].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
}

function minutesSince(isoStart, now = new Date()) {
  if (!isoStart) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(isoStart).getTime()) / 60000));
}

function avgMinutes(pairs) {
  const valid = pairs.filter((m) => m !== null && m >= 0);
  if (!valid.length) return 0;
  return Math.round(valid.reduce((s, m) => s + m, 0) / valid.length);
}

function estimateAppointmentValue(apt, db) {
  const clinical = (db.clinicalAppointments || []).find((c) => c.appointmentId === apt.id);
  if (clinical?.budget?.total) return Number(clinical.budget.total) || 0;
  if (clinical?.budget?.value) return Number(clinical.budget.value) || 0;
  return Number(apt.estimatedValue) || 0;
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

function applyFilters(appointments, filters = {}) {
  return appointments.filter((apt) => {
    if (filters.professionalId && apt.professionalId !== filters.professionalId) return false;
    if (filters.roomId && apt.roomId !== filters.roomId && apt.consultorioId !== filters.roomId) return false;
    if (filters.flowColumn && apt.flowColumn !== filters.flowColumn) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const name = (apt.patientName || '').toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });
}

function mapKanbanCard(apt, now = new Date()) {
  const col = apt.flowColumn || FLOW_COLUMN.AGENDADOS;
  const waitRef = apt.checkInAt || apt.checkedInAt;
  const waitSec = [FLOW_COLUMN.RECEPCAO, FLOW_COLUMN.SALA_ESPERA].includes(col) && waitRef
    ? getWaitTimeSeconds(waitRef, now)
    : 0;
  const waitMin = Math.floor(waitSec / 60);

  return {
    appointmentId: apt.id,
    patientId: apt.patientId,
    patientName: apt.patientName || apt.leadDisplayName || 'Paciente',
    startTime: apt.startTime || '—',
    procedureName: apt.procedureName || (apt.isReturn ? 'Retorno' : 'Consulta'),
    professionalName: apt.professionalName || '—',
    professionalId: apt.professionalId,
    flowColumn: col,
    statusLabel: FLOW_STATUS_LABELS[col] || col,
    waitMinutes: waitMin,
    waitLabel: waitMin > 0 ? `${waitMin} min aguardando` : null,
    waitTone: waitMin <= 10 ? 'green' : waitMin <= 20 ? 'yellow' : waitMin > 0 ? 'red' : 'neutral',
    roomName: apt.consultorioName || apt.roomName || null,
    serviceMinutes: [FLOW_COLUMN.CONSULTORIO, FLOW_COLUMN.AVALIACAO_COMERCIAL, FLOW_COLUMN.FINANCEIRO].includes(col)
      ? minutesSince(apt.startedAt || apt.calledAt, now)
      : 0,
  };
}

function buildSummary(todayList, yesterdayList) {
  const countCol = (list, col) => list.filter((a) => a.flowColumn === col).length;
  const countPresent = (list) => list.filter((a) => PRESENT_COLUMNS.has(a.flowColumn)).length;
  const countRetornos = (list) => activeAppointments(list).filter((a) => a.isReturn).length;
  const countFaltas = (list) => list.filter((a) =>
    a.flowColumn === FLOW_COLUMN.FALTA_CANCELADO || a.status === APPOINTMENT_STATUS.FALTOU
  ).length;

  const todayActive = activeAppointments(todayList);
  const yActive = activeAppointments(yesterdayList);

  const mk = (fnToday, fnYesterday) => kpiWithTrend(fnToday(todayList), fnYesterday(yesterdayList));

  return {
    agendadosHoje: mk(
      (l) => todayActive.length,
      (l) => activeAppointments(l).length
    ),
    presentesNaClinica: mk(countPresent, countPresent),
    emEspera: mk(
      (l) => countCol(l, FLOW_COLUMN.SALA_ESPERA) + countCol(l, FLOW_COLUMN.RECEPCAO),
      (l) => countCol(l, FLOW_COLUMN.SALA_ESPERA) + countCol(l, FLOW_COLUMN.RECEPCAO)
    ),
    emAtendimento: mk(
      (l) => countCol(l, FLOW_COLUMN.CONSULTORIO),
      (l) => countCol(l, FLOW_COLUMN.CONSULTORIO)
    ),
    emAvaliacaoComercial: mk(
      (l) => countCol(l, FLOW_COLUMN.AVALIACAO_COMERCIAL),
      (l) => countCol(l, FLOW_COLUMN.AVALIACAO_COMERCIAL)
    ),
    finalizados: mk(
      (l) => countCol(l, FLOW_COLUMN.FINALIZADO),
      (l) => countCol(l, FLOW_COLUMN.FINALIZADO)
    ),
    faltas: mk(countFaltas, countFaltas),
    retornos: mk(countRetornos, countRetornos),
  };
}

function buildKanban(list, now = new Date()) {
  const columns = {};
  FLOW_COLUMN_META.forEach((meta) => { columns[meta.id] = []; });

  sortByTime(list).forEach((apt) => {
    const col = apt.flowColumn || FLOW_COLUMN.AGENDADOS;
    const card = mapKanbanCard(apt, now);
    if (columns[col]) columns[col].push(card);
    else columns[FLOW_COLUMN.AGENDADOS].push(card);
  });

  return { columns, meta: FLOW_COLUMN_META };
}

function buildWaitingHighlight(list, now = new Date()) {
  return sortByTime(
    list.filter((a) => [FLOW_COLUMN.RECEPCAO, FLOW_COLUMN.SALA_ESPERA].includes(a.flowColumn))
  ).map((apt) => {
    const waitSec = getWaitTimeSeconds(apt.checkInAt || apt.checkedInAt, now);
    const waitMin = Math.floor(waitSec / 60);
    return {
      appointmentId: apt.id,
      patientName: apt.patientName || 'Paciente',
      arrivalTime: apt.checkInAt
        ? new Date(apt.checkInAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : apt.startTime,
      waitMinutes: waitMin,
      waitLabel: waitMin >= 60 ? `${Math.floor(waitMin / 60)}h ${waitMin % 60}min` : `${waitMin} min`,
      isAlert: waitMin > 20,
      professionalName: apt.professionalName || '—',
      patientId: apt.patientId,
    };
  }).sort((a, b) => b.waitMinutes - a.waitMinutes);
}

function buildInProgress(list, now = new Date()) {
  return list
    .filter((a) => [FLOW_COLUMN.CONSULTORIO, FLOW_COLUMN.AVALIACAO_COMERCIAL, FLOW_COLUMN.FINANCEIRO].includes(a.flowColumn))
    .map((apt) => ({
      appointmentId: apt.id,
      patientName: apt.patientName || 'Paciente',
      professionalName: apt.professionalName || '—',
      roomName: apt.consultorioName || apt.roomName || 'Sala —',
      procedureName: apt.procedureName || 'Atendimento',
      minutesInService: minutesSince(apt.startedAt || apt.calledAt, now),
      flowColumn: apt.flowColumn,
      patientId: apt.patientId,
    }));
}

function buildUpcoming2h(list, date, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  if (date !== today) {
    return sortByTime(activeAppointments(list)).slice(0, 8).map((apt) => ({
      appointmentId: apt.id,
      startTime: apt.startTime,
      patientName: apt.patientName || 'Paciente',
    }));
  }

  const endMs = now.getTime() + 2 * 60 * 60 * 1000;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return sortByTime(activeAppointments(list))
    .filter((apt) => {
      if (PRESENT_COLUMNS.has(apt.flowColumn) || apt.flowColumn === FLOW_COLUMN.FINALIZADO) return false;
      if (!apt.startTime) return false;
      const [h, m] = apt.startTime.split(':').map(Number);
      const aptMin = h * 60 + m;
      const endMin = Math.floor(endMs / 60000) % (24 * 60);
      return aptMin >= nowMinutes && aptMin <= (nowMinutes + 120);
    })
    .slice(0, 12)
    .map((apt) => ({
      appointmentId: apt.id,
      startTime: apt.startTime,
      patientName: apt.patientName || 'Paciente',
      procedureName: apt.procedureName || 'Consulta',
    }));
}

function buildLosses(list, db) {
  return list
    .filter((a) =>
      a.flowColumn === FLOW_COLUMN.FALTA_CANCELADO
      || a.status === APPOINTMENT_STATUS.FALTOU
      || CANCELLED.has(a.status)
    )
    .map((apt) => ({
      appointmentId: apt.id,
      patientName: apt.patientName || 'Paciente',
      startTime: apt.startTime || '—',
      procedureName: apt.procedureName || 'Consulta',
      professionalName: apt.professionalName || '—',
      reason: apt.cancelReason || apt.noShowReason || apt.notes || (apt.status === APPOINTMENT_STATUS.FALTOU ? 'Falta' : 'Cancelado'),
      estimatedValue: estimateAppointmentValue(apt, db),
      patientId: apt.patientId,
    }));
}

function buildProduction(list, date, db) {
  const done = list.filter((a) => a.flowColumn === FLOW_COLUMN.FINALIZADO);
  const isEval = (a) => (a.procedureName || '').toLowerCase().match(/avalia/);
  const budgetsToday = (db.crmBudgets || []).filter((b) => (b.createdAt || '').slice(0, 10) === date);
  const closedToday = budgetsToday.filter((b) => b.status === BUDGET_STATUS.APROVADO);
  const cash = getCashSummaryForDate(date);

  return {
    consultasRealizadas: done.filter((a) => !isEval(a)).length,
    avaliacoesRealizadas: done.filter(isEval).length,
    orcamentosApresentados: budgetsToday.length,
    tratamentosFechados: closedToday.length,
    receitaPrevista: activeAppointments(list).reduce((s, a) => s + estimateAppointmentValue(a, db), 0),
    receitaFechada: cash.entries,
  };
}

function buildAverageWaitTimes(list) {
  const recepcao = [];
  const sala = [];
  const atendimento = [];
  const permanencia = [];

  list.forEach((apt) => {
    const checkIn = apt.checkInAt || apt.checkedInAt;
    const called = apt.calledAt;
    const started = apt.startedAt;
    const finished = apt.finishedAt;

    if (checkIn && called && apt.flowColumn !== FLOW_COLUMN.AGENDADOS) {
      recepcao.push(minutesSince(checkIn, new Date(called)));
    }
    if (checkIn && started) {
      sala.push(minutesSince(checkIn, new Date(started)));
    }
    if (started && finished) {
      atendimento.push(minutesSince(started, new Date(finished)));
    }
    if (checkIn && finished) {
      permanencia.push(minutesSince(checkIn, new Date(finished)));
    }
  });

  return {
    recepcao: avgMinutes(recepcao),
    salaEspera: avgMinutes(sala),
    atendimento: avgMinutes(atendimento),
    permanenciaTotal: avgMinutes(permanencia),
  };
}

function buildOccupancy(list, db) {
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
    return { professionalId: id, name: data.name, percent };
  }).sort((a, b) => b.percent - a.percent);
}

function buildAlerts(ctx, list, date, now = new Date()) {
  const alerts = [];

  ctx.waiting.filter((w) => w.isAlert).forEach((w) => {
    alerts.push({
      id: `wait-${w.appointmentId}`,
      type: 'danger',
      message: `Paciente aguardando há mais de 20 minutos — ${w.patientName}`,
    });
  });

  const today = now.toISOString().slice(0, 10);
  if (date === today) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    list.filter((a) => a.flowColumn === FLOW_COLUMN.AGENDADOS && a.startTime).forEach((apt) => {
      const [h, m] = apt.startTime.split(':').map(Number);
      if (h * 60 + m < nowMin - 15) {
        alerts.push({
          id: `late-${apt.id}`,
          type: 'warning',
          message: `Consulta atrasada — ${apt.patientName} (${apt.startTime})`,
        });
      }
    });
  }

  const rooms = listRooms().filter((r) => r.active !== false);
  const busyRooms = new Set(
    list.filter((a) => a.flowColumn === FLOW_COLUMN.CONSULTORIO)
      .map((a) => a.consultorioId || a.roomId)
      .filter(Boolean)
  );
  rooms.filter((r) => !busyRooms.has(r.id)).slice(0, 2).forEach((r) => {
    alerts.push({ id: `room-${r.id}`, type: 'info', message: `Sala disponível — ${r.name || r.nome}` });
  });

  listCollaborators().forEach((c) => {
    const hasPatient = list.some((a) =>
      a.professionalId === c.id
      && [FLOW_COLUMN.CONSULTORIO, FLOW_COLUMN.AVALIACAO_COMERCIAL].includes(a.flowColumn)
    );
    const hasAgenda = list.some((a) => a.professionalId === c.id && a.flowColumn === FLOW_COLUMN.AGENDADOS);
    if (hasAgenda && !hasPatient) {
      alerts.push({
        id: `idle-${c.id}`,
        type: 'warning',
        message: `Dentista sem paciente — ${c.apelido || c.nomeCompleto}`,
      });
    }
  });

  const avaliacao = list.filter((a) => a.flowColumn === FLOW_COLUMN.AVALIACAO_COMERCIAL);
  if (avaliacao.length) {
    alerts.push({
      id: 'budget-wait',
      type: 'warning',
      message: `${avaliacao.length} paciente(s) aguardando orçamento`,
    });
  }

  const financeiro = list.filter((a) => a.flowColumn === FLOW_COLUMN.FINANCEIRO);
  if (financeiro.length) {
    alerts.push({
      id: 'fin-wait',
      type: 'warning',
      message: `${financeiro.length} paciente(s) aguardando financeiro`,
    });
  }

  const orcamentos = listCrmBudgets({ status: BUDGET_STATUS.EM_ANALISE });
  if (orcamentos.length) {
    alerts.push({
      id: 'crm-budget',
      type: 'info',
      message: `${orcamentos.length} orçamento(s) em análise no CRM`,
    });
  }

  return alerts;
}

export function getFilterOptions() {
  const db = loadDb();
  const professionals = listCollaborators().map((c) => ({
    id: c.id,
    name: c.apelido || c.nomeCompleto || c.id,
  }));
  const rooms = listRooms().filter((r) => r.active !== false);
  return { professionals, rooms };
}

/**
 * Dashboard completo do Fluxo do Paciente.
 */
export function getPatientFlowDashboard(date, { tenantId, filters = {} } = {}) {
  const db = loadDb();
  const yesterday = isoDateOffset(date, -1);
  const now = new Date();

  const rawToday = fetchAppointmentsByDate(date, { tenantId });
  const rawYesterday = fetchAppointmentsByDate(yesterday, { tenantId });
  const todayList = applyFilters(rawToday, filters);
  const yesterdayList = applyFilters(rawYesterday, filters);

  const waiting = buildWaitingHighlight(todayList, now);
  const inProgress = buildInProgress(todayList, now);
  const upcoming = buildUpcoming2h(todayList, date, now);
  const losses = buildLosses(todayList, db);
  const production = buildProduction(todayList, date, db);
  const averageWait = buildAverageWaitTimes(todayList);
  const occupancy = buildOccupancy(todayList, db);
  const alerts = buildAlerts({ waiting }, todayList, date, now);

  return {
    date,
    summary: buildSummary(todayList, yesterdayList),
    kanban: buildKanban(todayList, now),
    waiting,
    inProgress,
    upcoming,
    losses,
    production,
    averageWait,
    occupancy,
    alerts,
    appointments: todayList,
    filterOptions: getFilterOptions(),
    totalAppointments: todayList.length,
  };
}
