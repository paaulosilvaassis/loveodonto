import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Eye,
  Inbox,
  KanbanSquare,
  MessageCircle,
  PhoneCall,
  XCircle,
} from 'lucide-react';
import Button from '../../components/Button.jsx';
import GradientButton from '../../components/GradientButton.jsx';
import {
  LEAD_SOURCE_LABELS,
  LEAD_INTEREST_LABELS,
  buildWhatsAppLink,
} from '../../services/crmService.js';
import { STAGE_TYPE } from '../../services/crmPipelineStageService.js';
import { getStatusLabel } from '../../utils/timelineLabels.js';
import { formatPhone } from '../../utils/validators.js';

const DEFAULT_STAGE_COLOR = '#6366f1';
const CONVERTED_COLOR = '#16a34a';

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
};

const getInitials = (name = '') => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
};

function LeadIdentity({ lead, onOpenDetails }) {
  return (
    <button
      type="button"
      className="crm-leads-identity"
      onClick={() => onOpenDetails(lead)}
      aria-label={`Abrir perfil de ${lead.name || 'lead'}`}
    >
      <span className="crm-leads-avatar" aria-hidden="true">{getInitials(lead.name)}</span>
      <span className="crm-leads-identity-text">
        <strong>{lead.name || 'Sem nome'}</strong>
        <span>{lead.phone ? formatPhone(lead.phone) : 'Sem telefone'}</span>
      </span>
    </button>
  );
}

function StageBadge({ lead, stageByKey }) {
  const stage = stageByKey[lead.stageKey];
  const converted = Boolean(lead.patientId);
  const color = converted ? CONVERTED_COLOR : stage?.color || DEFAULT_STAGE_COLOR;
  const label = converted ? 'Convertido' : stage?.label || getStatusLabel(lead.stageKey) || '—';
  return (
    <span className="crm-leads-badge" style={{ '--badge-color': color }}>
      {label}
    </span>
  );
}

function TagsList({ lead }) {
  const tags = lead.tagList || [];
  if (!tags.length) return <span className="crm-leads-muted">—</span>;
  return (
    <span className="crm-leads-tags">
      {tags.map((t) => (
        <span key={t.id} className="crm-leads-tag-pill" style={{ '--tag-color': t.color || DEFAULT_STAGE_COLOR }}>
          {t.name}
        </span>
      ))}
    </span>
  );
}

function NextAction({ followUp }) {
  if (!followUp) return <span className="crm-leads-muted">—</span>;
  const status = followUp.overdue ? ' (atrasada)' : followUp.dueToday ? ' (hoje)' : '';
  return (
    <span className={`crm-leads-next-action ${followUp.overdue ? 'is-overdue' : ''}`.trim()}>
      {followUp.type || 'retorno'}
      {followUp.dueAt ? ` · ${formatDate(followUp.dueAt)}` : ''}
      {status}
    </span>
  );
}

