import { loadDb, withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId, assertRequired, normalizeText } from './helpers.js';
import { logAction } from './logService.js';
import { canPlaceEvent } from '../utils/calendar/overlap.js';
import { upsertJourneyEntryForAppointment } from './journeyEntryService.js';
import { addLeadEvent, moveLeadToStage } from './crmService.js';
import {
  syncCheckinCommissionsForAppointment,
  reverseCheckinCommissionsForAppointment,
} from './commissionCalculationService.js';
import { addMinutesToTime, toMinutes as agendaToMinutes, minutesToTime } from '../utils/agendaUtils.js';
import { resolveTenantIdForWrite } from './tenantWriteGuard.js';

export const APPOINTMENT_STATUS = {
  AGENDADO: 'agendado',
  CONFIRMADO: 'confirmado',
  EM_CONFIRMACAO: 'em_confirmacao',
  CHEGOU: 'chegou',
  EM_ESPERA: 'em_espera',
  CHAMADO: 'chamado',
  EM_ATENDIMENTO: 'em_atendimento',
  FINALIZADO: 'finalizado',
  ATENDIDO: 'atendido',
  ATRASADO: 'atrasado',
  FALTOU: 'faltou',
  CANCELADO: 'cancelado',
  REAGENDAR: 'reagendar',
  FALTA: 'faltou',
  DESMARCOU: 'cancelado',
  REAGENDAMENTO: 'reagendar',
};

const WAITING_COMPAT_STATUSES = new Set([
  APPOINTMENT_STATUS.AGENDADO,
  APPOINTMENT_STATUS.CONFIRMADO,
  APPOINTMENT_STATUS.EM_CONFIRMACAO,
]);

const normalizeWorkflow = (appointment) => {
  if (!appointment) return appointment;
  
  
  // PROTEÇÃO CRÍTICA: Se já está em atendimento ou finalizado, NUNCA alterar o status
  // Isso previne que normalizeWorkflow reverta incorretamente o status após callPatient
  if (appointment.status === APPOINTMENT_STATUS.EM_ATENDIMENTO || 
      appointment.status === APPOINTMENT_STATUS.FINALIZADO ||
      appointment.status === APPOINTMENT_STATUS.ATENDIDO) {
    return appointment;
  }
  
  // Só normaliza se tem checkInAt E status está em estados compatíveis com espera
  // NÃO deve afetar EM_ATENDIMENTO, FINALIZADO, etc.
  if (appointment.checkInAt && WAITING_COMPAT_STATUSES.has(appointment.status)) {
    const normalized = {
      ...appointment,
      status: APPOINTMENT_STATUS.EM_ESPERA,
    };
    
    
    return normalized;
  }
  
  
  return appointment;
};

const requireRole = (user, allowedRoles) => {
  if (!user) {
    const error = new Error('Permissão insuficiente.');
    error.code = 'PERMISSION_DENIED';
    throw error;
  }
  if (user.role === 'admin' || user.isMaster === true) return;
  if (!allowedRoles.includes(user.role)) {
    const error = new Error('Permissão insuficiente.');
    error.code = 'PERMISSION_DENIED';
    throw error;
  }
};

