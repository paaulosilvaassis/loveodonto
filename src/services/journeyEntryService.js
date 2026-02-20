import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';

export const JOURNEY_STAGE = {
  AGENDADOS: 'agendados',
  SALA_ESPERA: 'sala_espera',
  CONSULTORIO: 'consultorio',
  FINALIZADO: 'finalizado',
  CANCELADOS: 'cancelados',
  FALTAS: 'faltas',
};

const STATUS = {
  AGENDADO: 'agendado',
  CONFIRMADO: 'confirmado',
  EM_CONFIRMACAO: 'em_confirmacao',
  ATRASADO: 'atrasado',
  CHEGOU: 'chegou',
  EM_ESPERA: 'em_espera',
  EM_ATENDIMENTO: 'em_atendimento',
  FINALIZADO: 'finalizado',
  ATENDIDO: 'atendido',
  CANCELADO: 'cancelado',
  REAGENDAR: 'reagendar',
  FALTOU: 'faltou',
};

const STATUS_TO_STAGE = {
  [STATUS.AGENDADO]: JOURNEY_STAGE.AGENDADOS,
  [STATUS.CONFIRMADO]: JOURNEY_STAGE.AGENDADOS,
  [STATUS.EM_CONFIRMACAO]: JOURNEY_STAGE.AGENDADOS,
  [STATUS.ATRASADO]: JOURNEY_STAGE.AGENDADOS,
  [STATUS.CHEGOU]: JOURNEY_STAGE.SALA_ESPERA,
  [STATUS.EM_ESPERA]: JOURNEY_STAGE.SALA_ESPERA,
  [STATUS.EM_ATENDIMENTO]: JOURNEY_STAGE.CONSULTORIO,
  [STATUS.FINALIZADO]: JOURNEY_STAGE.FINALIZADO,
  [STATUS.ATENDIDO]: JOURNEY_STAGE.FINALIZADO,
  [STATUS.CANCELADO]: JOURNEY_STAGE.CANCELADOS,
  [STATUS.REAGENDAR]: JOURNEY_STAGE.CANCELADOS,
  [STATUS.FALTOU]: JOURNEY_STAGE.FALTAS,
};

const ensureJourneyEntries = (db) => {
  if (!Array.isArray(db.patientJourneyEntries)) {
    db.patientJourneyEntries = [];
  }
};

export const getJourneyStageFromStatus = (status) =>
  STATUS_TO_STAGE[status] || JOURNEY_STAGE.AGENDADOS;

export const enrichAppointment = (db, appointment) => {
  if (!appointment) return null;
  const patient = appointment.patientId ? db.patients.find((p) => p.id === appointment.patientId) : null;
  const professional = appointment.professionalId ? db.collaborators.find((c) => c.id === appointment.professionalId) : null;
  const room = appointment.roomId ? db.rooms.find((r) => r.id === appointment.roomId) : null;
  const consultorio = appointment.consultorioId ? db.rooms.find((r) => r.id === appointment.consultorioId) : null;
  const patientPhones = appointment.patientId ? db.patientPhones.filter((p) => p.patient_id === appointment.patientId) : [];
  const primaryPhone = patientPhones.find((p) => p.is_primary) || patientPhones[0];
  const patientName = patient?.full_name || patient?.nickname || patient?.social_name || 'Paciente';

  return {
    ...appointment,
    patient,
    professional,
    room,
    phone: primaryPhone || null,
    patientName,
    patientFirstName: patientName.split(' ')[0],
    professionalName: professional?.nomeCompleto || professional?.name || 'Profissional',
    roomName: room?.name || 'Sala',
    consultorioName: consultorio?.name || appointment.consultorioId || room?.name || 'Sala',
  };
};

export const upsertJourneyEntryForAppointment = (db, appointment, overrides = {}) => {
  if (!appointment) return null;
  ensureJourneyEntries(db);
  const date = appointment.date;
  if (!date) return null;

  const now = new Date().toISOString();
  const stage = overrides.stage || getJourneyStageFromStatus(appointment.status);

  const base = {
    date,
    appointmentId: appointment.id,
    patientId: appointment.patientId || null,
    professionalId: appointment.professionalId || null,
    stage,
    status: appointment.status,
    checkedInAt: appointment.checkInAt || null,
    calledAt: appointment.calledAt || null,
    startedAt: appointment.startedAt || null,
    finishedAt: appointment.finishedAt || null,
    updatedAt: now,
  };

  const index = db.patientJourneyEntries.findIndex(
    (entry) => entry.date === date && entry.appointmentId === appointment.id
  );

  if (index >= 0) {
    db.patientJourneyEntries[index] = {
      ...db.patientJourneyEntries[index],
      ...base,
      ...overrides,
      updatedAt: now,
    };
    return db.patientJourneyEntries[index];
  }

  const entry = {
    id: createId('journey'),
    createdAt: now,
    ...base,
    ...overrides,
  };
  db.patientJourneyEntries.push(entry);
  return entry;
};

