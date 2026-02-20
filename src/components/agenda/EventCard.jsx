import { useState, useRef } from 'react';
import { Check, MessageCircle, RotateCcw, X } from 'lucide-react';

export const EventCard = ({
  appointment,
  statusStyles,
  style,
  onAction,
  onSelect,
  onDragStart,
  onDragEnd,
  onDrop,
  onDragOver,
  onDragLeave,
  overlapCount = 1,
  isDragOver = false,
}) => {
  const {
    patientFirstName,
    patientName,
    patientPhone,
    startTime,
    endTime,
    procedureName,
    isReturn,
    status,
  } = appointment;
  const statusStyle = statusStyles[status] || {};

  // #region agent log
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'EventCard.jsx:14',
        message: 'EventCard render data',
        data: {
          patientFirstName,
          patientName,
          patientPhone,
          startTime,
          endTime,
          procedureName,
          isReturn,
          status,
          hasStatusStyle: !!statusStyle,
        },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'A',
      }),
    }).catch(() => {});
  }
  // #endregion

  const borderLeftColor = statusStyle.borderLeft || statusStyle.border || '#e2e8f0';
  const statusBadgeClass = `event-status-badge event-status-badge--${statusStyle.badgeVariant || 'neutral'}`;

  // Mapear tipo/etapa do atendimento
  const getTypeLabel = () => {
    if (isReturn) {
      return 'Retorno';
    }
    if (procedureName) {
      const procLower = procedureName.toLowerCase();
      if (procLower.includes('orçamento') || procLower.includes('orcamento')) {
        return 'Orçamento';
      }
      if (procLower.includes('avaliação') || procLower.includes('avaliacao')) {
        return 'Avaliação';
      }
      if (procLower.includes('tratamento')) {
        return 'Em tratamento';
      }
      if (procLower.includes('reagendamento') || procLower.includes('reagendar')) {
        return 'Reagendamento';
      }
      return procedureName;
    }
    return 'Consulta';
  };

  const typeLabel = getTypeLabel();
  const tooltipText = [patientFirstName || patientName, patientPhone, typeLabel]
    .filter(Boolean)
    .join(' • ');

  // #region agent log
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    setTimeout(() => {
      const cardElement = document.querySelector(`[data-appointment-id="${appointment.id}"]`);
      if (cardElement) {
        const computedStyle = window.getComputedStyle(cardElement);
        const rect = cardElement.getBoundingClientRect();
        fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'EventCard.jsx:45',
            message: 'EventCard DOM measurements',
            data: {
              id: appointment.id,
              height: rect.height,
              width: rect.width,
              computedHeight: computedStyle.height,
              computedMinHeight: computedStyle.minHeight,
              computedOverflow: computedStyle.overflow,
              styleHeight: style?.height,
              styleMinHeight: style?.minHeight,
              hasContent: !!cardElement.querySelector('.event-card-content'),
              hasRow2: !!cardElement.querySelector('.event-card-row-2'),
              hasBadges: !!cardElement.querySelector('.event-card-badges'),
            },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'run1',
            hypothesisId: 'C',
          }),
        }).catch(() => {});
      }
    }, 100);
  }
  // #endregion

  const [isDragging, setIsDragging] = useState(false);
  const dragStartTimeRef = useRef(null);

  const handleDragStart = (e) => {
    setIsDragging(true);
    dragStartTimeRef.current = Date.now();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', appointment.id);
    e.dataTransfer.setData('application/json', JSON.stringify(appointment));
    if (onDragStart) {
      onDragStart(appointment, e);
    }
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    setIsDragging(false);
    e.currentTarget.style.opacity = '1';
    dragStartTimeRef.current = null;
    if (onDragEnd) {
      onDragEnd(appointment, e);
    }
  };

  const handleClick = (e) => {
    // Só abrir detalhes se não foi um drag (drag leva mais de 200ms)
    const dragDuration = dragStartTimeRef.current ? Date.now() - dragStartTimeRef.current : 0;
    if (dragDuration < 200 && !isDragging) {
      onSelect?.(appointment);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDragOver && typeof onDragOver === 'function') {
      onDragOver(appointment, e);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDragLeave && typeof onDragLeave === 'function') {
      onDragLeave(appointment, e);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDrop) {
      const appointmentId = e.dataTransfer.getData('text/plain');
      const appointmentJson = e.dataTransfer.getData('application/json');
      let appointmentData = null;
      try {
        appointmentData = JSON.parse(appointmentJson);
      } catch (err) {
        console.error('Failed to parse appointment data', err);
      }
      if (appointmentId && appointmentData) {
        onDrop({
          appointmentId,
          appointment: appointmentData,
          targetAppointment: appointment,
        });
      }
    }
  };

  return (
    <div
      className={`event-card event-card--improved ${isDragging ? 'event-card--dragging' : ''} ${
        overlapCount > 1 ? 'event-card--overlap' : ''
      } ${isDragOver ? 'event-card--drag-over' : ''}`}
      data-status={status}
      data-appointment-id={appointment.id}
      data-overlap-count={overlapCount}
      draggable
      style={{
        ...style,
        '--event-bg': statusStyle.background,
        '--event-border': statusStyle.border,
        '--event-border-left': borderLeftColor,
        '--event-color': statusStyle.color,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      title={tooltipText}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSelect?.(appointment);
      }}
    >
      <div className="event-card-border-left" />
      <div className="event-card-content">
        {/* Linha 1: Nome do paciente (maior, negrito) */}
        <strong className="event-patient-name">{patientFirstName || patientName || 'Paciente'}</strong>

        {/* Linha 2: Telefone + Horário */}
        <div className="event-card-row-2">
          {patientPhone ? (
            <span className="event-phone">{patientPhone}</span>
          ) : (
            <span className="event-phone" style={{ opacity: 0.5 }}>Sem telefone</span>
          )}
          <span className="event-time">
            {startTime || '--:--'} – {endTime || '--:--'}
          </span>
        </div>

        {/* Linha 3: Badges (Tipo/Etapa + Status) */}
        <div className="event-card-badges">
          <span className="event-type-badge">{typeLabel}</span>
          <span className={statusBadgeClass}>{statusStyle.label || status || 'Agendado'}</span>
        </div>
      </div>
    </div>
  );
};
