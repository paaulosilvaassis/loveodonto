import { useEffect, useRef } from 'react';
import { minutesToTime, toMinutes } from '../../utils/agendaUtils.js';
import { overlapKey, calculateLaneLayout } from '../../utils/calendar/overlap.js';
import { EventCard } from './EventCard.jsx';

export const CalendarGrid = ({
  days,
  startMinutes,
  endMinutes,
  slotMinutes,
  appointments,
  blocks,
  statusStyles,
  hasWorkHoursConfig,
  workHoursByWeekday,
  onSlotClick,
  onEventAction,
  onEventSelect,
  onDragStart,
  onDragEnd,
  onDrop,
  dragOverSlot,
  onDragOverSlotChange,
  dragOverEvent,
  onDragOverEvent,
  onDragLeaveEvent,
}) => {
  const calendarBodyRef = useRef(null);
  const hoveredSlotRef = useRef(null);
  const totalMinutes = Math.max(0, endMinutes - startMinutes);
  const totalRows = Math.ceil(totalMinutes / slotMinutes);
  // Aumentar rowHeight para garantir espaço adequado (mínimo 80px para eventos com minHeight 70px + margem)
  const rowHeight = Math.max(80, Math.round(slotMinutes * 2.5));
  const columnTemplate = `70px repeat(${days.length}, minmax(140px, 1fr))`;
  const slots = Array.from({ length: totalRows }).map((_, index) => {
    const minutes = startMinutes + index * slotMinutes;
    return {
      label: minutes % 60 === 0 ? minutesToTime(minutes) : '',
      time: minutesToTime(minutes),
      minutes,
      isHour: minutes % 60 === 0,
    };
  });

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMinutes - startMinutes) / slotMinutes) * rowHeight;

  const blocksByDay = blocks.reduce((acc, block) => {
    acc[block.date] = acc[block.date] || [];
    acc[block.date].push(block);
    return acc;
  }, {});

  const appointmentsByDay = appointments.reduce((acc, item) => {
    acc[item.date] = acc[item.date] || [];
    acc[item.date].push(item);
    return acc;
  }, {});

  useEffect(() => {
    const container = calendarBodyRef.current;
    if (!container) return undefined;

    const clearHover = () => {
      if (hoveredSlotRef.current) {
        hoveredSlotRef.current.classList.remove('fc-slot-hover');
        hoveredSlotRef.current = null;
      }
    };

    const isOccupiedSlot = (slotEl) => {
      const dayColumn = slotEl.closest('.calendar-day-column');
      if (!dayColumn) return false;
      const slotRect = slotEl.getBoundingClientRect();
      const events = dayColumn.querySelectorAll('.event-card');
      return Array.from(events).some((eventEl) => {
        const eventRect = eventEl.getBoundingClientRect();
        return eventRect.bottom > slotRect.top && eventRect.top < slotRect.bottom;
      });
    };

    const handleMove = (event) => {
      const slotEl = event.target.closest('.calendar-slot');
      if (!slotEl || !container.contains(slotEl)) {
        clearHover();
        return;
      }

      if (
        slotEl.disabled ||
        slotEl.classList.contains('calendar-slot--closed') ||
        slotEl.classList.contains('calendar-slot--out-of-hours')
      ) {
        clearHover();
        return;
      }

      if (slotEl === hoveredSlotRef.current) return;

      if (isOccupiedSlot(slotEl)) {
        clearHover();
        return;
      }

      clearHover();
      slotEl.classList.add('fc-slot-hover');
      hoveredSlotRef.current = slotEl;
    };

    const handleLeave = () => {
      clearHover();
    };

    container.addEventListener('mousemove', handleMove);
    container.addEventListener('mouseleave', handleLeave);

    return () => {
      container.removeEventListener('mousemove', handleMove);
      container.removeEventListener('mouseleave', handleLeave);
      clearHover();
    };
  }, []);

  return (
    <div className="calendar-shell">
      <div className="calendar-header-row" style={{ gridTemplateColumns: columnTemplate }}>
        <div className="calendar-time-gutter" />
        {days.map((day) => (
          <div
            key={day.iso}
            className={`calendar-day-header ${day.isToday ? 'today' : ''} ${day.isClosed ? 'calendar-day-header--closed' : ''}`}
          >
            <div className="agenda-day-header-card">
              <span className="agenda-day-header-dow">{day.label}</span>
              <small className="agenda-day-header-date">{day.subtitle}</small>
            </div>
            {day.isClosed ? <span className="calendar-day-closed-label">Fechado</span> : null}
          </div>
        ))}
      </div>

      <div
        className="calendar-body"
        style={{ '--row-height': `${rowHeight}px`, gridTemplateColumns: columnTemplate }}
        ref={calendarBodyRef}
      >
        <div className="calendar-time-column">
          {slots.map((slot) => (
            <div key={slot.time} className={`calendar-time-slot ${slot.isHour ? 'hour' : ''}`}>
              {slot.label}
            </div>
          ))}
        </div>

        {days.map((day) => {
          const dayAppointments = appointmentsByDay[day.iso] || [];
          const dayBlocks = blocksByDay[day.iso] || [];
          const isToday = day.isToday;
          const isClosed = day.isClosed;
          const dayRanges = hasWorkHoursConfig ? workHoursByWeekday?.[day.dayOfWeek] || [] : [];
          const overlapLayout = (() => {
            const layout = new Map();
            
            // Agrupar eventos por recurso (profissional + sala)
            const groupedByResource = dayAppointments.reduce((acc, item) => {
              const key = overlapKey(item);
              if (!key) return acc;
              acc[key] = acc[key] || [];
              acc[key].push(item);
              return acc;
            }, {});

            // Para cada grupo de recursos, calcular lanes
            Object.values(groupedByResource).forEach((group) => {
              const groupLayout = calculateLaneLayout(group);
              groupLayout.forEach((info, id) => {
                layout.set(id, {
                  columns: info.columns,
                  columnIndex: info.laneIndex,
                  isOverlap: info.columns > 1,
                });
              });
            });

            // #region agent log
            if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
              const sampleLayout = Array.from(layout.entries()).slice(0, 3).map(([id, info]) => ({
                id,
                ...info,
              }));
              fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CalendarGrid.jsx:157',message:'Overlap layout calculation',data:{day:day.iso,appointmentCount:dayAppointments.length,layoutSize:layout.size,sampleLayout,groupedKeys:Object.keys(groupedByResource)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            }
            // #endregion

            return layout;
          })();

          return (
            <div
              key={day.iso}
              className={`calendar-day-column ${isClosed ? 'calendar-day-column--closed' : ''}`}
              style={{ height: totalRows * rowHeight }}
            >
              {isClosed ? <div className="calendar-day-closed-label">Fechado</div> : null}
              <div className="calendar-slot-grid">
                {slots.map((slot) => {
                  const slotKey = `${day.iso}-${slot.time}`;
                  const isDragOver = dragOverSlot === slotKey;
                  const slotEnd = slot.minutes + slotMinutes;
                  const isWithinWorkingHours = !hasWorkHoursConfig
                    ? true
                    : dayRanges.some((range) => slot.minutes < range.end && slotEnd > range.start);
                  const isOutOfHours = !isClosed && hasWorkHoursConfig && !isWithinWorkingHours;
                  if (isClosed) {
                    return (
                      <div key={slotKey} className="calendar-slot-dropzone calendar-slot-dropzone--closed">
                        <button
                          type="button"
                          className="calendar-slot calendar-slot--closed"
                          aria-label="Dia fechado"
                          disabled
                        />
                      </div>
                    );
                  }
                  if (isOutOfHours) {
                    return (
                      <div key={slotKey} className="calendar-slot-dropzone calendar-slot-dropzone--out-of-hours">
                        <button
                          type="button"
                          className="calendar-slot calendar-slot--out-of-hours"
                          aria-label="Fora do horario"
                          disabled
                        />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={slotKey}
                      className={`calendar-slot-dropzone ${isDragOver ? 'calendar-slot-dropzone--drag-over' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';
                        if (onDragOverSlotChange && dragOverSlot !== slotKey) {
                          onDragOverSlotChange(slotKey);
                        }
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (onDragOverSlotChange && dragOverSlot !== slotKey) {
                          onDragOverSlotChange(slotKey);
                        }
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Não limpar dragOverSlot aqui para evitar flickering
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const appointmentId = e.dataTransfer.getData('text/plain');
                        const appointmentJson = e.dataTransfer.getData('application/json');
                        let appointmentData = null;
                        try {
                          appointmentData = JSON.parse(appointmentJson);
                        } catch (err) {
                          console.error('Failed to parse appointment data', err);
                        }
                        if (onDrop && appointmentId && appointmentData) {
                          onDrop({
                            appointmentId,
                            appointment: appointmentData,
                            targetDate: day.iso,
                            targetTime: slot.time,
                          });
                        }
                      }}
                    >
                      <button
                        type="button"
                        className="calendar-slot"
                        onClick={() => onSlotClick?.({ date: day.iso, time: slot.time })}
                      />
                    </div>
                  );
                })}
              </div>

              {dayBlocks.map((block) => {
                const top = ((toMinutes(block.startTime) - startMinutes) / slotMinutes) * rowHeight;
                const height =
                  ((toMinutes(block.endTime) - toMinutes(block.startTime)) / slotMinutes) * rowHeight;
                return (
                  <div
                    key={block.id}
                    className="calendar-block"
                    style={{ top: Math.max(0, top), height: Math.max(rowHeight, height) }}
                  >
                    <span>Bloqueio</span>
                    <small>{block.reason || 'Sem motivo'}</small>
                  </div>
                );
              })}

              {dayAppointments.map((appointment) => {
                const top = ((toMinutes(appointment.startTime) - startMinutes) / slotMinutes) * rowHeight;
                const calculatedHeight =
                  ((toMinutes(appointment.endTime) - toMinutes(appointment.startTime)) / slotMinutes) * rowHeight;
                const finalHeight = Math.max(Math.max(rowHeight, calculatedHeight), 70);

                // #region agent log
                if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
                  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      location: 'CalendarGrid.jsx:105',
                      message: 'Appointment height calculation',
                      data: {
                        id: appointment.id,
                        startTime: appointment.startTime,
                        endTime: appointment.endTime,
                        rowHeight,
                        calculatedHeight,
                        finalHeight,
                        slotMinutes,
                      },
                      timestamp: Date.now(),
                      sessionId: 'debug-session',
                      runId: 'run1',
                      hypothesisId: 'D',
                    }),
                  }).catch(() => {});
                }
                // #endregion

                if (toMinutes(appointment.endTime) <= startMinutes) return null;
                if (toMinutes(appointment.startTime) >= endMinutes) return null;

                const layout = overlapLayout.get(appointment.id) || {
                  columns: 1,
                  columnIndex: 0,
                  isOverlap: false,
                };
                
                // Calcular estilo para lanes lado a lado (máximo 2)
                const gap = 6; // gap visual entre eventos lado a lado
                const columnWidth = layout.columns > 1 ? `calc(50% - ${gap / 2}px)` : '100%';
                const leftOffset = layout.columns > 1 
                  ? layout.columnIndex === 0 
                    ? '0%' 
                    : `calc(50% + ${gap / 2}px)`
                  : '0%';
                
                const overlapStyle =
                  layout.columns > 1
                    ? {
                        width: columnWidth,
                        left: leftOffset,
                        right: 'auto',
                        zIndex: 10 + layout.columnIndex, // Mesmo nível z-index para eventos lado a lado
                      }
                    : { zIndex: 10 };

                // #region agent log
                if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && layout.columns > 1) {
                  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CalendarGrid.jsx:269',message:'Rendering overlap event',data:{id:appointment.id,columns:layout.columns,columnIndex:layout.columnIndex,columnWidth,leftOffset,overlapStyle},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                }
                // #endregion

                // #region agent log
                try {
                  if (!onDragOverEvent || typeof onDragOverEvent !== 'function') {
                    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CalendarGrid.jsx:377',message:'onDragOverEvent check',data:{hasOnDragOverEvent:!!onDragOverEvent,type:typeof onDragOverEvent,appointmentId:appointment.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
                  }
                  if (!onDragLeaveEvent || typeof onDragLeaveEvent !== 'function') {
                    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CalendarGrid.jsx:377',message:'onDragLeaveEvent check',data:{hasOnDragLeaveEvent:!!onDragLeaveEvent,type:typeof onDragLeaveEvent,appointmentId:appointment.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
                  }
                } catch (err) {
                  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CalendarGrid.jsx:377',message:'Error checking drag handlers',data:{error:err?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
                }
                // #endregion
                return (
                  <EventCard
                    key={appointment.id}
                    appointment={appointment}
                    statusStyles={statusStyles}
                    onAction={onEventAction}
                    onSelect={onEventSelect}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDrop={onDrop}
                    onDragOver={onDragOverEvent}
                    onDragLeave={onDragLeaveEvent}
                    overlapCount={layout.columns}
                    isDragOver={dragOverEvent === appointment.id}
                    style={{
                      top: `${Math.max(0, top)}px`,
                      height: `${finalHeight}px`,
                      minHeight: '70px',
                      maxHeight: 'none',
                      marginBottom: '4px', // Espaçamento vertical entre eventos
                      ...overlapStyle,
                    }}
                  />
                );
              })}

              {isToday && nowMinutes >= startMinutes && nowMinutes <= endMinutes ? (
                <div className="calendar-now-line" style={{ top: nowTop }}>
                  <span />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
