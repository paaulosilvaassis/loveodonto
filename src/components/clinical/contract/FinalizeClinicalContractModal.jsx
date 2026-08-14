import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '../../ui/Modal.jsx';

export function FinalizeClinicalContractModal({
  open,
  onOpenChange,
  busy = false,
  contractNumber = '',
  error = '',
  onConfirm,
}) {
  const handleClose = () => {
    if (busy) return;
    onOpenChange(false);
  };

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <ModalContent size="md" data-testid="finalize-clinical-contract-modal">
        <ModalHeader>
          <ModalTitle>Finalizar contrato?</ModalTitle>
          <ModalDescription>
            {contractNumber ? `${contractNumber} sairá de edição e ficará juridicamente finalizado.` : 'O contrato sairá de edição e ficará juridicamente finalizado.'}
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          {error ? <p className="clinical-inline-error">{error}</p> : null}
          <p>
            Depois de finalizar, o conteúdo deste contrato não poderá mais ser editado.
            Documentos e Assinatura serão reavaliados. Nenhuma assinatura será enviada automaticamente.
          </p>
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={handleClose}
          >
            Voltar
          </button>
          <button
            type="button"
            className="button primary"
            data-testid="finalize-clinical-contract-confirm"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Finalizando…' : 'Finalizar contrato'}
          </button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
