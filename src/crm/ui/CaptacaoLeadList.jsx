import { Link } from 'react-router-dom';
import {
  CalendarPlus,
  Clock3,
  Eye,
  Inbox,
  KanbanSquare,
  MessageCircle,
  Phone,
  UserCheck,
} from 'lucide-react';
import {
  LEAD_SOURCE_LABELS,
  LEAD_INTEREST_LABELS,
  buildWhatsAppLink,
} from '../../services/crmService.js';
import { getStatusLabel } from '../../utils/timelineLabels.js';
import { formatPhone } from '../../utils/validators.js';
import Button from '../../components/Button.jsx';

const CONVERTED_BADGE_COLOR = '#16a34a';
const DEFAULT_BADGE_COLOR = '#6366f1';

/** Próxima ação comercial sugerida por estágio do pipeline. */
const NEXT_ACTION_BY_STAGE = {
  novo_lead: { label: 'Ligar agora', icon: Phone },
  contato_realizado: { label: 'Agendar avaliação', icon: CalendarPlus },
  avaliacao_agendada: { label: 'Enviar WhatsApp', icon: MessageCircle },
  avaliacao_realizada: { label: 'Fazer follow-up', icon: Clock3 },
  orcamento_apresentado: { label: 'Fazer follow-up', icon: Clock3 },
  em_negociacao: { label: 'Fazer follow-up', icon: Clock3 },
};

const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    return dateFormat.format(new Date(iso));
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

function LeadCard({ lead, stageColorByKey, userNameById, onConvert }) {
  const isConverted = Boolean(lead.patientId);
  const badgeColor = isConverted
    ? CONVERTED_BADGE_COLOR
    : stageColorByKey[lead.stageKey] || DEFAULT_BADGE_COLOR;
  const badgeLabel = isConverted ? 'Convertido' : getStatusLabel(lead.stageKey) || '—';
  const nextAction = !isConverted ? NEXT_ACTION_BY_STAGE[lead.stageKey] : null;
  const whatsAppLink = lead.phone ? buildWhatsAppLink(lead.phone) : '';
  const responsavel = lead.assignedToUserId
    ? userNameById[lead.assignedToUserId] || '—'
    : '—';

  return (
    <article className="crm-captacao-lead-card">
      <div className="crm-captacao-lead-top">
        <div className="crm-captacao-lead-identity">
          <span className="crm-captacao-lead-avatar" aria-hidden="true">
            {getInitials(lead.name)}
          </span>
          <div className="crm-captacao-lead-names">
            <strong className="crm-captacao-lead-name">{lead.name || '—'}</strong>
            <span className="crm-captacao-lead-phone">
              {lead.phone ? formatPhone(lead.phone) : 'Sem telefone'}
            </span>
          </div>
        </div>
        <span className="crm-captacao-badge" style={{ '--badge-color': badgeColor }}>
          {badgeLabel}
        </span>
      </div>

      <dl className="crm-captacao-lead-meta">
        <div>
          <dt>Origem</dt>
          <dd>{LEAD_SOURCE_LABELS[lead.source] || lead.source || '—'}</dd>
        </div>
        <div>
          <dt>Interesse</dt>
          <dd>{LEAD_INTEREST_LABELS[lead.interest] || lead.interest || '—'}</dd>
        </div>
        <div>
          <dt>Cadastro</dt>
          <dd>{formatDate(lead.createdAt)}</dd>
        </div>
        <div>
          <dt>Responsável</dt>
          <dd>{responsavel}</dd>
        </div>
      </dl>

      {nextAction && (
        <p className="crm-captacao-next-action">
          <nextAction.icon size={14} aria-hidden="true" />
          <span>Próxima ação sugerida: <strong>{nextAction.label}</strong></span>
        </p>
      )}

      <div className="crm-captacao-lead-actions">
        <Link to={`/crm/leads/${lead.id}`} className="crm-captacao-action">
          <Eye size={14} /> Ver detalhes
        </Link>
        {whatsAppLink && (
          <a
            href={whatsAppLink}
            target="_blank"
            rel="noopener noreferrer"
            className="crm-captacao-action crm-captacao-action--whatsapp"
          >
            <MessageCircle size={14} /> WhatsApp
          </a>
        )}
        <Link to="/crm/pipeline" className="crm-captacao-action">
          <KanbanSquare size={14} /> Pipeline
        </Link>
        {!isConverted && (
          <button
            type="button"
            className="crm-captacao-action crm-captacao-action--convert"
            onClick={() => onConvert(lead)}
          >
            <UserCheck size={14} /> Converter em paciente
          </button>
        )}
      </div>
    </article>
  );
}

/**
 * Lista dos últimos leads captados em cards responsivos (sem scroll horizontal).
 * @param {Object} props
 * @param {Array} props.leads - Leads recentes (já ordenados)
 * @param {number} props.totalCount - Total de leads cadastrados
 * @param {Array} props.stages - Estágios do pipeline (cores dos badges)
 * @param {Array} props.users - Usuários (nome do responsável)
 * @param {(lead: Object) => void} props.onConvert - Abre modal de conversão
 * @param {() => void} props.onRegisterFirst - Foca o formulário (empty state)
 */
export function CaptacaoLeadList({ leads, totalCount, stages, users, onConvert, onRegisterFirst }) {
  const stageColorByKey = Object.fromEntries(stages.map((s) => [s.key, s.color]));
  const userNameById = Object.fromEntries(users.map((u) => [u.id, u.name || u.id]));

  return (
    <section className="crm-captacao-card crm-captacao-list-section" aria-labelledby="captacao-list-title">
      <div className="crm-captacao-list-header">
        <h2 id="captacao-list-title" className="crm-captacao-card-title">
          <span className="crm-captacao-card-title-icon"><Inbox size={18} /></span>
          Últimos leads captados
        </h2>
        {totalCount > 0 && (
          <Link to="/crm/leads" className="crm-captacao-see-all">
            Ver todos ({totalCount})
          </Link>
        )}
      </div>

      {leads.length === 0 ? (
        <div className="crm-captacao-empty">
          <span className="crm-captacao-empty-icon" aria-hidden="true">
            <Inbox size={32} />
          </span>
          <h3>Nenhum lead cadastrado ainda</h3>
          <p>Cadastre o primeiro lead para iniciar o acompanhamento comercial.</p>
          <Button type="button" variant="primary" onClick={onRegisterFirst}>
            Cadastrar lead
          </Button>
        </div>
      ) : (
        <div className="crm-captacao-lead-grid">
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              stageColorByKey={stageColorByKey}
              userNameById={userNameById}
              onConvert={onConvert}
            />
          ))}
        </div>
      )}
    </section>
  );
}
