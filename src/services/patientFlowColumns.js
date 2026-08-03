/**
 * Colunas operacionais do Fluxo do Paciente (Kanban).
 */

import { APPOINTMENT_STATUS } from './appointmentService.js';

export const FLOW_COLUMN = {
  AGENDADOS: 'agendados',
  RECEPCAO: 'recepcao',
  SALA_ESPERA: 'sala_espera',
  CONSULTORIO: 'consultorio',
  AVALIACAO_COMERCIAL: 'avaliacao_comercial',
  FINANCEIRO: 'financeiro',
  FINALIZADO: 'finalizado',
  FALTA_CANCELADO: 'falta_cancelado',
};

export const FLOW_COLUMN_META = [
  { id: FLOW_COLUMN.AGENDADOS, label: 'Agendados', emoji: '🟣', tone: 'purple' },
  { id: FLOW_COLUMN.RECEPCAO, label: 'Recepção', emoji: '🔵', tone: 'info' },
  { id: FLOW_COLUMN.SALA_ESPERA, label: 'Sala de Espera', emoji: '🟡', tone: 'warning' },
  { id: FLOW_COLUMN.CONSULTORIO, label: 'Consultório', emoji: '🟠', tone: 'orange' },
  { id: FLOW_COLUMN.AVALIACAO_COMERCIAL, label: 'Avaliação Comercial', emoji: '🟢', tone: 'accent' },
  { id: FLOW_COLUMN.FINANCEIRO, label: 'Financeiro', emoji: '🟢', tone: 'success' },
  { id: FLOW_COLUMN.FINALIZADO, label: 'Finalizado', emoji: '✅', tone: 'done' },
  { id: FLOW_COLUMN.FALTA_CANCELADO, label: 'Falta / Cancelado', emoji: '🔴', tone: 'danger' },
];

const VALID_COLUMNS = new Set(Object.values(FLOW_COLUMN));

export function getFlowColumn(appointment, entry) {
  if (entry?.flowColumn && VALID_COLUMNS.has(entry.flowColumn)) {
    return entry.flowColumn;
  }
  const s = appointment?.status || '';
  if (['cancelado', 'reagendar', 'desmarcou'].includes(s)) return FLOW_COLUMN.FALTA_CANCELADO;
  if (s === 'faltou') return FLOW_COLUMN.FALTA_CANCELADO;
  if (['finalizado', 'atendido'].includes(s)) return FLOW_COLUMN.FINALIZADO;
  if (s === 'em_atendimento' || s === 'chamado') {
    const proc = (appointment.procedureName || '').toLowerCase();
    if (proc.includes('financeiro') || proc.includes('pagamento')) return FLOW_COLUMN.FINANCEIRO;
    if (proc.includes('orçamento') || proc.includes('orcamento') || proc.includes('avalia')) {
      return FLOW_COLUMN.AVALIACAO_COMERCIAL;
    }
    return FLOW_COLUMN.CONSULTORIO;
  }
  if (s === 'em_espera') return FLOW_COLUMN.SALA_ESPERA;
  if (s === 'chegou') return FLOW_COLUMN.RECEPCAO;
  return FLOW_COLUMN.AGENDADOS;
}

export function getStatusForFlowColumn(column) {
  switch (column) {
    case FLOW_COLUMN.RECEPCAO:
      return APPOINTMENT_STATUS.CHEGOU;
    case FLOW_COLUMN.SALA_ESPERA:
      return APPOINTMENT_STATUS.EM_ESPERA;
    case FLOW_COLUMN.CONSULTORIO:
    case FLOW_COLUMN.AVALIACAO_COMERCIAL:
    case FLOW_COLUMN.FINANCEIRO:
      return APPOINTMENT_STATUS.EM_ATENDIMENTO;
    case FLOW_COLUMN.FINALIZADO:
      return APPOINTMENT_STATUS.FINALIZADO;
    case FLOW_COLUMN.FALTA_CANCELADO:
      return APPOINTMENT_STATUS.FALTOU;
    default:
      return APPOINTMENT_STATUS.CONFIRMADO;
  }
}

export function getWaitColorClass(waitMinutes) {
  if (waitMinutes <= 10) return 'is-green';
  if (waitMinutes <= 20) return 'is-yellow';
  return 'is-red';
}
