import { useState, useEffect } from 'react';
import { getProfessionalOptions } from '../../services/collaboratorService.js';
import { loadDb } from '../../db/index.js';
import { getAvailableSlots, createAppointment } from '../../services/appointmentService.js';

const DURATIONS = [15, 30, 45, 60];
const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Modal para agendar consulta por paciente (sem lead). Usado pelo Follow-up quando tipo é retorno/clínico e há patientId.
 * Ao confirmar, chama createAppointment e onSuccess (para marcar follow-up como resolvido).
 */
export function ScheduleFromPatientModal({ open, onClose, patientId, patientName, user, onSuccess }) {
  const [professionalId, setProfessionalId] = useState('');
  const [date, setDate] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [procedureName, setProcedureName] = useState('');
  const [notes, setNotes] = useState('');
  const [professionals, setProfessionals] = useState([]);
  const [roomId, setRoomId] = useState('');
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setProfessionals(getProfessionalOptions());
    const db = loadDb();
    setRoomId(db.rooms?.[0]?.id || '');
    setProfessionalId('');
    setDate('');
    setDurationMinutes(30);
    setProcedureName('');
    setNotes('');
    setSlots([]);
    setSelectedSlot(null);
    setError('');
  }, [open]);

  const handleSearchSlots = () => {
    if (!professionalId || !date) {
      setError('Selecione o profissional e a data.');
      return;
    }
    if (date < todayIso()) {
      setError('Selecione uma data futura.');
      return;
    }
    setError('');
    setLoadingSlots(true);
    setSlots([]);
    setSelectedSlot(null);
    try {
      const list = getAvailableSlots({
        date,
        professionalId,
        durationMinutes,
        roomId: roomId || undefined,
        allowDoubleBooking: false,
      });
      setSlots(list);
      if (list.length === 0) setError('Nenhum horário disponível para esta data.');
    } catch (e) {
      setError(e?.message || 'Erro ao buscar horários.');
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleConfirm = () => {
    if (!selectedSlot || !patientId || !user) return;
    setError('');
    setSubmitting(true);
    try {
      createAppointment(user, {
        patientId,
        professionalId,
        roomId: roomId || undefined,
        date,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        procedureName: procedureName || undefined,
        notes: notes || undefined,
        isReturn: true,
      });
      onSuccess?.();
      onClose();
      if (typeof document !== 'undefined') {
        const toast = document.createElement('div');
        toast.setAttribute('role', 'status');
        toast.className = 'toast success';
        toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2000;padding:12px 16px;border-radius:8px;background:#10b981;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
        toast.textContent = 'Agendado com sucesso.';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      }
    } catch (e) {
      setError(e?.message || 'Falha ao confirmar agendamento. Tente outro horário.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="appointment-step2-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-from-patient-title"
      onClick={onClose}
    >
      <div className="appointment-step2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="appointment-step2-header">
          <div>
            <strong id="schedule-from-patient-title">Agendar na Agenda</strong>
            {patientName && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>
                Paciente: {patientName}
              </p>
            )}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        <div style={{ padding: '1rem', overflowY: 'auto' }}>
          <div className="form-field" style={{ marginBottom: '1rem' }}>
            <label htmlFor="schedule-patient-professional">Profissional *</label>
            <select
              id="schedule-patient-professional"
              value={professionalId}
              onChange={(e) => setProfessionalId(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
            >
              <option value="">Selecione</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-field">
              <label htmlFor="schedule-patient-date">Data *</label>
              <input
                id="schedule-patient-date"
                type="date"
                value={date}
                min={todayIso()}
                onChange={(e) => setDate(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
              />
            </div>
            <div className="form-field">
              <label htmlFor="schedule-patient-duration">Duração (min)</label>
              <select
                id="schedule-patient-duration"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} min
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-field" style={{ marginBottom: '1rem' }}>
            <label htmlFor="schedule-patient-procedure">Procedimento / Tipo</label>
            <input
              id="schedule-patient-procedure"
              type="text"
              value={procedureName}
              onChange={(e) => setProcedureName(e.target.value)}
              placeholder="Ex.: Retorno"
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
            />
          </div>

          <div className="form-field" style={{ marginBottom: '1rem' }}>
            <label htmlFor="schedule-patient-notes">Observações</label>
            <textarea
              id="schedule-patient-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', resize: 'vertical' }}
            />
          </div>

          <button
            type="button"
            className="button primary"
            onClick={handleSearchSlots}
            disabled={loadingSlots || !professionalId || !date}
            style={{ marginBottom: '1rem' }}
          >
            {loadingSlots ? 'Buscando...' : 'Buscar horários'}
          </button>

          {error && (
            <p role="alert" style={{ marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' }}>
              {error}
            </p>
          )}

          {slots.length > 0 && (
            <>
              <p style={{ marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem' }}>
                Horários disponíveis
              </p>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                }}
              >
                {slots.map((slot) => {
                  const isSelected =
                    selectedSlot?.startTime === slot.startTime && selectedSlot?.endTime === slot.endTime;
                  return (
                    <button
                      key={`${slot.startTime}-${slot.endTime}`}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={isSelected ? 'button primary' : 'button secondary'}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.5rem',
                        border: isSelected ? '2px solid var(--color-primary, #8B5CF6)' : '1px solid #e2e8f0',
                        minWidth: '4.5rem',
                      }}
                    >
                      {slot.startTime}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                className="button primary"
                onClick={handleConfirm}
                disabled={!selectedSlot || submitting}
                style={{ width: '100%' }}
              >
                {submitting ? 'Confirmando...' : 'Confirmar agendamento'}
              </button>
            </>
          )}

          {!loadingSlots && slots.length === 0 && professionalId && date && date >= todayIso() && (
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
              Clique em &quot;Buscar horários&quot; para ver as opções.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
