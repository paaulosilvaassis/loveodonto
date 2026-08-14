import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DoorClosed } from 'lucide-react';
import { APPOINTMENT_STATUS } from '../../services/appointmentService.js';
import {
  closeClinicalAppointment,
  resolveClinicalFinishReadiness,
} from '../../services/clinicalAppointmentCloseService.js';
import { resolveClinicalAttendanceState } from '../../services/clinicalAttendanceState.js';
import { FinishAppointmentModal } from './budget/FinishAppointmentModal.jsx';

export const ATTENDANCE_SESSION_COPY = {
  title: 'Atendimento em andamento',
  subtitle: 'Finalize o atendimento quando concluir esta consulta.',
};

export function ClinicalAttendanceSessionBar({
  user,
  appointment,
  patient,
  budget = null,
  onClosed,
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);

  if (!appointment || appointment.status !== APPOINTMENT_STATUS.EM_ATENDIMENTO) return null;

  const attendance = resolveClinicalAttendanceState({ appointment });
  const readiness = resolveClinicalFinishReadiness({
    appointment,
    budget,
    appointmentId: appointment.id,
  });
  const blocker = readiness.blockers[0] || null;
  const needsAttention = Boolean(attendance.requiresResolution);
  const title = needsAttention ? attendance.displayLabel : ATTENDANCE_SESSION_COPY.title;
  const subtitle = needsAttention
    ? (attendance.message || ATTENDANCE_SESSION_COPY.subtitle)
    : ATTENDANCE_SESSION_COPY.subtitle;

  const handleConfirm = ({ reason, notes }) => {
    setConfirming(true);
    setError(null);
    try {
      closeClinicalAppointment(user, {
        appointmentId: appointment.id,
        patientId: patient?.id || appointment.patientId,
        budgetId: budget?.id || null,
        reason,
        notes,
      });
      setOpen(false);
      if (typeof onClosed === 'function') onClosed();
      else navigate('/gestao-comercial/jornada-do-paciente');
    } catch (err) {
      setError(err);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div
      className={['clinical-attendance-session-bar', needsAttention ? 'is-attention' : '']
        .filter(Boolean)
        .join(' ')}
      data-testid="clinical-finish-session-bar"
      role="status"
      aria-label={title}
    >
      <div className="clinical-attendance-session-bar-text">
        <strong data-testid="clinical-session-title">{title}</strong>
        <p data-testid="clinical-session-subtitle">{subtitle}</p>
        {blocker ? (
          <p>
            {blocker.message}
            {blocker.ctaHref ? (
              <button
                type="button"
                className="button secondary"
                data-testid="finish-blocker-cta"
                onClick={() => navigate(blocker.ctaHref)}
              >
                {blocker.ctaLabel}
              </button>
            ) : null}
          </p>
        ) : null}
        {error?.message ? (
          <p role="alert">
            {error.message}
            {error.ctaHref ? (
              <button
                type="button"
                className="button secondary"
                data-testid="finish-blocker-cta"
                onClick={() => navigate(error.ctaHref)}
              >
                {error.ctaLabel || 'Corrigir'}
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
      {readiness.canFinish ? (
        <button
          type="button"
          className="button primary"
          data-testid="finish-attendance-cta"
          onClick={() => setOpen(true)}
        >
          <DoorClosed size={16} aria-hidden />
          Finalizar atendimento
        </button>
      ) : null}
      <FinishAppointmentModal
        open={open}
        onClose={() => { if (!confirming) setOpen(false); }}
        onConfirm={handleConfirm}
        confirming={confirming}
        defaultReason={readiness.defaultReason}
        disabledReasons={readiness.disabledReasons}
        description={
          readiness.legallyFrozen
            ? 'O orçamento e o contrato históricos permanecem intactos. Escolha o motivo oficial do encerramento.'
            : undefined
        }
      />
    </div>
  );
}
