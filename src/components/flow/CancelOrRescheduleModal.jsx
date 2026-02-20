import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Calendar } from 'lucide-react';
import { APPOINTMENT_STATUS } from '../../services/appointmentService.js';

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
        // Navegar para agenda com filtros
        navigate(`/gestao/agenda?patientId=${appointment.patientId}&reschedule=true`);
      }

      onClose();
    } catch (error) {
      console.error('Erro ao cancelar:', error);
      alert(error.message || 'Erro ao cancelar agendamento');
    } finally {
      setLoading(false);
    }
  };

  const handleReschedule = () => {
    navigate(`/gestao/agenda?patientId=${appointment.patientId}&reschedule=true&appointmentId=${appointment.id}`);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Desmarcar Agendamento</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {appointment.patient && (
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
        </div>

        <div className="modal-footer">
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
        </div>
      </div>
    </div>
  );
}
