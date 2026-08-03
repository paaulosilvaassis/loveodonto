import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import {
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalRoot,
  ModalTitle,
} from '../ui/Modal.jsx';

const CANCEL_REASONS = [
  'Paciente solicitou',
  'Clínica solicitou',
  'Não compareceu',
  'Reagendamento necessário',
  'Outro motivo',
];

export default function CancelOrRescheduleModal({ open, onClose, appointment, onCancel, onReschedule, user }) {
  const navigate = useNavigate();
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [rescheduleNow, setRescheduleNow] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCancel = async () => {
    if (!reason) {
      alert('Selecione um motivo');
      return;
    }

    const finalReason = reason === 'Outro motivo' ? customReason : reason;
    if (!finalReason.trim()) {
      alert('Informe o motivo');
      return;
    }

    setLoading(true);
    try {
      await onCancel({
        appointmentId: appointment.id,
        reason: finalReason,
        rescheduleNow: false,
      });

      if (rescheduleNow) {
        navigate(`/gestao/agenda?patientId=${appointment.patientId}&reschedule=true`);
      }

      onClose();
    } catch (error) {
      alert(error.message || 'Erro ao cancelar agendamento');
    } finally {
      setLoading(false);
    }
  };

  const handleReschedule = () => {
    navigate(`/gestao/agenda?patientId=${appointment.patientId}&reschedule=true&appointmentId=${appointment.id}`);
    onClose();
  };

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>Desmarcar Agendamento</ModalTitle>
        </ModalHeader>

        <ModalBody>
          {appointment?.patient && (
            <div className="cancel-modal-patient-info">
              <strong>Paciente:</strong> {appointment.patient.full_name || appointment.patient.nickname}
              <br />
              <strong>Data/Hora:</strong> {appointment.date} às {appointment.startTime}
            </div>
          )}

          <div className="form-field">
            <label>Motivo do cancelamento</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Selecione...</option>
              {CANCEL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {reason === 'Outro motivo' && (
            <div className="form-field">
              <label>Descreva o motivo</label>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                rows={3}
                placeholder="Descreva o motivo do cancelamento..."
              />
            </div>
          )}

          <div className="form-field">
            <label>
              <input
                type="checkbox"
                checked={rescheduleNow}
                onChange={(e) => setRescheduleNow(e.target.checked)}
              />
              Reagendar agora
            </label>
            <small>Se marcado, você será redirecionado para a Agenda para escolher nova data/hora</small>
          </div>
        </ModalBody>

        <ModalFooter>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          {rescheduleNow ? (
            <button
              type="button"
              className="button primary"
              onClick={handleReschedule}
            >
              <Calendar size={16} />
              Reagendar na Agenda
            </button>
          ) : (
            <button
              type="button"
              className="button primary"
              onClick={handleCancel}
              disabled={loading || !reason || (reason === 'Outro motivo' && !customReason.trim())}
            >
              {loading ? 'Processando...' : 'Confirmar Cancelamento'}
            </button>
          )}
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