export const ensureJourneyEntriesForDate = (db, date) => {
  ensureJourneyEntries(db);
  const appointments = (db.appointments || []).filter((apt) => apt.date === date);
  const entriesByAppointmentId = new Map();

  appointments.forEach((appointment) => {
    const entry = upsertJourneyEntryForAppointment(db, appointment);
    if (entry) {
      entriesByAppointmentId.set(appointment.id, entry);
    }
  });

  return { appointments, entriesByAppointmentId };
};

export const listJourneyEntriesByDate = (date) =>
  withDb((db) => {
    const { appointments, entriesByAppointmentId } = ensureJourneyEntriesForDate(db, date);
    return appointments.map((appointment) => {
      const entry = entriesByAppointmentId.get(appointment.id);
      const enriched = enrichAppointment(db, appointment);
      return {
        ...enriched,
        journeyEntryId: entry?.id || null,
        journeyStage: entry?.stage || getJourneyStageFromStatus(appointment.status),
        journeyStatus: entry?.status || appointment.status,
        journeyCheckedInAt: entry?.checkedInAt || null,
        journeyCalledAt: entry?.calledAt || null,
        journeyStartedAt: entry?.startedAt || null,
        journeyFinishedAt: entry?.finishedAt || null,
        journeyUpdatedAt: entry?.updatedAt || null,
      };
    });
  });

export const confirmArrival = (user, appointmentId) =>
  withDb((db) => {
    const index = db.appointments.findIndex((item) => item.id === appointmentId);
    if (index < 0) {
      throw new Error('Agendamento não encontrado');
    }

    const appointment = db.appointments[index];
    if (![STATUS.AGENDADO, STATUS.CONFIRMADO, STATUS.EM_CONFIRMACAO, STATUS.ATRASADO].includes(appointment.status)) {
      throw new Error('Não é possível confirmar chegada para este status.');
    }

    const now = new Date().toISOString();
    const next = {
      ...appointment,
      status: STATUS.CHEGOU,
      checkInAt: appointment.checkInAt || now,
      checkInPreviousStatus: appointment.status,
      updatedAt: now,
    };

    db.appointments[index] = next;
    upsertJourneyEntryForAppointment(db, next, {
      stage: JOURNEY_STAGE.SALA_ESPERA,
      checkedInAt: next.checkInAt,
    });
    return db.appointments[index];
  });

export const sendToWaitingRoom = (user, appointmentId) =>
  withDb((db) => {
    const index = db.appointments.findIndex((item) => item.id === appointmentId);
    if (index < 0) {
      throw new Error('Agendamento não encontrado');
    }

    const appointment = db.appointments[index];
    if (![STATUS.CHEGOU, STATUS.EM_ESPERA].includes(appointment.status)) {
      throw new Error('Paciente precisa estar com chegada confirmada para ir à sala de espera.');
    }

    const now = new Date().toISOString();
    const next = {
      ...appointment,
      checkInAt: appointment.checkInAt || now,
      updatedAt: now,
    };

    db.appointments[index] = next;
    upsertJourneyEntryForAppointment(db, next, {
      stage: JOURNEY_STAGE.SALA_ESPERA,
      checkedInAt: next.checkInAt,
    });
    return db.appointments[index];
  });

