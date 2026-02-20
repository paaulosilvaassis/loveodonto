import { Clock, Phone, User, MessageSquare, FileText, CheckCircle2, PlayCircle } from 'lucide-react';
import { APPOINTMENT_STATUS } from '../../services/appointmentService.js';
import StatusStrip from './StatusStrip.jsx';
import FlowActionMenu from './FlowActionMenu.jsx';

const formatPhoneDisplay = (phone) => {
  if (!phone) return '';
  const ddd = phone.ddd || '';
  const number = phone.number || '';
  return ddd && number ? `(${ddd}) ${number}` : number || ddd || '';
};

export default function FlowRowItem({
  appointment,
  onCheckIn,
  onSendToConsultingRoom,
  onConfirm,
  onFinish,
  onOpenWhatsApp,
  onOpenChart,
  onReminder,
  onCancel,
  onReschedule,
  onNoShow,
  onViewDetails,
}) {
  const { patient, professional, phone } = appointment;
  const status = appointment.status;

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    return timeStr.slice(0, 5);
  };

  const patientName = patient?.full_name || patient?.nickname || patient?.social_name || 'Paciente';
  const specialty = appointment.specialty || professional?.specialty || 'Geral';
  const typeCategory = appointment.typeCategory || 'Consulta';

  const alertText = appointment.alertSummary
    || (appointment.pendingTitlesCount
      ? `${appointment.pendingTitlesCount} títulos vencidos${appointment.pendingAmount ? ` · R$ ${appointment.pendingAmount}` : ''}`
      : null);

  const primaryAction = (() => {
    if (status === APPOINTMENT_STATUS.AGENDADO || status === APPOINTMENT_STATUS.EM_CONFIRMACAO) {
      return { label: 'Confirmar', icon: CheckCircle2, onClick: () => onConfirm(appointment.id) };
    }
    if (status === APPOINTMENT_STATUS.CONFIRMADO) {
      return { label: 'Chegou', icon: CheckCircle2, onClick: () => onCheckIn(appointment.id) };
    }
    if ([APPOINTMENT_STATUS.CHEGOU, APPOINTMENT_STATUS.EM_ESPERA].includes(status)) {
      return { label: 'Chamar p/ consultório', icon: PlayCircle, onClick: () => onSendToConsultingRoom(appointment.id) };
    }
    if (status === APPOINTMENT_STATUS.EM_ATENDIMENTO) {
      return { label: 'Finalizar', icon: CheckCircle2, onClick: () => onFinish(appointment.id) };
    }
    return null;
  })();

  return (
    <div className="flow-row">
      <StatusStrip status={status} />
      <div className="flow-row-time">
        <div className="flow-row-time-main">
          <Clock size={14} />
          <span>{formatTime(appointment.startTime)}</span>
        </div>
        <div className="flow-row-time-sub">
          <User size={12} />
          <span>{professional?.nomeCompleto || professional?.name || 'Profissional'}</span>
        </div>
      </div>
      <div className="flow-row-patient">
        <div className="flow-row-patient-name">{patientName}</div>
        <div className="flow-row-patient-phone">
          <Phone size={12} />
          <span>{formatPhoneDisplay(phone)}</span>
        </div>
        <div className="flow-row-chips">
          <span className="flow-row-chip">{typeCategory}</span>
          <span className="flow-row-chip">{specialty}</span>
        </div>
      </div>
      <div className="flow-row-alerts">
        {alertText ? <span className="flow-row-alert-text">{alertText}</span> : <span className="flow-row-alert-empty">Sem pendências</span>}
      </div>
      <div className="flow-row-actions">
        {primaryAction ? (
          <button type="button" className="flow-row-cta" onClick={primaryAction.onClick}>
            <primaryAction.icon size={14} />
            <span>{primaryAction.label}</span>
          </button>
        ) : (
          <button type="button" className="flow-row-cta is-disabled" disabled>
            <CheckCircle2 size={14} />
            <span>Finalizado</span>
          </button>
        )}
        <button type="button" className="flow-row-icon-button" onClick={() => onOpenWhatsApp(patient?.id)} title="WhatsApp">
          <MessageSquare size={16} />
        </button>
        <button type="button" className="flow-row-icon-button" onClick={() => onOpenChart(patient?.id)} title="Prontuário">
          <FileText size={16} />
        </button>
        <FlowActionMenu
          onReminder={() => onReminder(appointment)}
          onCancel={() => onCancel(appointment)}
          onReschedule={() => onReschedule(appointment)}
          onNoShow={() => onNoShow(appointment)}
          onViewDetails={() => onViewDetails(appointment)}
        />
      </div>
    </div>
  );
}
