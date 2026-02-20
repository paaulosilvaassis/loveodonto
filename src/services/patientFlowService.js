import { withDb } from '../db/index.js';
import { createId } from './helpers.js';
import { APPOINTMENT_STATUS } from './appointmentService.js';
import { logAction } from './logService.js';
import {
  ensureJourneyEntriesForDate,
  enrichAppointment,
  getJourneyStageFromStatus,
  upsertJourneyEntryForAppointment,
} from './journeyEntryService.js';

/**
 * Busca agendamentos por data
 */
export const fetchAppointmentsByDate = (date) => {
  return withDb((db) => {
    const { appointments, entriesByAppointmentId } = ensureJourneyEntriesForDate(db, date);
    return appointments.map((apt) => {
      const entry = entriesByAppointmentId.get(apt.id);
      const enriched = enrichAppointment(db, apt);
      return {
        ...enriched,
        journeyStage: entry?.stage || getJourneyStageFromStatus(apt.status),
        journeyEntryId: entry?.id || null,
      };
    });
  });
};

/**
 * Atualiza status do agendamento
 */
export const updateAppointmentStatus = (user, appointmentId, newStatus, metadata = {}) => {
  return withDb((db) => {
    const index = db.appointments.findIndex((item) => item.id === appointmentId);
    if (index < 0) {
      throw new Error('Agendamento não encontrado');
    }

    const appointment = db.appointments[index];
    const now = new Date().toISOString();
    
    const updates = {
      status: newStatus,
    };

    // Atualizações específicas por status
    if (newStatus === APPOINTMENT_STATUS.CHEGOU) {
      if (!appointment.checkInAt) {
        updates.checkInAt = now;
        updates.checkInPreviousStatus = appointment.status;
      }
    }

    if (newStatus === APPOINTMENT_STATUS.EM_ESPERA) {
      if (!appointment.checkInAt) {
        updates.checkInAt = now;
        updates.checkInPreviousStatus = appointment.status;
      }
    }

    if (newStatus === APPOINTMENT_STATUS.EM_ATENDIMENTO) {
      updates.calledAt = appointment.calledAt || now;
      updates.startedAt = appointment.startedAt || now;
    }

    if (newStatus === APPOINTMENT_STATUS.FINALIZADO) {
      updates.finishedAt = appointment.finishedAt || now;
    }

    if (newStatus === APPOINTMENT_STATUS.CONFIRMADO) {
      // Manter checkInAt se já existir
    }

    if (newStatus === APPOINTMENT_STATUS.CANCELADO || newStatus === APPOINTMENT_STATUS.REAGENDAR) {
      updates.cancelReason = metadata.reason || null;
      updates.canceledAt = now;
      updates.canceledBy = user.id;
    }

    db.appointments[index] = {
      ...appointment,
      ...updates,
    };

    upsertJourneyEntryForAppointment(db, db.appointments[index]);

    logAction('flow:status_update', { 
      appointmentId, 
      oldStatus: appointment.status, 
      newStatus, 
      userId: user.id 
    });

    return db.appointments[index];
  });
};

/**
 * Registra mensagem WhatsApp no CRM
 */
export const logWhatsAppMessage = (user, patientId, appointmentId, templateId, messageContent) => {
  return withDb((db) => {
    if (!db.messageLogs) {
      db.messageLogs = [];
    }

    const log = {
      id: createId('msglog'),
      patientId,
      appointmentId,
      templateId,
      content: messageContent,
      channel: 'whatsapp',
      sentAt: new Date().toISOString(),
      sentBy: user.id,
    };

    db.messageLogs.push(log);
    logAction('communication:whatsapp_sent', { 
      logId: log.id, 
      patientId, 
      appointmentId, 
      userId: user.id 
    });

    return log;
  });
};

/**
 * Cria ou atualiza entrada na Jornada do Paciente
 */
export const upsertJourneyEntry = (user, appointmentId) => {
  return withDb((db) => {
    const appointment = db.appointments.find((a) => a.id === appointmentId);
    if (!appointment) {
      throw new Error('Agendamento não encontrado');
    }
    const entry = upsertJourneyEntryForAppointment(db, appointment);
    logAction('journey:entry_upsert', {
      appointmentId,
      userId: user?.id,
      stage: entry?.stage,
    });
    return entry;
  });
};

/**
 * Agrupa agendamentos por categoria (typeCategory + specialty + procedureSubtype)
 */
export const groupAppointmentsByCategory = (appointments) => {
  const groups = new Map();

  appointments.forEach((apt) => {
    // Extrair informações do procedimento
    const procedureName = apt.procedureName || 'Consulta';
    const typeCategory = apt.typeCategory || 'Consulta';
    const specialty = apt.specialty || apt.professional?.specialty || 'Geral';
    const procedureSubtype = apt.procedureSubtype || '';

    // Criar chave de agrupamento
    let categoryKey = `${typeCategory} - ${specialty}`;
    if (procedureSubtype) {
      categoryKey += ` (${procedureSubtype})`;
    }

    if (!groups.has(categoryKey)) {
      groups.set(categoryKey, {
        key: categoryKey,
        typeCategory,
        specialty,
        procedureSubtype,
        appointments: [],
        total: 0,
        completed: 0,
        present: 0,
      });
    }

    const group = groups.get(categoryKey);
    group.appointments.push(apt);
    group.total += 1;

    // Contar realizados/presentes
    if ([APPOINTMENT_STATUS.FINALIZADO, APPOINTMENT_STATUS.ATENDIDO].includes(apt.status)) {
      group.completed += 1;
    }
    if ([APPOINTMENT_STATUS.EM_ESPERA, APPOINTMENT_STATUS.EM_ATENDIMENTO, APPOINTMENT_STATUS.FINALIZADO, APPOINTMENT_STATUS.ATENDIDO].includes(apt.status)) {
      group.present += 1;
    }
  });

  return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key));
};

export const getAppointmentCategory = (appointment) => {
  const kind = (appointment?.kind || '').toLowerCase();
  const specialty = appointment?.specialty || appointment?.professional?.specialty || 'Clínico';
  const subtype = appointment?.procedureSubtype || '';

  if (kind === 'avaliacao') return 'Avaliação';
  if (kind === 'retorno') return 'Retorno';
  if (kind === 'procedimento') {
    return `Procedimento — ${specialty}${subtype ? ` (${subtype})` : ''}`;
  }

  return `Procedimento — ${specialty}`;
};

export const computeSidebarCounts = (appointments) => {
  const categoryCounts = {};
  const desmarcadosCount = appointments.filter((apt) =>
    ['cancelado', 'desmarcou'].includes(apt.status)
  ).length;
  const pendenciasCount = appointments.filter((apt) => apt.pendingTitlesCount || apt.alertSummary).length;

  appointments.forEach((apt) => {
    const label = getAppointmentCategory(apt);
    categoryCounts[label] = (categoryCounts[label] || 0) + 1;
  });

  const orderedCategoryLabels = [
    'Avaliação',
    'Retorno',
    ...Object.keys(categoryCounts)
      .filter((label) => !['Avaliação', 'Retorno'].includes(label))
      .sort((a, b) => a.localeCompare(b)),
  ];

  return {
    total: appointments.length,
    categories: orderedCategoryLabels.map((label) => ({
      label,
      count: categoryCounts[label] || 0,
    })),
    exceptions: [
      { label: 'Desmarcados', count: desmarcadosCount, key: 'desmarcados' },
      { label: 'Pendências', count: pendenciasCount, key: 'pendencias' },
    ],
  };
};
