import { loadDb, withDb } from '../db/index.js';
import { getClinicSummary } from './clinicService.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId, assertRequired, normalizeText } from './helpers.js';
import { logAction } from './logService.js';

export const listTemplates = () => loadDb().messageTemplates;
export const listQueue = () => loadDb().messageQueue;
export const listLogs = () => loadDb().messageLogs;

const applyTemplateVariables = (template, { patient, appointment, clinic }) => {
  const replacements = {
    '{{nome}}': patient?.name || '',
    '{{data}}': appointment?.date || '',
    '{{hora}}': appointment?.startTime || '',
    '{{profissional}}': appointment?.professionalId || '',
    '{{clinica}}': clinic?.nomeClinica || '',
    '{{telefone}}': clinic?.telefonePrincipal || '',
  };
  return Object.entries(replacements).reduce(
    (content, [key, value]) => content.split(key).join(value),
    template
  );
};

export const createTemplate = (user, payload) => {
  requirePermission(user, 'communication:write');
  const template = {
    id: createId('tmpl'),
    name: normalizeText(payload.name),
    channel: normalizeText(payload.channel || 'whatsapp'),
    content: normalizeText(payload.content),
  };
  assertRequired(template.name, 'Nome do template é obrigatório.');
  assertRequired(template.content, 'Conteúdo é obrigatório.');

  withDb((db) => {
    db.messageTemplates.push(template);
    return db;
  });
  logAction('communication:template:create', { templateId: template.id, userId: user.id });
  return template;
};

export const queueMessage = (user, payload) => {
  requirePermission(user, 'communication:write');
  const message = {
    id: createId('msg'),
    patientId: normalizeText(payload.patientId),
    appointmentId: normalizeText(payload.appointmentId),
    templateId: normalizeText(payload.templateId),
    status: 'pendente',
    channel: normalizeText(payload.channel || 'whatsapp'),
    scheduledAt: normalizeText(payload.scheduledAt) || new Date().toISOString(),
    sentAt: null,
  };
  assertRequired(message.patientId, 'Paciente é obrigatório.');
  assertRequired(message.templateId, 'Template é obrigatório.');

  withDb((db) => {
    db.messageQueue.push(message);
    return db;
  });
  logAction('communication:queue', { messageId: message.id, userId: user.id });
  return message;
};

export const sendQueuedMessage = (user, messageId, payload = {}) => {
  requirePermission(user, 'communication:write');
  const result = withDb((db) => {
    const index = db.messageQueue.findIndex((item) => item.id === messageId);
    if (index < 0) {
      throw new Error('Mensagem não encontrada.');
    }
    const message = db.messageQueue[index];
    const template = db.messageTemplates.find((item) => item.id === message.templateId);
    const patient = db.patients.find((item) => item.id === message.patientId);
    const appointment = db.appointments.find((item) => item.id === message.appointmentId);
    const clinic = getClinicSummary();
    const renderedContent = template
      ? applyTemplateVariables(template.content, { patient, appointment, clinic })
      : '';
    const logEntry = {
      id: createId('msglog'),
      patientId: message.patientId,
      appointmentId: message.appointmentId,
      templateId: message.templateId,
      status: payload.status || 'enviado',
      channel: message.channel,
      sentAt: new Date().toISOString(),
      payload: { ...(payload.payload || {}), renderedContent },
    };
    message.status = logEntry.status;
    message.sentAt = logEntry.sentAt;
    db.messageLogs.unshift(logEntry);
    return message;
  });
  logAction('communication:send', { messageId, userId: user.id });
  return result;
};

export const generateAppointmentReminders = () => {
  const db = loadDb();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetDate = tomorrow.toISOString().slice(0, 10);

  let template = db.messageTemplates.find((item) => item.name === 'Lembrete consulta');
  if (!template) {
    template = {
      id: createId('tmpl'),
      name: 'Lembrete consulta',
      channel: 'whatsapp',
      content: 'Olá {{nome}}, sua consulta é {{data}} às {{hora}} com {{profissional}}.',
    };
    db.messageTemplates.push(template);
  }

  const reminders = db.appointments
    .filter((appt) => appt.date === targetDate && appt.status === 'agendado')
    .map((appt) => ({
      id: createId('msg'),
      patientId: appt.patientId,
      appointmentId: appt.id,
      templateId: template.id,
      status: 'pendente',
      channel: template.channel,
      scheduledAt: new Date().toISOString(),
      sentAt: null,
    }));

  withDb((state) => {
    state.messageQueue.push(...reminders);
    return state;
  });

  logAction('communication:reminders', { total: reminders.length });
  return reminders;
};
