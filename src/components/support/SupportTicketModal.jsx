/**
 * Modal para abrir chamado de suporte Love Odonto.
 * Renderizado via Portal em document.body para escapar stacking context e ficar acima de header/sidebar.
 */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import SchedulePicker from './SchedulePicker.jsx';
import {
  createTicket,
  getTicketsByUser,
  SUPPORT_CATEGORIES,
} from '../../services/supportTicketService.js';

const MIN_DESCRIPTION_LENGTH = 20;
const DESCRIPTION_MAX_LENGTH = 2000;

export default function SupportTicketModal({ open, onClose, userId, clinicId, onSuccess }) {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const firstFocusRef = useRef(null);

  useEffect(() => {
    if (open) {
      setCategory('');
      setDescription('');
      setScheduledAt(null);
      setError(null);
      setSubmitting(false);
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => firstFocusRef.current?.focus());
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    if (!category) {
      setError('Selecione uma categoria.');
      return;
    }
    const desc = description.trim();
    if (desc.length < MIN_DESCRIPTION_LENGTH) {
      setError('A descrição deve ter no mínimo 20 caracteres.');
      return;
    }
    if (!scheduledAt) {
      setError('Selecione um dia e horário.');
      return;
    }

    if (!userId) {
      setError('Sessão inválida. Faça login novamente.');
      return;
    }

    const tickets = getTicketsByUser(userId);
    const hasDuplicate = tickets.some(
      (t) => t.status !== 'closed' && t.scheduled_at === scheduledAt
    );
    if (hasDuplicate) {
      setError('Você já possui um chamado aberto com este horário.');
      return;
    }

    setSubmitting(true);
    try {
      const ticket = createTicket(
        { category, description: desc, scheduledAt },
        userId,
        clinicId
      );
      setCategory('');
      setDescription('');
      setScheduledAt(null);
      if (onSuccess) onSuccess(ticket);
      onClose();
    } catch (err) {
      const msg = err && err.message ? err.message : 'Erro ao enviar chamado.';
      setError(msg);
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
      aria-labelledby="support-ticket-modal-title"
      aria-describedby="support-ticket-modal-desc"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="support-ticket-modal" onClick={(e) => e.stopPropagation()}>
        <header className="support-ticket-modal-header">
          <h2 id="support-ticket-modal-title">Abrir Chamado</h2>
          <button
            type="button"
            className="support-ticket-modal-close"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        <p id="support-ticket-modal-desc" className="support-ticket-modal-subtitle">
          Descreva sua dificuldade e agende um horário para atendimento.
        </p>

        <form onSubmit={handleSubmit} className="support-ticket-modal-form">
          <div className="support-ticket-field">
            <label htmlFor="support-category">Categoria</label>
            <select
              id="support-category"
              ref={firstFocusRef}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              disabled={submitting}
              aria-required="true"
            >
              <option value="">Selecione...</option>
              {SUPPORT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="support-ticket-field">
            <label htmlFor="support-description">
              Descrição (mín. 20 caracteres)
            </label>
            <textarea
              id="support-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              minLength={MIN_DESCRIPTION_LENGTH}
              maxLength={DESCRIPTION_MAX_LENGTH}
              placeholder="Descreva sua dúvida ou dificuldade..."
              required
              disabled={submitting}
              aria-required="true"
            />
            <span className="support-ticket-char-count">
              {description.length} / {DESCRIPTION_MAX_LENGTH}
            </span>
          </div>

          <div className="support-ticket-field">
            <SchedulePicker
              value={scheduledAt}
              onChange={setScheduledAt}
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
              {submitting ? 'Enviando…' : 'Enviar Chamado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
