import { APPOINTMENT_STATUS } from '../../services/appointmentService.js';
import { AGENDA_CONFIG } from '../../utils/agendaConfig.js';

const STATUS_COLORS = {
  [APPOINTMENT_STATUS.AGENDADO]: '#94a3b8',
  [APPOINTMENT_STATUS.EM_CONFIRMACAO]: '#f59e0b',
  [APPOINTMENT_STATUS.CONFIRMADO]: '#10b981',
  [APPOINTMENT_STATUS.CHEGOU]: '#3b82f6',
  [APPOINTMENT_STATUS.EM_ESPERA]: '#fbbf24',
  [APPOINTMENT_STATUS.EM_ATENDIMENTO]: '#8b5cf6',
  [APPOINTMENT_STATUS.FINALIZADO]: '#065f46',
  [APPOINTMENT_STATUS.ATENDIDO]: '#065f46',
  [APPOINTMENT_STATUS.ATRASADO]: '#f97316',
  [APPOINTMENT_STATUS.FALTOU]: '#ef4444',
  [APPOINTMENT_STATUS.CANCELADO]: '#f472b6',
  [APPOINTMENT_STATUS.DESMARCOU]: '#f472b6',
  [APPOINTMENT_STATUS.REAGENDAR]: '#f59e0b',
};

export default function StatusStrip({ status }) {
  const label = AGENDA_CONFIG.status[status]?.label || status;
  const color = STATUS_COLORS[status] || STATUS_COLORS[APPOINTMENT_STATUS.AGENDADO];

  return (
    <div className="flow-row-status-strip" style={{ background: color }}>
      <span className="flow-row-status-label">{label}</span>
    </div>
  );
}
