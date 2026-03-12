/**
 * Card de chamado de suporte para listagem.
 */
import { SUPPORT_CATEGORIES, SUPPORT_STATUS } from '../../services/supportTicketService.js';

const STATUS_LABELS = {
  [SUPPORT_STATUS.OPEN]: 'Aberto',
  [SUPPORT_STATUS.SCHEDULED]: 'Agendado',
  [SUPPORT_STATUS.CLOSED]: 'Concluído',
  [SUPPORT_STATUS.CANCELLED]: 'Cancelado',
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function getCategoryLabel(value) {
  return SUPPORT_CATEGORIES.find((c) => c.value === value)?.label || value;
}

export default function SupportTicketCard({ ticket, onCancel, onComplete, onRate, tab }) {
  const { protocol, category, description, scheduled_at, status, rating } = ticket;
  const isPending = status === SUPPORT_STATUS.OPEN || status === SUPPORT_STATUS.SCHEDULED;
  const isClosed = status === SUPPORT_STATUS.CLOSED;

  return (
    <div className="support-ticket-card">
      <div className="support-ticket-card-header">
        <span className="support-ticket-card-protocol">{protocol}</span>
        <span className={`support-ticket-card-status status-${status}`}>
          {STATUS_LABELS[status] || status}
        </span>
      </div>
      <div className="support-ticket-card-body">
        <p className="support-ticket-card-category">{getCategoryLabel(category)}</p>
        <p className="support-ticket-card-description">
          {(description || '').slice(0, 120)}
          {(description || '').length > 120 ? '…' : ''}
        </p>
        <p className="support-ticket-card-date">Agendado: {formatDate(scheduled_at)}</p>
        {rating != null && rating > 0 && (
          <p className="support-ticket-card-rating" aria-label={`Avaliação: ${rating} de 5`}>
            {'★'.repeat(rating)}{'☆'.repeat(5 - rating)} ({rating}/5)
          </p>
        )}
      </div>
      <div className="support-ticket-card-actions">
        {isPending && (
          <>
            <button
              type="button"
              className="support-ticket-card-btn support-ticket-card-btn-primary"
              onClick={() => onComplete?.(ticket)}
            >
              Marcar como concluído
            </button>
            <button
              type="button"
              className="support-ticket-card-btn support-ticket-card-btn-danger"
              onClick={() => onCancel?.(ticket)}
            >
              Cancelar
            </button>
          </>
        )}
        {isClosed && !rating && (
          <button
            type="button"
            className="support-ticket-card-btn support-ticket-card-btn-primary"
            onClick={() => onRate?.(ticket)}
          >
            Avaliar
          </button>
        )}
      </div>
    </div>
  );
}
