import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Stethoscope,
  DollarSign,
  FileSignature,
  FileText,
  Scan,
  File,
  ClipboardCheck,
  Pill,
  MessageCircle,
  Activity,
} from 'lucide-react';
import {
  CARE_INTELLIGENCE_FILTERS,
  groupTimelineByDate,
  filterTimelineEvents,
} from '../../services/patientCareTimelineService.js';

const PAGE_SIZE = 20;

const CATEGORY_ICONS = {
  clinico: Stethoscope,
  atendimento: Activity,
  financeiro: DollarSign,
  contrato: FileSignature,
  orcamento: FileText,
  exame: Scan,
  documento: File,
  atestado: ClipboardCheck,
  receita: Pill,
  whatsapp: MessageCircle,
};

function TimelineEventCard({ event, onAction }) {
  const Icon = CATEGORY_ICONS[event.categoryKey] || File;
  const categoryTag = event.categoryLabel?.toUpperCase() || 'REGISTRO';

  return (
    <article className={`pci-event-card pci-event-card--${event.categoryKey || 'documento'}`}>
      <div className="pci-event-card-icon" aria-hidden>
        <Icon size={18} />
      </div>
      <div className="pci-event-card-body">
        <span className="pci-event-card-tag">{categoryTag}</span>
        <h4 className="pci-event-card-title">{event.title}</h4>
        {event.fields?.length ? (
          <dl className="pci-event-card-fields">
            {event.fields.map((field) => (
              <div key={`${event.id}-${field.label}`} className="pci-event-field">
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {event.actions?.length ? (
          <div className="pci-event-card-actions">
            {event.actions.map((action) => (
              <button
                key={action.key}
                type="button"
                className="button ghost sm"
                onClick={() => onAction(event, action.key)}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function PatientCareIntelligenceTimeline({
  events = [],
  intelligenceAlerts = [],
  onAction,
}) {
  const [filterId, setFilterId] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

  const filteredEvents = useMemo(
    () => filterTimelineEvents(events, filterId),
    [events, filterId],
  );

  const visibleEvents = useMemo(
    () => filteredEvents.slice(0, visibleCount),
    [filteredEvents, visibleCount],
  );

  const grouped = useMemo(
    () => groupTimelineByDate(visibleEvents),
    [visibleEvents],
  );

  const hasMore = visibleCount < filteredEvents.length;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filterId, events.length]);

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredEvents.length));
  }, [filteredEvents.length]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '120px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore, grouped.length]);

  return (
    <div className="pci-timeline">
      {intelligenceAlerts.length ? (
        <div className="pci-timeline-alerts">
          {intelligenceAlerts.map((alert) => (
            <div key={alert.id} className={`pci-timeline-alert tone-${alert.tone || 'info'}`}>
              {alert.text}
            </div>
          ))}
        </div>
      ) : null}

      <div className="pci-timeline-filters">
        {CARE_INTELLIGENCE_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={`care-central-filter-chip${filterId === filter.id ? ' is-active' : ''}`}
            onClick={() => setFilterId(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="pci-timeline-track">
        {grouped.length ? grouped.map((group) => (
          <section key={group.dateKey} className="pci-timeline-group">
            <div className="pci-timeline-group-marker">
              <span className="pci-timeline-dot" aria-hidden />
              <h3 className="pci-timeline-group-label">{group.label}</h3>
            </div>
            <div className="pci-timeline-group-events">
              {group.events.map((event) => (
                <TimelineEventCard key={event.id} event={event} onAction={onAction} />
              ))}
            </div>
          </section>
        )) : (
          <p className="care-central-muted">Nenhum evento encontrado para este filtro.</p>
        )}
        {hasMore ? (
          <div ref={sentinelRef} className="pci-timeline-load-more">
            <button type="button" className="button ghost sm" onClick={loadMore}>
              Carregar mais eventos
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
