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

export const CONTRACT_REISSUE_CONFIRM_PHRASE = 'REEMITIR CONTRATO';
export const CONTRACT_VOID_CONFIRM_PHRASE = 'INVALIDAR CONTRATO';

export function ReissueContractSecureModal({
  open,
  onOpenChange,
  busy = false,
  mode = 'reissue',
  onConfirm,
}) {
  const [reason, setReason] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [error, setError] = useState('');
  const phrase = mode === 'void' ? CONTRACT_VOID_CONFIRM_PHRASE : CONTRACT_REISSUE_CONFIRM_PHRASE;
  const title = mode === 'void' ? 'Invalidar contrato assinado?' : 'Reemitir contrato?';

  const handleClose = () => {
    if (busy) return;
    setReason('');
    setConfirmPhrase('');
    setError('');
    onOpenChange(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!String(reason || '').trim()) {
      setError('Informe o motivo jurídico.');
      return;
    }
    if (String(confirmPhrase || '').trim().toUpperCase() !== phrase) {
      setError(`Digite exatamente: ${phrase}`);
      return;
    }
    try {
      await onConfirm({ reason, confirmPhrase });
      handleClose();
    } catch (err) {
      setError(err?.message || 'Falha na operação jurídica.');
    }
  };

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <ModalContent size="md" onInteractOutside={(e) => e.preventDefault()}>
        <form id="reissue-contract-secure-form" onSubmit={handleSubmit}>
          <ModalHeader>
            <ModalTitle>{title}</ModalTitle>
            <ModalDescription>
              {mode === 'void'
                ? 'O contrato assinado permanece preservado como evidência. Nenhum PDF, assinatura ou manifesto é apagado. Esta ação não altera o financeiro.'
                : 'Um novo contrato será criado. Assinaturas, manifesto, tokens e artefato final do contrato original não são copiados.'}
            </ModalDescription>
          </ModalHeader>
          <ModalBody className="space-y-3">
            {error ? <p className="clinical-inline-error">{error}</p> : null}
            <label className="block text-sm">
              <span className="font-medium">Motivo jurídico</span>
              <textarea
                className="w-full mt-1 border border-[var(--color-border)] rounded-md px-3 py-2 min-h-[80px]"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Confirme digitando: {phrase}</span>
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
              {busy ? 'Processando…' : (mode === 'void' ? 'Confirmar invalidação' : 'Confirmar reemissão')}
            </button>
          </ModalFooter>
        </form>
      </ModalContent>
    </ModalRoot>
  );
}
