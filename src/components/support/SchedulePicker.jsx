/**
 * Seletor de data e horário para agendamento de chamados de suporte.
 */
import { useState } from 'react';
import { getAvailableTimeSlots } from '../../services/supportTicketService.js';

export default function SchedulePicker({ value, onChange, disabled }) {
  const days = getAvailableTimeSlots();
  const [selectedDate, setSelectedDate] = useState(value?.slice(0, 10) || days[0]?.date || '');

  const currentDay = days.find((d) => d.date === selectedDate) || days[0];
  const slots = currentDay?.slots || [];

  const handleSlotClick = (slot) => {
    const iso = `${selectedDate}T${slot}:00`;
    onChange(iso);
  };

  const isSelected = (slot) => {
    if (!value) return false;
    const [d, t] = value.split('T');
    return d === selectedDate && t?.slice(0, 5) === slot;
  };

  const formatDateLabel = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((d - today) / (24 * 60 * 60 * 1000));
    const short = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
    if (diff === 0) return `Hoje · ${short}`;
    if (diff === 1) return `Amanhã · ${short}`;
    return short;
  };

  return (
    <div className="schedule-picker" role="group" aria-labelledby="schedule-picker-label">
      <p id="schedule-picker-label" className="schedule-picker-label">
        Escolha o melhor dia e horário
      </p>

      <div className="schedule-picker-days" role="tablist">
        {days.map((d) => (
          <button
            key={d.date}
            type="button"
            role="tab"
            aria-selected={selectedDate === d.date}
            aria-controls={`slots-${d.date}`}
            id={`tab-${d.date}`}
            className={`schedule-picker-day-tab ${selectedDate === d.date ? 'selected' : ''}`}
            onClick={() => setSelectedDate(d.date)}
            disabled={disabled}
          >
            {formatDateLabel(d.date)}
          </button>
        ))}
      </div>

      <div
        id={`slots-${selectedDate}`}
        role="tabpanel"
        aria-labelledby={`tab-${selectedDate}`}
        className="schedule-picker-slots"
      >
        {slots.map((slot) => (
          <button
            key={slot}
            type="button"
            className={`schedule-picker-slot ${isSelected(slot) ? 'selected' : ''}`}
            onClick={() => handleSlotClick(slot)}
            disabled={disabled}
            aria-pressed={isSelected(slot)}
          >
            {slot}
          </button>
        ))}
      </div>
    </div>
  );
}
