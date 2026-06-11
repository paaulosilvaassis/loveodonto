import { useMemo } from 'react';
import {
  Calendar,
  CheckCircle2,
  MessageCircle,
  PhoneCall,
  XCircle,
} from 'lucide-react';
import {
  LEAD_SOURCE_LABELS,
  LEAD_INTEREST_LABELS,
  buildWhatsAppLink,
  listFollowUps,
} from '../../services/crmService.js';
import { formatCurrencyBRL } from '../../utils/currency.js';
import { formatPhone } from '../../utils/validators.js';
import { STAGE_TYPE } from '../../services/crmPipelineStageService.js';

const MIME_LEAD_ID = 'text/plain';
const MIME_LEAD_STAGE = 'application/x-lead-stage';

const formatShortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : null;

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

function resolveBadge(lead, stage) {
  if (lead.patientId) return { label: 'Convertido', tone: 'success' };
  if (stage?.stageType === STAGE_TYPE.LOST) return { label: 'Perdido', tone: 'danger' };
  if (lead.priority === 'alta') return { label: 'Prioridade alta', tone: 'danger' };
  if (lead.priority === 'media') return { label: 'Prioridade média', tone: 'warning' };
  return null;
}

/**
 * Card de lead no Kanban. Draggable; clique abre detalhes; ações rápidas no rodapé.
 * Alertas: follow-up atrasado (borda vermelha) ou vencendo hoje (amarela).
 */
export function LeadCard({
  lead,
  stage,
  usersById = {},
  refreshToken = 0,
  onOpenDetails,
  onRegisterContact,
  onSchedule,
  onConvert,
  onMarkLost,
}) {
  const sourceLabel = LEAD_SOURCE_LABELS[lead.source] || lead.source || '—';
  const interestLabel = lead.interest ? (LEAD_INTEREST_LABELS[lead.interest] || lead.interest) : null;
  const responsibleName = lead.assignedToUserId
    ? usersById[lead.assignedToUserId] || 'Responsável'
    : null;
  const lastContact = formatShortDate(lead.lastContactAt || lead.updatedAt);
  const whatsAppUrl = buildWhatsAppLink(lead.phone);
  const badge = resolveBadge(lead, stage);
  const isClosed = Boolean(lead.patientId) || stage?.stageType === STAGE_TYPE.LOST;

  const nextFollowUp = useMemo(() => {
    const pending = listFollowUps({ leadId: lead.id, pending: true });
    if (!pending.length) return null;
    const first = pending[0];
    const today = startOfDay(new Date()).getTime();
    const due = first.dueAt ? startOfDay(first.dueAt).getTime() : null;
    return {
      ...first,
      overdue: due != null && due < today,
      dueToday: due === today,
    };
  }, [lead.id, lead.updatedAt, refreshToken]);

  const alertClass = nextFollowUp?.overdue
    ? 'crm-pipeline-card--overdue'
    : nextFollowUp?.dueToday
      ? 'crm-pipeline-card--due-today'
      : '';

  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(MIME_LEAD_ID, lead.id);
    e.dataTransfer.setData(MIME_LEAD_STAGE, stage?.key ?? '');
  };

  const stopAnd = (fn) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn?.(lead);
  };

  return (
    <div
      className={`crm-pipeline-card ${alertClass}`.trim()}
      data-lead-id={lead.id}
      data-stage-key={stage?.key}
      draggable
      onDragStart={handleDragStart}
    >
      <button
        type="button"
        className="crm-pipeline-card-main"
        onClick={() => onOpenDetails?.(lead)}
        aria-label={`Abrir detalhes de ${lead.name || 'lead'}`}
      >
        <div className="crm-pipeline-card-top">
          <span className="crm-pipeline-card-name">{lead.name || 'Sem nome'}</span>
          {badge && (
            <span className={`crm-pipeline-card-badge crm-pipeline-card-badge--${badge.tone}`}>
              {badge.label}
            </span>
          )}
        </div>
        <div className="crm-pipeline-card-meta">
          {lead.phone && <span>{formatPhone(lead.phone)}</span>}
          {interestLabel && <span>{interestLabel}</span>}
          <span>{sourceLabel}</span>
        </div>
        {(responsibleName || lastContact) && (
          <div className="crm-pipeline-card-meta crm-pipeline-card-meta--muted">
            {responsibleName && <span>Resp.: {responsibleName}</span>}
            {lastContact && <span>Últ. interação: {lastContact}</span>}
          </div>
        )}
        {nextFollowUp && (
          <div
            className={`crm-pipeline-card-next ${nextFollowUp.overdue ? 'is-overdue' : ''}`.trim()}
          >
            Próxima ação: {nextFollowUp.type || 'retorno'}
            {nextFollowUp.dueAt ? ` · ${formatShortDate(nextFollowUp.dueAt)}` : ''}
            {nextFollowUp.overdue ? ' (atrasada)' : nextFollowUp.dueToday ? ' (hoje)' : ''}
          </div>
        )}
        {Number(lead.estimatedValue) > 0 && (
          <div className="crm-pipeline-card-value">{formatCurrencyBRL(lead.estimatedValue)}</div>
        )}
      </button>

      <div className="crm-pipeline-card-actions" role="group" aria-label="Ações rápidas do lead">
        {whatsAppUrl && (
          <a
            href={whatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="crm-pipeline-card-action"
            title="Enviar WhatsApp"
            aria-label="Enviar WhatsApp"
            onClick={(e) => e.stopPropagation()}
          >
            <MessageCircle size={14} />
          </a>
        )}
        <button
          type="button"
          className="crm-pipeline-card-action"
          title="Registrar contato"
          aria-label="Registrar contato"
          onClick={stopAnd(onRegisterContact)}
        >
          <PhoneCall size={14} />
        </button>
        <button
          type="button"
          className="crm-pipeline-card-action"
          title="Agendar avaliação"
          aria-label="Agendar avaliação"
          onClick={stopAnd(onSchedule)}
        >
          <Calendar size={14} />
        </button>
        {!isClosed && (
          <>
            <button
              type="button"
              className="crm-pipeline-card-action crm-pipeline-card-action--success"
              title="Converter em paciente"
              aria-label="Converter em paciente"
              onClick={stopAnd(onConvert)}
            >
              <CheckCircle2 size={14} />
            </button>
            <button
              type="button"
              className="crm-pipeline-card-action crm-pipeline-card-action--danger"
              title="Marcar como perdido"
              aria-label="Marcar como perdido"
              onClick={stopAnd(onMarkLost)}
            >
              <XCircle size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
