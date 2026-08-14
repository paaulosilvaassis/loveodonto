/**
 * SSOT operacional do lifecycle de atendimento clínico.
 * Não persiste status novo. Não auto-finaliza. Não toca contrato/orçamento/assinatura.
 */

export const ATTENDANCE_LIFECYCLE = {
  WAITING: 'waiting',
  IN_ATTENDANCE: 'in_attendance',
  STALE_OPEN: 'stale_open',
  FINISHED: 'finished',
  CANCELED: 'canceled',
  SCHEDULED: 'scheduled',
  INCONSISTENT: 'inconsistent',
};

export const ATTENDANCE_SOURCE = {
  APPOINTMENT_STATUS: 'appointment.status',
};

const WAITING = new Set(['chegou', 'em_espera']);
const IN_ATTENDANCE = new Set(['chamado', 'em_atendimento']);
const FINISHED = new Set(['finalizado', 'atendido']);
const CANCELED = new Set(['cancelado', 'reagendar', 'faltou']);
const OPEN = new Set([...WAITING, ...IN_ATTENDANCE]);

export function todayLocalIso(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function clinicalAppointmentPath(appointmentId) {
  return appointmentId ? `/atendimento-clinico/${appointmentId}` : '/gestao-comercial/jornada-do-paciente';
}

function asDateKey(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return todayLocalIso(d);
}

function clinicalLooksFinished(clinical) {
  if (!clinical) return false;
  const status = String(clinical.status || '').toLowerCase();
  return Boolean(clinical.finishedAt) || FINISHED.has(status);
}

function clinicalLooksOpen(clinical) {
  if (!clinical) return false;
  return !clinicalLooksFinished(clinical);
}

function formatStartedLabel(appointment) {
  const dateKey = asDateKey(appointment?.date);
  const [y, m, d] = dateKey.split('-');
  const dateLabel = d && m && y ? `${d}/${m}/${y}` : dateKey || 'data desconhecida';
  const time = String(appointment?.startTime || '').slice(0, 5);
  if (time) return `Atendimento iniciado em ${dateLabel} às ${time} e ainda não encerrado.`;
  return `Atendimento iniciado em ${dateLabel} e ainda não encerrado.`;
}

/**
 * Interpretação única para Agenda, Jornada, ocupação e atendimento clínico.
 */
export function resolveClinicalAttendanceState({
  appointment = null,
  clinicalAppointment = null,
  asOfDate = null,
  tenantId = null,
} = {}) {
  const asOf = asDateKey(asOfDate) || todayLocalIso();
  const status = String(appointment?.status || '').toLowerCase();
  const scheduledDate = asDateKey(appointment?.date);
  const appointmentId = appointment?.id || null;
  const source = ATTENDANCE_SOURCE.APPOINTMENT_STATUS;

  if (tenantId && appointment?.tenant_id && appointment.tenant_id !== tenantId) {
    return {
      lifecycleStatus: ATTENDANCE_LIFECYCLE.INCONSISTENT,
      isWaiting: false,
      isInAttendance: false,
      isFinished: false,
      isRoomOccupied: false,
      isStale: false,
      requiresResolution: true,
      source,
      reason: 'TENANT_MISMATCH',
      displayLabel: 'Inconsistência de tenant',
      message: 'Atendimento não pertence a este tenant.',
      ctaLabel: null,
      ctaHref: null,
      appointmentId,
      scheduledDate,
    };
  }

  const appointmentOpen = OPEN.has(status);
  const isWaiting = WAITING.has(status);
  const isInAttendance = IN_ATTENDANCE.has(status) && !appointment?.finishedAt;
  const finished = FINISHED.has(status);
  const canceled = CANCELED.has(status);
  const isStale = appointmentOpen && Boolean(scheduledDate) && scheduledDate < asOf;

  const blockers = [];
  if (isInAttendance && clinicalLooksFinished(clinicalAppointment)) {
    blockers.push('APPOINTMENT_OPEN_CLINICAL_CLOSED');
  }
  if (finished && clinicalLooksOpen(clinicalAppointment)) {
    blockers.push('APPOINTMENT_CLOSED_CLINICAL_OPEN');
  }

  const requiresResolution = isStale || blockers.length > 0;
  let lifecycleStatus = ATTENDANCE_LIFECYCLE.SCHEDULED;
  if (blockers.length) lifecycleStatus = ATTENDANCE_LIFECYCLE.INCONSISTENT;
  else if (isStale) lifecycleStatus = ATTENDANCE_LIFECYCLE.STALE_OPEN;
  else if (isInAttendance) lifecycleStatus = ATTENDANCE_LIFECYCLE.IN_ATTENDANCE;
  else if (isWaiting) lifecycleStatus = ATTENDANCE_LIFECYCLE.WAITING;
  else if (finished) lifecycleStatus = ATTENDANCE_LIFECYCLE.FINISHED;
  else if (canceled) lifecycleStatus = ATTENDANCE_LIFECYCLE.CANCELED;

  // Stale não ocupa sala hoje; exige resolução. Não inventa disponibilidade silenciosa.
  const isRoomOccupied = isInAttendance && !isStale && blockers.length === 0;

  let displayLabel = 'Agendado';
  if (lifecycleStatus === ATTENDANCE_LIFECYCLE.STALE_OPEN) displayLabel = 'Atendimento não encerrado';
  else if (lifecycleStatus === ATTENDANCE_LIFECYCLE.IN_ATTENDANCE) displayLabel = 'Em atendimento';
  else if (lifecycleStatus === ATTENDANCE_LIFECYCLE.WAITING) displayLabel = 'Em espera';
  else if (lifecycleStatus === ATTENDANCE_LIFECYCLE.FINISHED) displayLabel = 'Finalizado';
  else if (lifecycleStatus === ATTENDANCE_LIFECYCLE.CANCELED) displayLabel = 'Cancelado';
  else if (lifecycleStatus === ATTENDANCE_LIFECYCLE.INCONSISTENT) displayLabel = 'Inconsistência de atendimento';

  return {
    lifecycleStatus,
    isWaiting,
    isInAttendance,
    isFinished: finished,
    isRoomOccupied,
    isStale,
    requiresResolution,
    source,
    reason: blockers[0] || (isStale ? 'STALE_OPEN_PREVIOUS_DAY' : status || 'none'),
    displayLabel,
    message: isStale ? formatStartedLabel(appointment) : (blockers.length ? 'Estado de agenda e atendimento clínico divergem.' : null),
    ctaLabel: requiresResolution ? 'Resolver atendimento' : null,
    ctaHref: requiresResolution ? clinicalAppointmentPath(appointmentId) : null,
    appointmentId,
    scheduledDate,
    asOfDate: asOf,
  };
}

export function findClinicalAppointmentFor(db, appointmentId) {
  if (!appointmentId) return null;
  return (db?.clinicalAppointments || []).find((row) => row.appointmentId === appointmentId) || null;
}

export function syncClinicalAppointmentFinished(db, appointmentId, finishedAt) {
  if (!db || !appointmentId) return null;
  if (!Array.isArray(db.clinicalAppointments)) return null;
  const idx = db.clinicalAppointments.findIndex((row) => row.appointmentId === appointmentId);
  if (idx < 0) return null;
  const current = db.clinicalAppointments[idx];
  if (current.finishedAt) return current;
  const next = {
    ...current,
    finishedAt,
    updatedAt: finishedAt,
  };
  db.clinicalAppointments[idx] = next;
  return next;
}

export function getAgendaStatusPresentation(appointment, statusStyles = {}, { asOfDate, clinicalAppointment, tenantId } = {}) {
  const state = resolveClinicalAttendanceState({
    appointment,
    clinicalAppointment,
    asOfDate,
    tenantId,
  });
  if (state.isStale || state.lifecycleStatus === ATTENDANCE_LIFECYCLE.INCONSISTENT) {
    return {
      ...state,
      key: state.lifecycleStatus,
      label: state.displayLabel,
      badgeVariant: 'warning',
      background: '#fff7ed',
      border: '#fb923c',
      borderLeft: '#ea580c',
      color: '#9a3412',
    };
  }
  const base = statusStyles[appointment?.status] || {};
  return {
    ...state,
    ...base,
    key: appointment?.status || state.lifecycleStatus,
    label: state.displayLabel || base.label || appointment?.status,
  };
}
