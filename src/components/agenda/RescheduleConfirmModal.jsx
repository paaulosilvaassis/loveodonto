import {
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalRoot,
  ModalTitle,
} from '../ui/Modal.jsx';

export const RescheduleConfirmModal = ({ open, onClose, onConfirm, appointment, newDate, newStartTime, newEndTime }) => {
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(`${dateStr}T00:00:00`);
    return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  };

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>Confirmar Reagendamento</ModalTitle>
        </ModalHeader>

        <ModalBody>
          <p>
            Reagendar agendamento para <strong>{formatDate(newDate)}</strong> às <strong>{newStartTime}</strong>?
          </p>
          <div className="reschedule-info">
            <div className="reschedule-info-row">
              <span className="reschedule-label">Data atual:</span>
              <span className="reschedule-value">{formatDate(appointment?.date)}</span>
            </div>
            <div className="reschedule-info-row">
              <span className="reschedule-label">Horário atual:</span>
              <span className="reschedule-value">
                {appointment?.startTime} – {appointment?.endTime}
              </span>
            </div>
            <div className="reschedule-info-row">
              <span className="reschedule-label">Nova data:</span>
              <span className="reschedule-value reschedule-value--new">{formatDate(newDate)}</span>
            </div>
            <div className="reschedule-info-row">
              <span className="reschedule-label">Novo horário:</span>
              <span className="reschedule-value reschedule-value--new">
                {newStartTime} – {newEndTime}
              </span>
            </div>
          </div>
        </ModalBody>

        <ModalFooter>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="button button-primary" onClick={onConfirm}>
            Confirmar Reagendamento
          </button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
};
