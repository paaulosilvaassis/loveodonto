import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const AgendaTimeline = ({
  timelineDays,
  onPrev,
  onNext,
  onSelectDate,
  timelineRef,
}) => {
  const selectedDayRefs = useRef({});
  const lastSelectedIsoRef = useRef(null);
  const isScrollingRef = useRef(false);

  // Calcula o scroll amount baseado na largura de um item + gap
  const getScrollAmount = () => {
    if (!timelineRef?.current) return 260;
    const firstDay = timelineRef.current.querySelector('.timeline-day');
    if (!firstDay) return 260;
    const dayRect = firstDay.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(timelineRef.current);
    const gap = parseFloat(computedStyle.gap) || 0.8 * 16; // gap padrão 0.8rem em px
    const scrollAmount = dayRect.width + gap;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaTimeline.jsx:16',message:'Scroll amount calculated',data:{dayWidth:dayRect.width,gap,scrollAmount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    return scrollAmount;
  };

  const handlePrev = () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaTimeline.jsx:12',message:'handlePrev called',data:{hasTimelineRef:!!timelineRef?.current,hasOnPrev:!!onPrev},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (timelineRef?.current) {
      const scrollAmount = getScrollAmount();
      timelineRef.current.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    }
    onPrev?.();
  };

  const handleNext = () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaTimeline.jsx:19',message:'handleNext called',data:{hasTimelineRef:!!timelineRef?.current,hasOnNext:!!onNext},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (timelineRef?.current) {
      const scrollAmount = getScrollAmount();
      timelineRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
    onNext?.();
  };

  // Detecta scroll manual do usuário
  useEffect(() => {
    const timelineEl = timelineRef?.current;
    if (!timelineEl) return;

    let scrollTimeout;
    const handleScroll = () => {
      // Se o usuário está fazendo scroll manual, marca como tal
      if (!isScrollingRef.current) {
        // Scroll manual detectado - não interfere com auto-center
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          // Após parar de scrollar, permite auto-center novamente
        }, 100);
      }
    };

    timelineEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      timelineEl.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [timelineRef]);

  // Auto-center quando a seleção mudar
  useEffect(() => {
    const selectedDay = timelineDays.find(day => day.isSelected);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaTimeline.jsx:73',message:'Auto-center effect triggered',data:{hasSelectedDay:!!selectedDay,selectedIso:selectedDay?.iso,hasTimelineRef:!!timelineRef?.current,lastSelectedIso:lastSelectedIsoRef.current,isScrolling:isScrollingRef.current,timelineDaysCount:timelineDays.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    if (!selectedDay || !timelineRef?.current) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaTimeline.jsx:78',message:'Auto-center skipped - no selected day or timeline ref',data:{hasSelectedDay:!!selectedDay,hasTimelineRef:!!timelineRef?.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      return;
    }
    
    const selectedIso = selectedDay.iso;
    const selectedDayRef = selectedDayRefs.current[selectedIso];
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaTimeline.jsx:85',message:'Auto-center check',data:{selectedIso,hasSelectedDayRef:!!selectedDayRef,lastSelectedIso:lastSelectedIsoRef.current,isScrolling:isScrollingRef.current,willCenter:lastSelectedIsoRef.current !== selectedIso && !isScrollingRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    if (!selectedDayRef) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaTimeline.jsx:90',message:'Auto-center skipped - no ref for selected day',data:{selectedIso,availableRefs:Object.keys(selectedDayRefs.current)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      return;
    }
    
    // Só centraliza se a seleção realmente mudou (evita jitter)
    if (lastSelectedIsoRef.current === selectedIso || isScrollingRef.current) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaTimeline.jsx:97',message:'Auto-center skipped - same selection or scrolling',data:{selectedIso,lastSelectedIso:lastSelectedIsoRef.current,isScrolling:isScrollingRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      return;
    }
    
    lastSelectedIsoRef.current = selectedIso;
    isScrollingRef.current = true;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaTimeline.jsx:105',message:'Auto-center executing',data:{selectedIso},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    // Usa requestAnimationFrame para garantir que o DOM está atualizado
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (selectedDayRef && timelineRef.current) {
          const timelineEl = timelineRef.current;
          const beforeScroll = timelineEl.scrollLeft;
          const timelineRect = timelineEl.getBoundingClientRect();
          const targetRect = selectedDayRef.getBoundingClientRect();
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaTimeline.jsx:111',message:'Calling scrollIntoView',data:{selectedIso,beforeScroll,timelineWidth:timelineRect.width,targetLeft:targetRect.left,timelineLeft:timelineRect.left,targetCenter:targetRect.left + targetRect.width / 2,timelineCenter:timelineRect.left + timelineRect.width / 2},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          
          // Tenta scrollIntoView primeiro
          selectedDayRef.scrollIntoView({
            behavior: 'smooth',
            inline: 'center',
            block: 'nearest',
          });
          
          // Verifica após um pequeno delay se o scroll funcionou
          setTimeout(() => {
            const afterScroll = timelineEl.scrollLeft;
            const targetRectAfter = selectedDayRef.getBoundingClientRect();
            const timelineRectAfter = timelineEl.getBoundingClientRect();
            const targetCenterAfter = targetRectAfter.left + targetRectAfter.width / 2;
            const timelineCenterAfter = timelineRectAfter.left + timelineRectAfter.width / 2;
            const offsetFromCenter = Math.abs(targetCenterAfter - timelineCenterAfter);
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaTimeline.jsx:125',message:'ScrollIntoView result check',data:{selectedIso,beforeScroll,afterScroll,scrollChanged:afterScroll !== beforeScroll,offsetFromCenter,targetCenterAfter,timelineCenterAfter,isCentered:offsetFromCenter < 50},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            
            // Se não centralizou bem (offset > 50px), usa cálculo manual
            if (offsetFromCenter > 50) {
              // Calcula a posição absoluta do elemento dentro do scroll container
              const targetLeftRelative = targetRectAfter.left - timelineRectAfter.left;
              const targetWidth = targetRectAfter.width;
              const currentScroll = timelineEl.scrollLeft;
              
              // Posição absoluta do centro do elemento dentro do scroll container
              const targetCenterAbsolute = currentScroll + targetLeftRelative + targetWidth / 2;
              
              // Centro desejado do viewport (centro do container visível)
              const containerCenterAbsolute = currentScroll + timelineEl.clientWidth / 2;
              
              // Quanto precisamos scrollar para centralizar
              const scrollOffset = targetCenterAbsolute - containerCenterAbsolute;
              const desiredScrollLeft = currentScroll + scrollOffset;
              const maxScrollLeft = timelineEl.scrollWidth - timelineEl.clientWidth;
              const finalScrollLeft = Math.max(0, Math.min(maxScrollLeft, desiredScrollLeft));
              
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaTimeline.jsx:135',message:'Using manual scroll calculation',data:{selectedIso,currentScroll,targetCenterAbsolute,containerCenterAbsolute,scrollOffset,desiredScrollLeft,finalScrollLeft,maxScrollLeft},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              
              timelineEl.scrollTo({
                left: finalScrollLeft,
                behavior: 'smooth',
              });
            }
            
            // Reseta a flag após a animação
            setTimeout(() => {
              isScrollingRef.current = false;
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaTimeline.jsx:145',message:'Auto-center scroll completed',data:{selectedIso},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
            }, 400);
          }, 100);
        } else {
          isScrollingRef.current = false;
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaTimeline.jsx:150',message:'Auto-center failed - refs lost',data:{selectedIso,hasSelectedDayRef:!!selectedDayRef,hasTimelineRef:!!timelineRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
        }
      });
    });
  }, [timelineDays, timelineRef]);

  return (
    <div className="agenda-timeline-premium">
      <div className="agenda-timeline-sticky">
        <div className="agenda-timeline-wrapper">
          <button
            type="button"
            className="timeline-nav-button timeline-nav-button--premium"
            onClick={handlePrev}
            aria-label="Voltar dias"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="agenda-timeline agenda-timeline-list" ref={timelineRef}>
            {timelineDays.map((day) => {
              const isWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6;
              const dayClass =
                day.dayOfWeek === 0
                  ? 'timeline-day--sun'
                  : day.dayOfWeek === 6
                  ? 'timeline-day--sat'
                  : 'timeline-day--weekday';
              const isSelected = day.isSelected;
              
              return (
                <button
                  key={day.iso}
                  ref={(el) => {
                    if (el) {
                      selectedDayRefs.current[day.iso] = el;
                    } else {
                      delete selectedDayRefs.current[day.iso];
                    }
                  }}
                  type="button"
                  className={`timeline-day ${dayClass} ${isSelected ? 'timeline-day--selected' : ''} ${
                    day.isToday ? 'timeline-day--today' : ''
                  } ${day.isClosed ? 'timeline-day--closed' : ''}`.trim()}
                  onClick={() => {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaTimeline.jsx:54',message:'Timeline day clicked',data:{dayIso:day.iso,dayWeekday:day.weekday,dayDay:day.day,hasOnSelectDate:!!onSelectDate},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                    // #endregion
                    // Reseta a ref para forçar centralização
                    lastSelectedIsoRef.current = null;
                    onSelectDate(day.iso);
                  }}
                  aria-label={`Selecionar ${day.weekday} ${day.day} ${day.month}`}
                >
                  <span className="timeline-day-weekday">{day.weekday}</span>
                  <strong className="timeline-day-number">{day.day}</strong>
                  <span className="timeline-day-month">{day.month}</span>
                  {day.isClosed ? <span className="timeline-day-closed-label">Fechado</span> : null}
                  {isWeekend ? <span className="timeline-day-dot" /> : null}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="timeline-nav-button timeline-nav-button--premium"
            onClick={handleNext}
            aria-label="Avançar dias"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};
