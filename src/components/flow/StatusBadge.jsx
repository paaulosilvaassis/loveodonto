import { APPOINTMENT_STATUS } from '../../services/appointmentService.js';
import { AGENDA_CONFIG } from '../../utils/agendaConfig.js';

// Mapeamento de cores por status (pill preenchida)
const STATUS_COLORS = {
  [APPOINTMENT_STATUS.AGENDADO]: {
    bg: '#e2e8f0',
    text: '#334155',
  },
  [APPOINTMENT_STATUS.EM_CONFIRMACAO]: {
    bg: '#fef3c7',
    text: '#d97706',
  },
  [APPOINTMENT_STATUS.CONFIRMADO]: {
    bg: '#a7f3d0',
    text: '#047857',
  },
  [APPOINTMENT_STATUS.CHEGOU]: {
    bg: '#dbeafe',
    text: '#1e40af',
  },
  [APPOINTMENT_STATUS.EM_ESPERA]: {
    bg: '#fef3c7',
    text: '#d97706',
  },
  [APPOINTMENT_STATUS.EM_ATENDIMENTO]: {
    bg: '#e9d5ff',
    text: '#7c3aed',
  },
  [APPOINTMENT_STATUS.FINALIZADO]: {
    bg: '#d1fae5',
    text: '#065f46',
  },
  [APPOINTMENT_STATUS.ATENDIDO]: {
    bg: '#d1fae5',
    text: '#065f46',
  },
  [APPOINTMENT_STATUS.ATRASADO]: {
    bg: '#fed7aa',
    text: '#ea580c',
  },
  [APPOINTMENT_STATUS.FALTOU]: {
    bg: '#fecaca',
    text: '#dc2626',
  },
  [APPOINTMENT_STATUS.CANCELADO]: {
    bg: '#fce7f3',
    text: '#be185d',
  },
  [APPOINTMENT_STATUS.DESMARCOU]: {
    bg: '#fce7f3',
    text: '#be185d',
  },
  [APPOINTMENT_STATUS.REAGENDAR]: {
    bg: '#fef3c7',
    text: '#d97706',
  },
};

export default function StatusBadge({ status, size = 'md' }) {
  const config = AGENDA_CONFIG.status[status] || AGENDA_CONFIG.status.agendado;
  const colors = STATUS_COLORS[status] || STATUS_COLORS[APPOINTMENT_STATUS.AGENDADO];
  
  return (
    <span
      className="status-badge-pill"
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
      }}
    >
      {config.label}
    </span>
  );
}
