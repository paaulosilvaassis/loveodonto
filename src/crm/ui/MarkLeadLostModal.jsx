import { useEffect, useState } from 'react';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '../../components/ui/Modal.jsx';
import Button from '../../components/Button.jsx';
import { listLossReasonsForTenant } from '../../services/crmSettingsService.js';

const FALLBACK_REASONS = ['Preço', 'Sem interesse', 'Não respondeu', 'Fechou com concorrente', 'Outro'];

/**
 * Confirma a marcação de um lead como perdido, com motivo opcional.
 */
export function MarkLeadLostModal({ open, onClose, lead, onConfirm, tenantId = '' }) {
  const suggestedReasons = [...listLossReasonsForTenant(tenantId), 'Outro'].filter(
    (v, i, arr) => arr.indexOf(v) === i
  );
  const reasons = suggestedReasons.length ? suggestedReasons : [...FALLBACK_REASONS];
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setCustomReason('');
      setSubmitting(false);
    }
  }, [open]);

  const handleConfirm = () => {
    setSubmitting(true);
    const finalReason = reason === 'Outro' ? customReason.trim() : reason;
    try {
      onConfirm?.(finalReason || null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>Marcar lead como perdido</ModalTitle>
          <ModalDescription>
            {lead?.name ? `O lead “${lead.name}” será movido para a fase de perda.` : 'O lead será movido para a fase de perda.'}
            {' '}O histórico é preservado e você pode reativá-lo depois.
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <div className="form-field">
            <label htmlFor="lost-reason">Motivo da perda</label>
            <select
              id="lost-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">Não informar</option>
              {reasons.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          {reason === 'Outro' && (
            <div className="form-field">
              <label htmlFor="lost-reason-custom">Descreva o motivo</label>
              <textarea
                id="lost-reason-custom"
                rows={2}
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Ex.: mudou de cidade"
              />
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" variant="danger" loading={submitting} onClick={handleConfirm}>
            Marcar como perdido
          </Button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