const toMinutes = (time) => {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const normalizeSlotCapacity = (value) => {
  return Number(value) === 2 ? 2 : 1;
};

/**
 * Bloqueio conflita quando atinge o recurso do candidato:
 * - bloqueio sem profissional e sem sala = bloqueio geral (atinge tudo);
 * - bloqueio de profissional atinge agendamentos desse profissional;
 * - bloqueio de sala atinge qualquer agendamento naquela sala.
 */
const matchesResource = ({ professionalId, roomId }, item) => {
  const blockProfessional = String(item.professionalId || '').trim();
  const blockRoom = String(item.roomId || '').trim();
  if (!blockProfessional && !blockRoom) return true;
  if (blockProfessional && professionalId && blockProfessional === professionalId) return true;
  if (blockRoom && roomId && blockRoom === roomId) return true;
  return false;
};

export const hasConflict = ({
  date,
  startTime,
  endTime,
  professionalId,
  roomId,
  appointmentId,
  slotCapacity = 1,
}) => {
  const db = loadDb();
  
  // Filtrar apenas agendamentos válidos (não cancelados, mesma data)
  const validAppointments = db.appointments.filter((item) => {
    if (item.status === APPOINTMENT_STATUS.CANCELADO) return false;
    if (item.date !== date) return false;
    return true;
  });

  const candidate = {
    id: appointmentId || 'temp',
    startTime,
    endTime,
    professionalId,
    roomId: roomId || null,
    slotCapacity: normalizeSlotCapacity(slotCapacity),
  };

  const placementResult = canPlaceEvent(validAppointments, candidate, appointmentId);
  const appointmentConflict = !placementResult.ok;

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  // Mesmo profissional em sala diferente no mesmo horário é sempre conflito
  // (encaixe via slotCapacity só vale para a MESMA sala — canPlaceEvent acima).
  const professionalDoubleBooked = Boolean(professionalId) && validAppointments.some((item) => {
    if (appointmentId && item.id === appointmentId) return false;
    if (item.professionalId !== professionalId) return false;
    if ((item.roomId || null) === (roomId || null)) return false;
    return start < toMinutes(item.endTime) && end > toMinutes(item.startTime);
  });

  // Verificar também conflitos com blocos
  const overlapsBlock = (item) => {
    if (item.date !== date) return false;
    const itemStart = toMinutes(item.startTime);
    const itemEnd = toMinutes(item.endTime);
    return start < itemEnd && end > itemStart;
  };
  const blockConflict = db.appointmentBlocks.some((item) => {
    if (!overlapsBlock(item)) return false;
    return matchesResource({ professionalId, roomId }, item);
  });

  return appointmentConflict || professionalDoubleBooked || blockConflict;
};

export const listAppointments = () => {
  const db = loadDb();
  return (db.appointments || []).map(normalizeWorkflow);
};

export const getAppointmentDetails = (appointmentId) => {
  const db = loadDb();
  const appointments = db.appointments || [];
  const appointment = normalizeWorkflow(appointments.find((item) => item.id === appointmentId));
  if (!appointment) return null;

  const patients = db.patients || [];
  const collaborators = db.collaborators || [];
  const rooms = db.rooms || [];
  const patientPhonesAll = db.patientPhones || [];
  const patientRecords = db.patientRecords || [];

  const patient = appointment.patientId ? patients.find((item) => item.id === appointment.patientId) : null;
  const professional = appointment.professionalId ? collaborators.find((item) => item.id === appointment.professionalId) : null;
  const room = appointment.roomId ? rooms.find((item) => item.id === appointment.roomId) : null;
  const patientPhones = appointment.patientId ? patientPhonesAll.filter((item) => item.patient_id === appointment.patientId) : [];
  const primaryPhone = patientPhones.find((item) => item.is_primary) || patientPhones[0];
  const patientRecord = appointment.patientId ? patientRecords.find((item) => item.patient_id === appointment.patientId) : null;

  return {
    appointment,
    patient: patient || null,
    professional: professional || null,
    room: room || null,
    phone: primaryPhone || null,
    recordNumber: patientRecord?.record_number || null,
    email: patient?.email || null,
  };
};
export const listBlocks = () => loadDb().appointmentBlocks || [];

const SLOT_STEP_MINUTES = 15;
const DEFAULT_WORK_START = '08:00';
const DEFAULT_WORK_END = '18:00';

/**
 * Retorna horários disponíveis para um profissional em uma data.
 * Usa a mesma regra da Agenda: horários de trabalho, bloqueios e agendamentos existentes (canPlaceEvent).
 * @param {{ date: string, professionalId: string, durationMinutes: number, roomId?: string, allowDoubleBooking?: boolean }}
 * @returns {{ startTime: string, endTime: string }[]}
 */
export const getAvailableSlots = ({
  date,
  professionalId,
  durationMinutes = 30,
  roomId: roomIdParam,
  allowDoubleBooking = false,
}) => {
  const db = loadDb();
  const roomId = roomIdParam || (db.rooms && db.rooms[0]?.id) || null;
  const dayOfWeek = new Date(`${date}T12:00:00`).getDay();

  const workHours = (db.collaboratorWorkHours || []).filter(
    (w) => w.collaboratorId === professionalId && w.ativo && w.diaSemana === dayOfWeek
  );

  const isValidTime = (t) => /^\d{2}:\d{2}$/.test(t || '');
  const ranges = [];
  workHours.forEach((w) => {
    if (isValidTime(w.inicio) && isValidTime(w.fim)) {
      const start = agendaToMinutes(w.inicio);
      const end = agendaToMinutes(w.fim);
      if (end > start) ranges.push({ start, end });
    }
    if (isValidTime(w.intervaloInicio) && isValidTime(w.intervaloFim)) {
      const start = agendaToMinutes(w.intervaloInicio);
      const end = agendaToMinutes(w.intervaloFim);
      if (end > start) ranges.push({ start, end });
    }
  });

  if (ranges.length === 0) {
    ranges.push({
      start: agendaToMinutes(DEFAULT_WORK_START),
      end: agendaToMinutes(DEFAULT_WORK_END),
    });
  }

  const slotCapacity = allowDoubleBooking ? 2 : 1;
  const slots = [];
  for (const range of ranges) {
    for (let m = range.start; m + durationMinutes <= range.end; m += SLOT_STEP_MINUTES) {
      const startTime = minutesToTime(m);
      const endTime = addMinutesToTime(startTime, durationMinutes);
      const conflict = hasConflict({
        date,
        startTime,
        endTime,
        professionalId,
        roomId,
        slotCapacity,
      });
      if (!conflict) {
        slots.push({ startTime, endTime });
      }
    }
  }
  slots.sort((a, b) => agendaToMinutes(a.startTime) - agendaToMinutes(b.startTime));
  return slots;
};

/**
 * Cria agendamento a partir do CRM (Pipeline). Persiste na mesma tabela db.appointments da Agenda.
 * Se o lead já tiver patientId, usa; senão agenda com leadId/leadDisplayName (Agenda exibe nome do lead).
 * Registra evento na timeline do lead e opcionalmente move para estágio "Avaliação Agendada".
 */
export const createAppointmentFromCrm = (user, payload) => {
  requirePermission(user, 'agenda:write');
  const tenantId = resolveTenantIdForWrite(user, payload?.tenant_id || payload?.tenantId);
  const db = loadDb();
  const lead = (db.crmLeads || []).find((l) => l.id === payload.leadId);
  if (!lead) throw new Error('Lead não encontrado.');

  const professionalId = normalizeText(payload.professionalId);
  const date = normalizeText(payload.date);
  const startTime = normalizeText(payload.startTime);
  const durationMinutes = Number(payload.durationMinutes) || 30;
  const endTime = addMinutesToTime(startTime, durationMinutes);
  const roomId = normalizeText(payload.roomId) || (db.rooms && db.rooms[0]?.id) || null;
  const procedureName = normalizeText(payload.procedureName);
  const notes = normalizeText(payload.notes);

  assertRequired(professionalId, 'Profissional é obrigatório.');
  assertRequired(date, 'Data é obrigatória.');
  assertRequired(startTime, 'Horário é obrigatório.');
  if (!roomId) throw new Error('Nenhuma sala cadastrada. Cadastre uma sala na configuração.');

  const todayIso = new Date().toISOString().slice(0, 10);
  if (date < todayIso) throw new Error('Não é possível agendar no passado.');

  if (hasConflict({ date, startTime, endTime, professionalId, roomId, slotCapacity: 1 })) {
    throw new Error('Este horário não está mais disponível. Escolha outro.');
  }

  const patientId = lead.patientId || null;
  const leadDisplayName = lead.name || 'Lead';

  const appointment = {
    id: createId('appt'),
    patientId,
    leadId: payload.leadId,
    leadDisplayName,
    professionalId,
    roomId,
    date,
    startTime,
    endTime,
    status: APPOINTMENT_STATUS.AGENDADO,
    notes: notes || `Agendado a partir do CRM (lead: ${lead.name || payload.leadId})`,
    isReturn: false,
    procedureName: procedureName || 'Avaliação',
    insurance: '',
    channel: 'crm_pipeline',
    durationMinutes,
    slotCapacity: 1,
    confirmationLogs: [],
    checkInAt: null,
    calledAt: null,
    startedAt: null,
    finishedAt: null,
    consultorioId: roomId,
    dentistId: professionalId,
    workflowNotes: null,
    delayReason: null,
    checkInPreviousStatus: null,
    createdAt: new Date().toISOString(),
    tenant_id: tenantId,
  };

  withDb((dbWrite) => {
    dbWrite.appointments.push(appointment);
    return dbWrite;
  });

  addLeadEvent(user, payload.leadId, 'appointment_scheduled', {
    appointmentId: appointment.id,
    date,
    startTime,
    endTime,
    professionalId,
    procedureName: appointment.procedureName,
    source: 'crm_pipeline',
  });

  const moveToStageKey = payload.moveToStageKey ?? 'avaliacao_agendada';
  try {
    moveLeadToStage(user, payload.leadId, moveToStageKey);
  } catch (_) {
    // Stage pode não existir; ignorar
  }

  logAction('agenda:create_from_crm', {
    appointmentId: appointment.id,
    leadId: payload.leadId,
    userId: user?.id,
  });
  return appointment;
};

export const createAppointment = (user, payload) => {
  requirePermission(user, 'agenda:write');
  const tenantId = resolveTenantIdForWrite(user, payload?.tenant_id || payload?.tenantId);
  const patientId = normalizeText(payload.patientId);
  const professionalId = normalizeText(payload.professionalId);
  const roomId = normalizeText(payload.roomId);
  const date = normalizeText(payload.date);
  const startTime = normalizeText(payload.startTime);
  const endTime = normalizeText(payload.endTime);
  const status = payload.status || APPOINTMENT_STATUS.AGENDADO;
  const isReturn = Boolean(payload.isReturn);
  const procedureName = normalizeText(payload.procedureName);
  const insurance = normalizeText(payload.insurance);
  const channel = normalizeText(payload.channel);
  const durationMinutes = payload.durationMinutes ? Number(payload.durationMinutes) : null;
  const slotCapacity = normalizeSlotCapacity(payload.slotCapacity);

  assertRequired(patientId, 'Paciente é obrigatório.');
  assertRequired(professionalId, 'Profissional é obrigatório.');
  assertRequired(roomId, 'Sala é obrigatória.');
  assertRequired(date, 'Data é obrigatória.');
  assertRequired(startTime, 'Horário inicial é obrigatório.');
  assertRequired(endTime, 'Horário final é obrigatório.');

  if (hasConflict({ date, startTime, endTime, professionalId, roomId, slotCapacity })) {
    throw new Error('Conflito de horário detectado.');
  }

  const appointment = {
    id: createId('appt'),
    patientId,
    professionalId,
    roomId,
    date,
    startTime,
    endTime,
    status,
    notes: normalizeText(payload.notes),
    isReturn,
    procedureName,
    insurance,
    channel,
    durationMinutes,
    slotCapacity,
    confirmationLogs: payload.confirmationLogs || [],
    checkInAt: null,
    calledAt: null,
    startedAt: null,
    finishedAt: null,
    consultorioId: normalizeText(payload.consultorioId) || roomId || null,
    dentistId: normalizeText(payload.dentistId) || professionalId || null,
    workflowNotes: normalizeText(payload.workflowNotes),
    delayReason: payload.delayReason || null,
    checkInPreviousStatus: null,
    createdAt: new Date().toISOString(),
    tenant_id: tenantId,
  };

  withDb((db) => {
    db.appointments.push(appointment);
    return db;
  });
  logAction('agenda:create', { appointmentId: appointment.id, userId: user.id });
  return appointment;
};

export const updateAppointment = (user, appointmentId, payload) => {
  requirePermission(user, 'agenda:write');
  return withDb((db) => {
    const index = db.appointments.findIndex((item) => item.id === appointmentId);
    if (index < 0) {
      throw new Error('Consulta não encontrada.');
    }
    const next = normalizeWorkflow({
      ...db.appointments[index],
      ...payload,
    });

    if (payload.professionalId && !payload.dentistId) {
      next.dentistId = payload.professionalId;
    }
    if (payload.roomId && !payload.consultorioId) {
      next.consultorioId = payload.roomId;
    }

    const nextCapacity = normalizeSlotCapacity(next.slotCapacity);
    if (
      hasConflict({
        date: next.date,
        startTime: next.startTime,
        endTime: next.endTime,
        professionalId: next.professionalId,
        roomId: next.roomId,
        appointmentId,
        slotCapacity: nextCapacity,
      })
    ) {
      throw new Error('Conflito de horário detectado.');
    }

    db.appointments[index] = next;
    upsertJourneyEntryForAppointment(db, next);
    logAction('agenda:update', { appointmentId, userId: user.id });
    return db.appointments[index];
  });
};

export const cancelAppointment = (user, appointmentId, reason = '') => {
  requirePermission(user, 'agenda:write');
  const updated = updateAppointment(user, appointmentId, {
    status: APPOINTMENT_STATUS.CANCELADO,
    cancelReason: normalizeText(reason),
  });
  return updated;
};

export const createBlock = (user, payload) => {
  requirePermission(user, 'agenda:write');
  const block = {
    id: createId('block'),
    date: normalizeText(payload.date),
    startTime: normalizeText(payload.startTime),
    endTime: normalizeText(payload.endTime),
    professionalId: normalizeText(payload.professionalId),
    roomId: normalizeText(payload.roomId),
    reason: normalizeText(payload.reason),
  };

  assertRequired(block.date, 'Data do bloqueio é obrigatória.');
  assertRequired(block.startTime, 'Horário inicial do bloqueio é obrigatório.');
  assertRequired(block.endTime, 'Horário final do bloqueio é obrigatório.');

  if (
    hasConflict({
      date: block.date,
      startTime: block.startTime,
      endTime: block.endTime,
      professionalId: block.professionalId,
      roomId: block.roomId,
    })
  ) {
    throw new Error('Conflito com agenda existente.');
  }

  withDb((db) => {
    db.appointmentBlocks.push(block);
    return db;
  });
  logAction('agenda:block', { blockId: block.id, userId: user.id });
  return block;
};

/**
 * Confirma chegada do paciente (check-in)
 * Transição: AGENDADO/CONFIRMADO -> EM_ESPERA
 */
export const checkInAppointment = (user, appointmentId) => {
  requirePermission(user, 'agenda:write');
  return withDb((db) => {
    const index = db.appointments.findIndex((item) => item.id === appointmentId);
    if (index < 0) {
      throw new Error('Consulta não encontrada.');
    }
    const appointment = normalizeWorkflow(db.appointments[index]);
    
    // Validar que pode fazer check-in
    if (![APPOINTMENT_STATUS.AGENDADO, APPOINTMENT_STATUS.CONFIRMADO].includes(appointment.status)) {
      throw new Error('Não é possível confirmar chegada para este status.');
    }

    const now = new Date().toISOString();
    const next = {
      ...appointment,
      status: APPOINTMENT_STATUS.CHEGOU,
      checkInAt: now,
      calledAt: null,
      startedAt: null,
      finishedAt: null,
      checkInPreviousStatus: appointment.status,
    };

    db.appointments[index] = next;
    upsertJourneyEntryForAppointment(db, next, { checkedInAt: now });
    logAction('journey:checkin', { appointmentId, userId: user.id, checkInAt: now });
    const saved = db.appointments[index];
    try {
      syncCheckinCommissionsForAppointment(user, saved.id);
    } catch {
      /* best-effort */
    }
    return saved;
  });
};

/**
 * Desfaz check-in (volta para status anterior)
 */
export const undoCheckIn = (user, appointmentId) => {
  requirePermission(user, 'agenda:write');
  requireRole(user, ['admin', 'gerente', 'recepcao']);
  return withDb((db) => {
    const index = db.appointments.findIndex((item) => item.id === appointmentId);
    if (index < 0) {
      throw new Error('Consulta não encontrada.');
    }
    const appointment = normalizeWorkflow(db.appointments[index]);
    
    if (appointment.status !== APPOINTMENT_STATUS.EM_ESPERA || !appointment.checkInAt) {
      throw new Error('Não é possível desfazer check-in para este agendamento.');
    }

    const previousStatus =
      appointment.checkInPreviousStatus ||
      (Array.isArray(appointment.confirmationLogs) && appointment.confirmationLogs.length > 0
        ? APPOINTMENT_STATUS.CONFIRMADO
        : APPOINTMENT_STATUS.AGENDADO);

    const next = {
      ...appointment,
      status: previousStatus,
      checkInAt: null,
      calledAt: null,
      startedAt: null,
      checkInPreviousStatus: null,
    };

    db.appointments[index] = next;
    logAction('journey:undo_checkin', { appointmentId, userId: user.id });
    const saved = db.appointments[index];
    try {
      reverseCheckinCommissionsForAppointment(user, appointmentId, 'Chegada desfeita na recepção');
    } catch {
      /* best-effort */
    }
    return saved;
  });
};

/**
 * Chama paciente para o consultório
 * Transição: EM_ESPERA -> EM_ATENDIMENTO
 */
export const callPatient = (user, appointmentId, consultorioId) => {
  requirePermission(user, 'agenda:write');
  requireRole(user, ['admin', 'gerente', 'profissional', 'recepcao']);
  return withDb((db) => {
    const index = db.appointments.findIndex((item) => item.id === appointmentId);
    if (index < 0) {
      throw new Error('Consulta não encontrada.');
    }
    const appointment = normalizeWorkflow(db.appointments[index]);
    
    
    if (![APPOINTMENT_STATUS.EM_ESPERA, APPOINTMENT_STATUS.CHEGOU].includes(appointment.status)) {
      throw new Error('Paciente deve estar em espera para ser chamado.');
    }
    if (!appointment.checkInAt) {
      throw new Error('Paciente não fez check-in.');
    }

    const now = new Date().toISOString();
    const next = {
      ...appointment,
      status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      calledAt: now,
      startedAt: now,
      consultorioId: consultorioId || appointment.consultorioId || appointment.roomId || null,
      finishedAt: null,
    };

    db.appointments[index] = next;
    upsertJourneyEntryForAppointment(db, next, { calledAt: now, startedAt: now });
    
    
    logAction('journey:call', { appointmentId, userId: user.id, consultorioId: next.consultorioId, calledAt: now });
    
    
    return savedAppointment;
  });
};

/**
 * Finaliza atendimento
 * Transição: EM_ATENDIMENTO -> FINALIZADO
 */
export const finishAppointment = (user, appointmentId) => {
  requirePermission(user, 'agenda:write');
  requireRole(user, ['admin', 'gerente', 'profissional', 'recepcao']);
  return withDb((db) => {
    const index = db.appointments.findIndex((item) => item.id === appointmentId);
    if (index < 0) {
      throw new Error('Consulta não encontrada.');
    }
    const appointment = normalizeWorkflow(db.appointments[index]);
    
    if (appointment.status !== APPOINTMENT_STATUS.EM_ATENDIMENTO) {
      throw new Error('Paciente deve estar em atendimento para finalizar.');
    }

    const now = new Date().toISOString();
    const next = {
      ...appointment,
      status: APPOINTMENT_STATUS.FINALIZADO,
      finishedAt: now,
    };

    db.appointments[index] = next;
    upsertJourneyEntryForAppointment(db, next, { finishedAt: now });
    logAction('journey:finish', { appointmentId, userId: user.id, finishedAt: now });
    return db.appointments[index];
  });
};

/**
 * Volta paciente de atendimento para espera (somente gerente)
 */
export const returnToWaiting = (user, appointmentId) => {
  requirePermission(user, 'agenda:write');
  requireRole(user, ['admin', 'gerente', 'profissional', 'recepcao']);
  return withDb((db) => {
    const index = db.appointments.findIndex((item) => item.id === appointmentId);
    if (index < 0) {
      throw new Error('Consulta não encontrada.');
    }
    const appointment = normalizeWorkflow(db.appointments[index]);
    
    if (appointment.status !== APPOINTMENT_STATUS.EM_ATENDIMENTO) {
      throw new Error('Apenas agendamentos em atendimento podem voltar para espera.');
    }
    if (!appointment.checkInAt) {
      throw new Error('Agendamento sem check-in não pode voltar para espera.');
    }

    const next = {
      ...appointment,
      status: APPOINTMENT_STATUS.EM_ESPERA,
      calledAt: null,
      startedAt: null,
      finishedAt: null,
    };

    db.appointments[index] = next;
    upsertJourneyEntryForAppointment(db, next);
    logAction('journey:return_to_waiting', { appointmentId, userId: user.id });
    return db.appointments[index];
  });
};
