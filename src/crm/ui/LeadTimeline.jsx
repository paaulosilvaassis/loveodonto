import { useState } from 'react';
import {
  ArrowRightLeft,
  MessageCircle,
  FileText,
  Calendar,
  UserPlus,
  Tag,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Phone,
} from 'lucide-react';
import { formatTimelineDate, formatTimelineEvent } from '../../utils/timelineLabels.js';
import { CRM_EVENT_TYPE } from '../../services/crmService.js';
import { buildWhatsAppLink } from '../../services/crmService.js';

const ICON_MAP = {
  status_change: ArrowRightLeft,
  contact: MessageCircle,
  message_sent: MessageCircle,
  note_added: FileText,
  budget_created: FileText,
  budget_presented: FileText,
  budget_approved: FileText,
  budget_rejected: FileText,
  budget_em_analise_followup: FileText,
  appointment_scheduled: Calendar,
  appointment_done: Calendar,
  converted_to_patient: UserPlus,
  tag_added: Tag,
  follow_up_created: ClipboardList,
  meta_lead_received: MessageCircle,
  meta_lead_updated: MessageCircle,
  task_created: ClipboardList,
  task_done: ClipboardList,
};

function getDayGroupKey(isoString) {
  const d = new Date(isoString);
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const yesterday = today - 24 * 60 * 60 * 1000;
  const evDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (evDay === today) return { key: 'hoje', label: 'Hoje' };
  if (evDay === yesterday) return { key: 'ontem', label: 'Ontem' };
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return { key: `${year}-${month}-${day}`, label: `${day}/${month}/${year}` };
}

