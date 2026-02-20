import { EventCard } from './EventCard.jsx';

export const MonthGrid = ({ weeks, appointmentsByDate, statusStyles, onDayClick, onEventSelect }) => {
  return (
    <div className="month-grid">
      <div className="month-header">
        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((label) => (
          <div key={label} className="month-header-cell">
            {label}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0].iso} className="month-row">
          {week.map((day) => {
            const items = appointmentsByDate[day.iso] || [];
            return (
              <div
                key={day.iso}
                className={`month-cell ${day.isCurrentMonth ? '' : 'outside'} ${day.isToday ? 'today' : ''} ${
                  day.isClosed ? 'month-cell--closed' : ''
                }`}
              >
                <button
                  type="button"
                  className={`month-day ${day.isClosed ? 'month-day--closed' : ''}`}
                  onClick={() => onDayClick(day.iso)}
                >
                  {day.dayLabel}
                </button>
                {day.isClosed ? <span className="month-closed-label">Fechado</span> : null}
                <div className="month-events">
                  {items.slice(0, 3).map((appointment) => (
                    <EventCard
                      key={appointment.id}
                      appointment={appointment}
                      statusStyles={statusStyles}
                      onSelect={onEventSelect}
                      style={{ position: 'relative', height: 'auto' }}
                    />
                  ))}
                  {items.length > 3 ? <span className="month-more">+{items.length - 3} mais</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
