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

const COPY = {
  resend: {
    title: 'Reenviar acesso',
    description: 'O mesmo acesso válido será reenviado. O prazo de validade não será alterado.',
    submit: 'Reenviar acesso',
    pending: 'Reenviando…',
    requireReason: false,
    tone: 'normal',
  },
  rotate: {
    title: 'Substituir link de assinatura?',
    description: 'O link atual deixará de funcionar e um novo link será criado. O prazo do request original não será ampliado.',
    submit: 'Substituir link de assinatura',
    pending: 'Substituindo…',
    requireReason: true,
    tone: 'sensitive',
  },
  revoke: {
    title: 'Revogar acesso',
    description: 'O acesso remoto deixará de funcionar. O contrato e as evidências permanecem.',
    submit: 'Revogar acesso',
    pending: 'Revogando…',
    requireReason: true,
    tone: 'danger',
  },
  replace: {
    title: 'Gerar novo acesso de assinatura?',
    description: 'O acesso anterior continuará revogado e não poderá ser utilizado. Um novo request, link e token serão criados para este signatário.',
    submit: 'Gerar novo acesso',
    pending: 'Gerando…',
    requireReason: true,
    tone: 'sensitive',
  },
};

export function SigningAccessSecureModal({
  open,
  mode = 'resend',
  busy = false,
  onOpenChange,
  onConfirm,
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const copy = COPY[mode] || COPY.resend;

  const handleClose = () => {
    if (busy) return;
    setReason('');
    setError('');
    onOpenChange(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (copy.requireReason && !String(reason || '').trim()) {
      setError('Informe o motivo jurídico para continuar.');
      return;
    }
    try {
      await onConfirm({ reason });
      handleClose();
    } catch (err) {
      setError(err?.message || 'Não foi possível concluir a ação.');
    }
  };

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <ModalContent
        size="md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
      >
        <form onSubmit={handleSubmit}>
          <ModalHeader>
            <ModalTitle>{copy.title}</ModalTitle>
            <ModalDescription>{copy.description}</ModalDescription>
          </ModalHeader>
          <ModalBody className="space-y-3">
            {error ? <p className="clinical-inline-error" role="alert">{error}</p> : null}
            {copy.requireReason ? (
              <label className="block text-sm">
                <span className="font-medium">Motivo</span>
                <textarea
                  className="w-full mt-1 border border-[var(--color-border)] rounded-md px-3 py-2 min-h-[80px]"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                />
              </label>
            ) : null}
          </ModalBody>
          <ModalFooter className="flex flex-wrap gap-2 justify-end">
            <button type="button" className="button secondary" onClick={handleClose} disabled={busy}>
              Voltar
            </button>
            <button
              type="submit"
              className={copy.tone === 'danger' ? 'button danger' : 'button primary'}
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? copy.pending : copy.submit}
            </button>
          </ModalFooter>
        </form>
      </ModalContent>
    </ModalRoot>
  );
}
