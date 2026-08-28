import { useState } from 'react';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '../../ui/Modal.jsx';
import { CONTRACT_CANCEL_CONFIRM_PHRASE } from '../../../services/cancelContractSecureService.js';

const FINANCIAL_OPTIONS = [
  { value: 'keep', label: 'Manter financeiro inalterado' },
  { value: 'cancel_future', label: 'Cancelar parcelas futuras' },
  { value: 'refund', label: 'Estornar valores (ajuste manual)' },
  { value: 'manual', label: 'Gerar ajuste manual posteriormente' },
];

export function CancelContractSecureModal({
  open,
  onOpenChange,
  busy = false,
  onConfirm,
  variant = 'cancel',
}) {
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [financialAction, setFinancialAction] = useState('keep');
  const [error, setError] = useState('');

  const handleClose = () => {
    if (busy) return;
    setPassword('');
    setReason('');
    setConfirmPhrase('');
    setFinancialAction('keep');
    setError('');
    onOpenChange(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await onConfirm({ password, reason, confirmPhrase, financialAction });
      handleClose();
    } catch (err) {
      setError(err?.message || 'Falha ao cancelar contrato.');
    }
  };

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <ModalContent size="md" onInteractOutside={(e) => e.preventDefault()}>
        <form id="cancel-contract-secure-form" onSubmit={handleSubmit}>
          <ModalHeader>
            <ModalTitle>
              {variant === 'abort' ? 'Cancelar cerimônia/contrato?' : 'Cancelar contrato?'}
            </ModalTitle>
            <ModalDescription>
              {variant === 'abort'
                ? 'As assinaturas e evidências já coletadas permanecem preservadas. Nenhum signatário pendente poderá concluir depois. Esta ação é sensível e ficará registrada no histórico de auditoria.'
                : 'Esta ação é sensível e ficará registrada no histórico de auditoria.'}
            </ModalDescription>
          </ModalHeader>
          <ModalBody className="space-y-3">
            {error ? <p className="clinical-inline-error">{error}</p> : null}
            <label className="block text-sm">
              <span className="font-medium">Senha do administrador</span>
              <input
                type="password"
                className="w-full mt-1 border border-[var(--color-border)] rounded-md px-3 py-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Motivo do cancelamento</span>
              <textarea
                className="w-full mt-1 border border-[var(--color-border)] rounded-md px-3 py-2 min-h-[80px]"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </label>
            <p className="text-xs text-[var(--color-muted)]">
              Nenhuma alteração financeira automática é aplicada. A opção abaixo registra apenas a intenção operacional.
            </p>
            <label className="block text-sm">
              <span className="font-medium">Financeiro vinculado</span>
              <select
                className="w-full mt-1 border border-[var(--color-border)] rounded-md px-3 py-2"
                value={financialAction}
                onChange={(e) => setFinancialAction(e.target.value)}
              >
                {FINANCIAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">
                Confirme digitando: {CONTRACT_CANCEL_CONFIRM_PHRASE}
              </span>
              <input
                type="text"
                className="w-full mt-1 border border-[var(--color-border)] rounded-md px-3 py-2 uppercase"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                required
              />
            </label>
          </ModalBody>
          <ModalFooter className="flex flex-wrap gap-2 justify-end">
            <button type="button" className="button secondary" onClick={handleClose} disabled={busy}>
              Voltar
            </button>
            <button type="submit" className="button danger" disabled={busy}>
              {busy ? 'Cancelando…' : 'Confirmar cancelamento'}
            </button>
          </ModalFooter>
        </form>
      </ModalContent>
    </ModalRoot>
  );
}
