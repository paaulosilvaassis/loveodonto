import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import { LEAD_SOURCE_LABELS, listFollowUps } from '../../services/crmService.js';

const MIME_LEAD_ID = 'text/plain';
const MIME_LEAD_STAGE = 'application/x-lead-stage';

/**
 * Card de lead no Kanban. Draggable; ação "Agendar" abre modal para agendar na Agenda.
 * Alertas visuais: follow-up atrasado → borda vermelha; vence hoje → indicador amarelo; badge com quantidade ativa.
 */
export function LeadCard({ lead, stage, onMoveLead, onScheduleClick }) {
  const sourceLabel = LEAD_SOURCE_LABELS[lead.source] || lead.source || '—';
  const lastContact = lead.lastContactAt
    ? new Date(lead.lastContactAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : '—';

  const followUpAlert = useMemo(() => {
    const pending = listFollowUps({ leadId: lead.id, pending: true });
    if (pending.length === 0) return { count: 0, overdue: false, dueToday: false };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let overdue = false;
    let dueToday = false;
    pending.forEach((f) => {
      const d = f.dueAt ? new Date(f.dueAt) : null;
      if (d) {
        d.setHours(0, 0, 0, 0);
        if (d < today) overdue = true;
        if (d.getTime() === today.getTime()) dueToday = true;
      }
    });
    return { count: pending.length, overdue, dueToday };
  }, [lead.id]);

  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(MIME_LEAD_ID, lead.id);
    e.dataTransfer.setData(MIME_LEAD_STAGE, stage?.key ?? '');
    e.dataTransfer.setData('text/plain', lead.id);
  };

  const handleScheduleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onScheduleClick?.(lead);
  };

  const cardStyle = { position: 'relative' };
  if (followUpAlert.overdue) {
    cardStyle.borderLeft = '4px solid #dc2626';
    cardStyle.backgroundColor = 'rgba(254, 226, 226, 0.4)';
  } else if (followUpAlert.dueToday) {
    cardStyle.borderLeft = '4px solid #ca8a04';
    cardStyle.backgroundColor = 'rgba(254, 249, 195, 0.4)';
  }

  return (
    <div
      className="crm-pipeline-card"
      data-lead-id={lead.id}
      data-stage-key={stage?.key}
      draggable
      onDragStart={handleDragStart}
      style={cardStyle}
    >
      {followUpAlert.count > 0 && (
        <span
          className="crm-pipeline-card-follow-up-badge"
          title={`${followUpAlert.count} follow-up(s) pendente(s)`}
          style={{
            position: 'absolute',
            top: '6px',
            right: '6px',
            fontSize: '0.7rem',
            fontWeight: 600,
            minWidth: '18px',
            height: '18px',
            borderRadius: '9px',
            background: followUpAlert.overdue ? '#dc2626' : followUpAlert.dueToday ? '#ca8a04' : '#64748b',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
          }}
        >
          {followUpAlert.count}
        </span>
      )}
      <Link to={`/crm/leads/${lead.id}`} className="crm-pipeline-card-link">
        <div className="crm-pipeline-card-name">{lead.name || 'Sem nome'}</div>
        <div className="crm-pipeline-card-meta">
          <span className="crm-pipeline-card-phone">{lead.phone || '—'}</span>
          <span className="crm-pipeline-card-origin">{sourceLabel}</span>
        </div>
        <div className="crm-pipeline-card-footer">
          <span className="crm-pipeline-card-last">Últ. contato: {lastContact}</span>
          {(lead.tagList?.length > 0 || lead.tags?.length > 0) && (
            <div className="crm-pipeline-card-tags">
              {(lead.tagList || lead.tags?.map((name) => ({ name, color: '#6366f1' })) || []).slice(0, 3).map((t) => (
                <span
                  key={typeof t === 'object' ? t.id || t.name : t}
                  className="crm-pipeline-card-tag-pill"
                  style={{ '--tag-color': typeof t === 'object' ? t.color : '#6366f1' }}
                >
                  {typeof t === 'object' ? t.name : t}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>
      {onScheduleClick && (
        <button
          type="button"
          className="crm-pipeline-card-agendar"
          onClick={handleScheduleClick}
          title="Agendar na Agenda"
          aria-label="Agendar na Agenda"
        >
          <Calendar size={14} />
          <span>Agendar</span>
        </button>
      )}
    </div>
  );
}