function EventCardGeneric({ event, parsed, IconComponent, tone }) {
  const [open, setOpen] = useState(false);
  const hasPayload =
    event.data &&
    typeof event.data === 'object' &&
    Object.keys(event.data).filter((k) => !['fromStage', 'toStage', 'description', 'messagePreview', 'dueAt', 'followUpId'].includes(k)).length > 0;

  return (
    <div className={`crm-timeline-v2-card crm-timeline-v2-tone-${tone}`}>
      <div className="crm-timeline-v2-card-head">
        <span className="crm-timeline-v2-card-date">{formatTimelineDate(event.createdAt)}</span>
        <span className={`crm-timeline-v2-badge crm-timeline-v2-badge-${tone}`}>{parsed.badge}</span>
      </div>
      <h4 className="crm-timeline-v2-card-title">
        {IconComponent && <IconComponent size={18} className="crm-timeline-v2-card-icon" />}
        {parsed.title}
      </h4>
      {parsed.description && <p className="crm-timeline-v2-card-desc">{parsed.description}</p>}
      {hasPayload && (
        <div className="crm-timeline-v2-accordion">
          <button type="button" className="crm-timeline-v2-accordion-trigger" onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            Ver detalhes
          </button>
          {open && (
            <pre className="crm-timeline-v2-details">
              {JSON.stringify(event.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function EventCardMeta({ event, lead, phoneForEvent, onCreateFollowUp, onOpenSchedule }) {
  const d = event.data || {};
  const title =
    event.type === CRM_EVENT_TYPE.META_LEAD_UPDATED
      ? 'Lead atualizado via Meta (novo envio do formulário)'
      : 'Lead recebido do Instagram/Facebook';
  const phone = phoneForEvent(event);
  const whatsAppUrl = phone ? buildWhatsAppLink(phone) : '';
  const telUrl = phone ? `tel:+55${phone}` : '';

  return (
    <div className="crm-timeline-v2-card crm-timeline-v2-tone-meta">
      <div className="crm-timeline-v2-card-head">
        <span className="crm-timeline-v2-card-date">{formatTimelineDate(event.createdAt)}</span>
        <span className="crm-timeline-v2-badge crm-timeline-v2-badge-meta">Meta</span>
      </div>
      <h4 className="crm-timeline-v2-card-title">
        <MessageCircle size={18} className="crm-timeline-v2-card-icon" />
        {title}
      </h4>
      <div className="crm-timeline-v2-meta-body">
        <p className="crm-timeline-v2-meta-origin">Origem: Meta Lead Ads</p>
        {(d.name || d.phone || d.email) && (
          <p className="crm-timeline-v2-meta-contact">
            {d.name && <span>{d.name}</span>}
            {d.phone && <span> · {d.phone}</span>}
            {d.email && <span> · {d.email}</span>}
          </p>
        )}
        {(d.form_name || d.campaign_name || d.ad_name) && (
          <p className="crm-timeline-v2-meta-campaign">
            {d.form_name && <span>Formulário: {d.form_name}</span>}
            {d.campaign_name && <span> · Campanha: {d.campaign_name}</span>}
            {d.ad_name && <span> · Anúncio: {d.ad_name}</span>}
          </p>
        )}
        {Array.isArray(d.field_values) && d.field_values.length > 0 && (
          <ul className="crm-timeline-v2-meta-fields">
            {d.field_values.map((fv, i) => (
              <li key={i}>
                <strong>{fv.question || 'Campo'}:</strong> {fv.value ?? ''}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="crm-timeline-v2-meta-actions">
        {whatsAppUrl && (
          <a href={whatsAppUrl} target="_blank" rel="noopener noreferrer" className="button secondary small">
            <MessageCircle size={14} /> WhatsApp
          </a>
        )}
        {telUrl && (
          <a href={telUrl} className="button secondary small">
            <Phone size={14} /> Ligar
          </a>
        )}
        <button type="button" className="button secondary small" onClick={onCreateFollowUp}>
          <ClipboardList size={14} /> Criar follow-up
        </button>
        <button type="button" className="button secondary small" onClick={onOpenSchedule}>
          <Calendar size={14} /> Agendar
        </button>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="crm-timeline-v2-card crm-timeline-v2-skeleton">
      <div className="crm-timeline-v2-skeleton-line" style={{ width: '60%' }} />
      <div className="crm-timeline-v2-skeleton-line" style={{ width: '90%' }} />
      <div className="crm-timeline-v2-skeleton-line" style={{ width: '40%' }} />
    </div>
  );
}

const isMetaEvent = (type) =>
  type === CRM_EVENT_TYPE.META_LEAD_RECEIVED || type === CRM_EVENT_TYPE.META_LEAD_UPDATED;

/**
 * Timeline visual do lead: coluna esquerda (ícone + linha), cards à direita, agrupamento por dia.
 */
export function LeadTimeline({
  events = [],
  lead,
  loading = false,
  phoneForEvent,
  onCreateFollowUp,
  onOpenSchedule,
}) {
  if (loading) {
    return (
      <div className="crm-timeline-v2">
        <div className="crm-timeline-v2-body">
          <div className="crm-timeline-v2-line" aria-hidden />
          <div className="crm-timeline-v2-row">
            <div className="crm-timeline-v2-dot crm-timeline-v2-dot-neutral" />
            <div className="crm-timeline-v2-content"><SkeletonCard /></div>
          </div>
          <div className="crm-timeline-v2-row">
            <div className="crm-timeline-v2-dot crm-timeline-v2-dot-neutral" />
            <div className="crm-timeline-v2-content"><SkeletonCard /></div>
          </div>
          <div className="crm-timeline-v2-row">
            <div className="crm-timeline-v2-dot crm-timeline-v2-dot-neutral" />
            <div className="crm-timeline-v2-content"><SkeletonCard /></div>
          </div>
        </div>
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="crm-timeline-v2 crm-timeline-v2-empty">
        <p className="crm-timeline-v2-empty-text">Ainda não há eventos nesta timeline.</p>
      </div>
    );
  }

  const byDay = {};
  events.forEach((ev) => {
    const { key, label } = getDayGroupKey(ev.createdAt);
    if (!byDay[key]) byDay[key] = { label, events: [] };
    byDay[key].events.push(ev);
  });
  const orderedKeys = Object.keys(byDay).sort((a, b) => {
    if (a === 'hoje') return -1;
    if (b === 'hoje') return 1;
    if (a === 'ontem') return -1;
    if (b === 'ontem') return 1;
    return b.localeCompare(a);
  });

  return (
    <div className="crm-timeline-v2">
      {orderedKeys.map((dayKey) => (
        <section key={dayKey} className="crm-timeline-v2-day">
          <h3 className="crm-timeline-v2-day-title">{byDay[dayKey].label}</h3>
          <div className="crm-timeline-v2-body">
            <div className="crm-timeline-v2-line" aria-hidden />
            {byDay[dayKey].events.map((ev) => {
              const parsed = formatTimelineEvent(ev);
              const IconComponent = ICON_MAP[ev.type];
              const tone = parsed.tone;
              const isMeta = isMetaEvent(ev.type);
              return (
                <div key={ev.id} className={`crm-timeline-v2-row crm-timeline-v2-tone-${tone}`}>
                  <div className={`crm-timeline-v2-dot crm-timeline-v2-dot-${tone}`}>
                    {IconComponent ? <IconComponent size={14} /> : null}
                  </div>
                  <div className="crm-timeline-v2-content">
                    {isMeta ? (
                      <EventCardMeta
                        event={ev}
                        lead={lead}
                        phoneForEvent={phoneForEvent}
                        onCreateFollowUp={onCreateFollowUp}
                        onOpenSchedule={onOpenSchedule}
                      />
                    ) : (
                      <EventCardGeneric event={ev} parsed={parsed} IconComponent={IconComponent} tone={tone} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
