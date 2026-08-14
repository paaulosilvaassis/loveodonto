import { useEffect, useState } from 'react';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '../../ui/Modal.jsx';
import {
  APPOINTMENT_CLOSE_REASON,
  APPOINTMENT_CLOSE_REASON_LABELS,
} from '../../../services/clinicalAppointmentCloseService.js';

const REASON_OPTIONS = [
  APPOINTMENT_CLOSE_REASON.BUDGET_APPROVED,
  APPOINTMENT_CLOSE_REASON.ANALYZE_LATER,
  APPOINTMENT_CLOSE_REASON.TREATMENT_REFUSED,
  APPOINTMENT_CLOSE_REASON.RETURN_OTHER_DATE,
  APPOINTMENT_CLOSE_REASON.OTHER,
];

export function FinishAppointmentModal({
  open,
  onClose,
  onConfirm,
  confirming = false,
  defaultReason = APPOINTMENT_CLOSE_REASON.ANALYZE_LATER,
  disabledReasons = [],
  description,
}) {
  const [reason, setReason] = useState(defaultReason);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    const disabled = new Set(disabledReasons);
    const next = disabled.has(defaultReason)
      ? REASON_OPTIONS.find((option) => !disabled.has(option)) || defaultReason
      : defaultReason;
    setReason(next);
    setNotes('');
  }, [open, defaultReason, disabledReasons]);

  const handleSubmit = (event) => {
    event.preventDefault();
    onConfirm({ reason, notes: notes.trim() });
  };

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next && !confirming) onClose(); }}>
      <ModalContent size="md" onInteractOutside={(e) => e.preventDefault()}>
        <form id="finish-appointment-form" onSubmit={handleSubmit}>
          <ModalHeader>
            <ModalTitle>Finalizar atendimento</ModalTitle>
            <ModalDescription>
              {description || 'O orçamento continuará pendente. Você poderá retomar a negociação em outro momento pela Central do Paciente.'}
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            <fieldset className="clinical-finish-appointment-reasons">
              <legend className="sr-only">Motivo do encerramento</legend>
              {REASON_OPTIONS.map((option) => (
                <label key={option} className="clinical-finish-appointment-reason">
                  <input
                    type="radio"
                    name="close-reason"
                    value={option}
                    checked={reason === option}
                    onChange={() => setReason(option)}
                    disabled={confirming || disabledReasons.includes(option)}
                  />
                  <span>{APPOINTMENT_CLOSE_REASON_LABELS[option]}</span>
                </label>
              ))}
            </fieldset>
            <div className="clinical-finish-appointment-notes">
              <label htmlFor="finish-appointment-notes">Observação</label>
              <textarea
                id="finish-appointment-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalhes adicionais (opcional)"
                disabled={confirming}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <button type="button" className="button secondary" onClick={onClose} disabled={confirming}>
              Cancelar
            </button>
            <button type="submit" form="finish-appointment-form" className="button primary" disabled={confirming}>
              {confirming ? 'Finalizando…' : 'Finalizar atendimento'}
            </button>
          </ModalFooter>
        </form>
      </ModalContent>
    </ModalRoot>
  );
}
