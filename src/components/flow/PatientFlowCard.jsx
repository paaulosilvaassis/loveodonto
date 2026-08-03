const MIME_APPOINTMENT_ID = 'text/plain';
const MIME_FLOW_COLUMN = 'application/x-flow-column';

export { MIME_APPOINTMENT_ID, MIME_FLOW_COLUMN };

/**
 * Card arrastável do Kanban operacional do Fluxo do Paciente.
 */
export default function PatientFlowCard({ card, columnId, onOpenPatient }) {
  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(MIME_APPOINTMENT_ID, card.appointmentId);
    e.dataTransfer.setData(MIME_FLOW_COLUMN, columnId);
  };

  const waitClass = card.waitTone !== 'neutral' ? `pf-flow-card--wait-${card.waitTone}` : '';

  return (
    <div
      className={`pf-flow-card ${waitClass}`.trim()}
      data-appointment-id={card.appointmentId}
      draggable
      onDragStart={handleDragStart}
    >
      <button
        type="button"
        className="pf-flow-card-main"
        onClick={() => onOpenPatient?.(card)}
        aria-label={`Abrir ${card.patientName}`}
      >
        <div className="pf-flow-card-top">
          <strong className="pf-flow-card-name">{card.patientName}</strong>
          <span className="pf-flow-card-time">{card.startTime}</span>
        </div>
        <p className="pf-flow-card-proc">{card.procedureName}</p>
        <p className="pf-flow-card-prof">{card.professionalName}</p>
        {card.waitLabel && (
          <p className={`pf-flow-card-wait pf-flow-card-wait--${card.waitTone}`}>
            {card.waitLabel}
          </p>
        )}
        {card.serviceMinutes > 0 && (
          <p className="pf-flow-card-service">{card.serviceMinutes} min em atendimento</p>
        )}
        <div className="pf-flow-card-status">
          <span className="pf-flow-card-status-label">Status:</span>
          <span>{card.statusLabel}</span>
        </div>
      </button>
    </div>
  );
}