export const sendToConsultingRoom = (user, appointmentId, consultorioId, options = {}) =>
  withDb((db) => {
    const index = db.appointments.findIndex((item) => item.id === appointmentId);
    if (index < 0) {
      throw new Error('Agendamento não encontrado');
    }

    const appointment = db.appointments[index];
    const canAdvance = [STATUS.CHEGOU, STATUS.EM_ESPERA].includes(appointment.status);
    if (!canAdvance && !options.force) {
      throw new Error('Paciente precisa estar na sala de espera antes de ir ao consultório.');
    }

    const now = new Date().toISOString();
    const next = {
      ...appointment,
      status: STATUS.EM_ATENDIMENTO,
      checkInAt: appointment.checkInAt || now,
      calledAt: appointment.calledAt || now,
      startedAt: appointment.startedAt || now,
      consultorioId: consultorioId || appointment.consultorioId || appointment.roomId || null,
      updatedAt: now,
    };

    db.appointments[index] = next;
    upsertJourneyEntryForAppointment(db, next, {
      stage: JOURNEY_STAGE.CONSULTORIO,
      checkedInAt: next.checkInAt,
      calledAt: next.calledAt,
      startedAt: next.startedAt,
    });
    return db.appointments[index];
  });

export const finishAppointment = (user, appointmentId) =>
  withDb((db) => {
    const index = db.appointments.findIndex((item) => item.id === appointmentId);
    if (index < 0) {
      throw new Error('Agendamento não encontrado');
    }

    const appointment = db.appointments[index];
    if (appointment.status !== STATUS.EM_ATENDIMENTO) {
      throw new Error('Paciente deve estar em atendimento para finalizar.');
    }

    const now = new Date().toISOString();
    const next = {
      ...appointment,
      status: STATUS.FINALIZADO,
      finishedAt: now,
      updatedAt: now,
    };

    db.appointments[index] = next;
    upsertJourneyEntryForAppointment(db, next, {
      stage: JOURNEY_STAGE.FINALIZADO,
      finishedAt: next.finishedAt,
    });
    return db.appointments[index];
  });

export const cancelAppointment = (user, appointmentId, reason = '', reschedule = false) =>
  withDb((db) => {
    const index = db.appointments.findIndex((item) => item.id === appointmentId);
    if (index < 0) {
      throw new Error('Agendamento não encontrado');
    }

    const appointment = db.appointments[index];
    const now = new Date().toISOString();
    const next = {
      ...appointment,
      status: STATUS.CANCELADO,
      cancelReason: reason || appointment.cancelReason || null,
      canceledAt: now,
      canceledBy: user?.id || appointment.canceledBy || null,
      updatedAt: now,
    };

    db.appointments[index] = next;
    upsertJourneyEntryForAppointment(db, next, {
      stage: JOURNEY_STAGE.CANCELADOS,
    });
    return { appointment: db.appointments[index], reschedule };
  });

export const markNoShow = (user, appointmentId) =>
  withDb((db) => {
    const index = db.appointments.findIndex((item) => item.id === appointmentId);
    if (index < 0) {
      throw new Error('Agendamento não encontrado');
    }

    const appointment = db.appointments[index];
    const now = new Date().toISOString();
    const next = {
      ...appointment,
      status: STATUS.FALTOU,
      updatedAt: now,
    };

    db.appointments[index] = next;
    upsertJourneyEntryForAppointment(db, next, {
      stage: JOURNEY_STAGE.FALTAS,
    });
    return db.appointments[index];
  });

export const returnToWaitingRoom = (user, appointmentId) =>
  withDb((db) => {
    const index = db.appointments.findIndex((item) => item.id === appointmentId);
    if (index < 0) {
      throw new Error('Agendamento não encontrado');
    }

    const appointment = db.appointments[index];
    if (appointment.status !== STATUS.EM_ATENDIMENTO) {
      throw new Error('Apenas agendamentos em atendimento podem voltar para espera.');
    }

    const now = new Date().toISOString();
    const next = {
      ...appointment,
      status: STATUS.EM_ESPERA,
      calledAt: null,
      startedAt: null,
      finishedAt: null,
      updatedAt: now,
    };

    db.appointments[index] = next;
    upsertJourneyEntryForAppointment(db, next, {
      stage: JOURNEY_STAGE.SALA_ESPERA,
    });
    return db.appointments[index];
  });

export const listAppointmentsWithJourneyByDate = (date) => {
  const db = loadDb();
  const { appointments, entriesByAppointmentId } = ensureJourneyEntriesForDate(db, date);
  return appointments.map((appointment) => {
    const entry = entriesByAppointmentId.get(appointment.id);
    const enriched = enrichAppointment(db, appointment);
    return {
      ...enriched,
      journeyStage: entry?.stage || getJourneyStageFromStatus(appointment.status),
      journeyEntryId: entry?.id || null,
    };
  });
};
