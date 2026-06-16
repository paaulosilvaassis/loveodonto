import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '../../ui/Modal.jsx';

export function CreateNewBudgetModal({
  open,
  onOpenChange,
  busy = false,
  onConfirm,
}) {
  const handleClose = () => {
    if (busy) return;
    onOpenChange(false);
  };

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>Criar novo orçamento</ModalTitle>
          <ModalDescription>
            O orçamento atual será arquivado no histórico. O planejamento será reiniciado do zero
            em elaboração, sem importar procedimentos automaticamente.
          </ModalDescription>
        </ModalHeader>
        <ModalFooter className="flex flex-wrap gap-2 justify-end">
          <button type="button" className="button secondary" onClick={handleClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => onConfirm()}
          >
            {busy ? 'Criando…' : 'Criar novo orçamento'}
          </button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