function RowActions({ lead, stageByKey, onOpenDetails, onRegisterContact, onConvert, onMarkLost }) {
  const whatsAppUrl = buildWhatsAppLink(lead.phone);
  const isClosed = Boolean(lead.patientId) || stageByKey[lead.stageKey]?.stageType === STAGE_TYPE.LOST;
  return (
    <div className="crm-leads-row-actions" role="group" aria-label={`Ações rápidas de ${lead.name || 'lead'}`}>
      <button
        type="button"
        className="crm-leads-row-action"
        title="Abrir perfil"
        aria-label="Abrir perfil"
        onClick={() => onOpenDetails(lead)}
      >
        <Eye size={15} />
      </button>
      {whatsAppUrl && (
        <a
          href={whatsAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="crm-leads-row-action crm-leads-row-action--whatsapp"
          title="Enviar WhatsApp"
          aria-label="Enviar WhatsApp"
        >
          <MessageCircle size={15} />
        </a>
      )}
      <button
        type="button"
        className="crm-leads-row-action"
        title="Registrar contato"
        aria-label="Registrar contato"
        onClick={() => onRegisterContact(lead)}
      >
        <PhoneCall size={15} />
      </button>
      <Link
        to="/crm/pipeline"
        className="crm-leads-row-action"
        title="Ver no pipeline"
        aria-label="Ver no pipeline"
      >
        <KanbanSquare size={15} />
      </Link>
      {!isClosed && (
        <>
          <button
            type="button"
            className="crm-leads-row-action crm-leads-row-action--success"
            title="Converter em paciente"
            aria-label="Converter em paciente"
            onClick={() => onConvert(lead)}
          >
            <CheckCircle2 size={15} />
          </button>
          <button
            type="button"
            className="crm-leads-row-action crm-leads-row-action--danger"
            title="Marcar como perdido"
            aria-label="Marcar como perdido"
            onClick={() => onMarkLost(lead)}
          >
            <XCircle size={15} />
          </button>
        </>
      )}
    </div>
  );
}

function EmptyState({ hasFilters, onCreateLead, onClearFilters }) {
  return (
    <div className="crm-leads-empty-state">
      <span className="crm-leads-empty-icon" aria-hidden="true"><Inbox size={32} /></span>
      <h3>Nenhum lead encontrado</h3>
      <p>Cadastre seu primeiro lead ou ajuste os filtros para visualizar oportunidades.</p>
      <div className="crm-leads-empty-actions">
        <GradientButton onClick={onCreateLead} ariaLabel="Cadastrar lead">
          Cadastrar lead
        </GradientButton>
        {hasFilters && (
          <Button type="button" variant="secondary" onClick={onClearFilters}>
            Limpar filtros
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Lista de leads em tabela moderna (desktop) e cards (mobile).
 * @param {Object} props
 * @param {Array} props.leads - Leads filtrados (enriquecidos com tagList)
 * @param {Object} props.stageByKey - Fases do pipeline indexadas por key
 * @param {Object} props.usersById - Nome do usuário por id
 * @param {Object} props.nextFollowUpByLeadId - Próximo follow-up pendente por lead
 * @param {boolean} props.hasFilters - Há filtros ativos (empty state)
 */
export function LeadsTable({
  leads,
  stageByKey,
  usersById,
  nextFollowUpByLeadId,
  hasFilters,
  onOpenDetails,
  onRegisterContact,
  onConvert,
  onMarkLost,
  onCreateLead,
  onClearFilters,
}) {
  if (!leads.length) {
    return <EmptyState hasFilters={hasFilters} onCreateLead={onCreateLead} onClearFilters={onClearFilters} />;
  }

  const actionsProps = { stageByKey, onOpenDetails, onRegisterContact, onConvert, onMarkLost };
  const responsibleName = (lead) =>
    lead.assignedToUserId ? usersById[lead.assignedToUserId] || '—' : '—';

  return (
    <div className="crm-leads-card">
      <table className="crm-leads-modern-table">
        <thead>
          <tr>
            <th>Lead</th>
            <th>Origem</th>
            <th>Interesse</th>
            <th>Estágio</th>
            <th>Tags</th>
            <th>Responsável</th>
            <th>Último contato</th>
            <th>Próxima ação</th>
            <th aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id}>
              <td><LeadIdentity lead={lead} onOpenDetails={onOpenDetails} /></td>
              <td>
                <span className="crm-leads-source-badge">
                  {LEAD_SOURCE_LABELS[lead.source] || lead.source || '—'}
                </span>
              </td>
              <td>{LEAD_INTEREST_LABELS[lead.interest] || lead.interest || '—'}</td>
              <td><StageBadge lead={lead} stageByKey={stageByKey} /></td>
              <td><TagsList lead={lead} /></td>
              <td>{responsibleName(lead)}</td>
              <td>{formatDate(lead.lastContactAt)}</td>
              <td><NextAction followUp={nextFollowUpByLeadId[lead.id]} /></td>
              <td><RowActions lead={lead} {...actionsProps} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="crm-leads-mobile-list">
        {leads.map((lead) => (
          <article key={lead.id} className="crm-leads-mobile-card">
            <div className="crm-leads-mobile-top">
              <LeadIdentity lead={lead} onOpenDetails={onOpenDetails} />
              <StageBadge lead={lead} stageByKey={stageByKey} />
            </div>
            <dl className="crm-leads-mobile-meta">
              <div>
                <dt>Origem</dt>
                <dd>{LEAD_SOURCE_LABELS[lead.source] || lead.source || '—'}</dd>
              </div>
              <div>
                <dt>Interesse</dt>
                <dd>{LEAD_INTEREST_LABELS[lead.interest] || lead.interest || '—'}</dd>
              </div>
              <div>
                <dt>Responsável</dt>
                <dd>{responsibleName(lead)}</dd>
              </div>
              <div>
                <dt>Últ. contato</dt>
                <dd>{formatDate(lead.lastContactAt)}</dd>
              </div>
            </dl>
            <div className="crm-leads-mobile-footer">
              <NextAction followUp={nextFollowUpByLeadId[lead.id]} />
              <TagsList lead={lead} />
            </div>
            <RowActions lead={lead} {...actionsProps} />
          </article>
        ))}
      </div>
    </div>
  );
}
