/**
 * Modal para avaliar chamado concluído (estrelas 1-5 + comentário).
 */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Star } from 'lucide-react';

export default function SupportRatingModal({ open, ticket, onClose, onSubmit }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const firstFocusRef = useRef(null);

  useEffect(() => {
    if (open) {
      setRating(0);
      setHoverRating(0);
      setFeedback('');
      setError(null);
      setSubmitting(false);
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => firstFocusRef.current?.focus());
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open, ticket?.id]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);
    if (rating < 1 || rating > 5) {
      setError('Selecione uma avaliação de 1 a 5 estrelas.');
      return;
    }
    setSubmitting(true);
    try {
      onSubmit?.(ticket.id, rating, feedback);
      onClose();
    } catch (err) {
      setError(err?.message || 'Erro ao enviar avaliação.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const modalContent = (
    <div
      className="support-ticket-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-rating-modal-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="support-ticket-modal support-rating-modal" onClick={(e) => e.stopPropagation()}>
        <header className="support-ticket-modal-header">
          <h2 id="support-rating-modal-title">Avaliar Atendimento</h2>
          <button
            type="button"
            className="support-ticket-modal-close"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <p className="support-ticket-modal-subtitle">
          Como foi o atendimento? Sua opinião nos ajuda a melhorar.
        </p>
        <form onSubmit={handleSubmit} className="support-ticket-modal-form">
          <div className="support-ticket-field">
            <label id="rating-label">Avaliação (1 a 5 estrelas)</label>
            <div
              className="support-rating-stars"
            role="group"
            aria-labelledby="rating-label"
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                ref={i === 1 ? firstFocusRef : null}
                className="support-rating-star-btn"
                onClick={() => setRating(i)}
                onMouseEnter={() => setHoverRating(i)}
                onMouseLeave={() => setHoverRating(0)}
                aria-label={`${i} estrela${i > 1 ? 's' : ''}`}
                aria-pressed={rating >= i}
              >
                <Star
                  size={32}
                  fill={i <= (hoverRating || rating) ? '#f59e0b' : 'none'}
                  stroke={i <= (hoverRating || rating) ? '#f59e0b' : '#d1d5db'}
                  strokeWidth={2}
                />
              </button>
            ))}
          </div>
          </div>
          <div className="support-ticket-field">
            <label htmlFor="support-feedback">Comentário (opcional)</label>
            <textarea
              id="support-feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              placeholder="Conte como foi sua experiência..."
              disabled={submitting}
            />
          </div>
          {error && (
            <p className="support-ticket-error" role="alert">
              {error}
            </p>
          )}
          <div className="support-ticket-modal-actions">
            <button type="button" className="support-ticket-btn secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="support-ticket-btn primary" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Enviar Avaliação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
