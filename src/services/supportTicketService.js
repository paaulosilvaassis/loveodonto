/**
 * Serviço de chamados de suporte Love Odonto.
 * Persistência via withDb (IndexedDB).
 */
import { withDb, loadDb } from '../db/index.js';
import { createId } from './helpers.js';

export const SUPPORT_CATEGORIES = [
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'tecnico', label: 'Técnico' },
  { value: 'treinamento', label: 'Treinamento' },
  { value: 'outros', label: 'Outros' },
];

export const SUPPORT_STATUS = {
  OPEN: 'open',
  SCHEDULED: 'scheduled',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
};

/**
 * Gera protocolo no formato SUP-YYYYMMDD-XXXX.
 * @returns {string}
 */
export function generateProtocol() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000).toString();
  return `SUP-${datePart}-${random}`;
}

/**
 * Retorna horários disponíveis mockados para os próximos 7 dias.
 * Estrutura preparada para backend futuro.
 * @returns {Array<{ date: string, slots: string[] }>}
 */
export function getAvailableTimeSlots() {
  const slots = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];
  const days = [];
  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    days.push({ date: dateStr, slots });
  }

  return days;
}

/**
 * Cria um novo chamado de suporte.
 * @param {Object} payload
 * @param {string} payload.category
 * @param {string} payload.description
 * @param {string} payload.scheduledAt - ISO datetime (data + hora agendada)
 * @param {string} userId
 * @param {string} [clinicId]
 * @returns {Object} ticket criado
 */
export function createTicket(payload, userId, clinicId = null) {
  if (!userId) throw new Error('Usuário não identificado.');

  const tickets = getTicketsByUser(userId);
  const scheduledAt = payload.scheduledAt;
  const hasDuplicate = tickets.some(
    (t) =>
      t.status !== SUPPORT_STATUS.CLOSED &&
      t.status !== SUPPORT_STATUS.CANCELLED &&
      t.scheduled_at === scheduledAt
  );
  if (hasDuplicate) {
    throw new Error('Você já possui um chamado aberto com este horário.');
  }

  const now = new Date().toISOString();
  const status = scheduledAt ? SUPPORT_STATUS.SCHEDULED : SUPPORT_STATUS.OPEN;

  const ticket = {
    id: createId('st'),
    created_at: now,
    created_by_user_id: userId,
    clinic_id: clinicId || null,
    category: payload.category || 'outros',
    description: (payload.description || '').trim(),
    scheduled_at: payload.scheduledAt || null,
    status,
    protocol: generateProtocol(),
    priority: payload.priority || 'normal',
    attachments: payload.attachments || null,
    rating: null,
    feedback: null,
    closed_at: null,
    cancelled_at: null,
  };

  withDb((db) => {
    db.supportTickets = db.supportTickets || [];
    db.supportTickets.push(ticket);
    return db;
  });

  return ticket;
}

/**
 * Lista chamados do usuário.
 * @param {string} userId
 * @returns {Array}
 */
export function getTicketsByUser(userId) {
  const db = loadDb();
  const list = db.supportTickets || [];
  return list.filter((t) => t.created_by_user_id === userId);
}

/**
 * Cancela um chamado.
 * @param {string} ticketId
 * @param {string} userId
 */
export function cancelTicket(ticketId, userId) {
  const now = new Date().toISOString();
  withDb((db) => {
    const t = (db.supportTickets || []).find(
      (x) => x.id === ticketId && x.created_by_user_id === userId
    );
    if (!t) throw new Error('Chamado não encontrado.');
    if (t.status === SUPPORT_STATUS.CLOSED || t.status === SUPPORT_STATUS.CANCELLED) {
      throw new Error('Este chamado já foi finalizado ou cancelado.');
    }
    t.status = SUPPORT_STATUS.CANCELLED;
    t.cancelled_at = now;
    return db;
  });
}

/**
 * Avalia um chamado fechado.
 * @param {string} ticketId
 * @param {number} rating 1-5
 * @param {string} [feedback]
 * @param {string} userId
 */
export function rateTicket(ticketId, rating, feedback, userId) {
  const r = Math.min(5, Math.max(1, Number(rating) || 0));
  if (r < 1 || r > 5) throw new Error('Avaliação deve ser entre 1 e 5.');

  withDb((db) => {
    const t = (db.supportTickets || []).find(
      (x) => x.id === ticketId && x.created_by_user_id === userId
    );
    if (!t) throw new Error('Chamado não encontrado.');
    if (t.status !== SUPPORT_STATUS.CLOSED) {
      throw new Error('Somente chamados concluídos podem ser avaliados.');
    }
    t.rating = r;
    t.feedback = (feedback || '').trim() || null;
    return db;
  });
}

/**
 * Atualiza status de um chamado (para simular fechamento no MVP).
 * @param {string} ticketId
 * @param {string} newStatus
 * @param {string} userId
 */
export function updateTicketStatus(ticketId, newStatus, userId) {
  const now = new Date().toISOString();
  withDb((db) => {
    const t = (db.supportTickets || []).find(
      (x) => x.id === ticketId && x.created_by_user_id === userId
    );
    if (!t) throw new Error('Chamado não encontrado.');
    t.status = newStatus;
    if (newStatus === SUPPORT_STATUS.CLOSED) t.closed_at = now;
    return db;
  });
}
