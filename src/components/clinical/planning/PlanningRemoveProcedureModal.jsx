import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '../../ui/Modal.jsx';

/**
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   mode: 'confirm' | 'blocked',
 *   procedureName?: string,
 *   isApprovedBudget?: boolean,
 *   blockReason?: 'signed' | 'locked',
 *   busy?: boolean,
 *   onConfirm?: () => void,
 * }} props
 */
export function PlanningRemoveProcedureModal({
  open,
  onOpenChange,
  mode = 'confirm',
  procedureName = '',
  isApprovedBudget = false,
  blockReason = 'signed',
  busy = false,
  onConfirm,
}) {
  const handleClose = () => onOpenChange(false);

  if (mode === 'blocked') {
    return (
      <ModalRoot open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>Remoção não permitida</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <p className="planning-remove-modal-text">
              {blockReason === 'locked'
                ? 'Registro bloqueado por contrato gerado. Para alterar procedimentos, crie um novo orçamento.'
                : 'Não é possível remover procedimentos de um contrato já assinado.'}
            </p>
          </ModalBody>
          <ModalFooter>
            <button type="button" className="button primary" onClick={handleClose}>
              Entendi
            </button>
          </ModalFooter>
        </ModalContent>
      </ModalRoot>
    );
  }

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next && !busy) handleClose(); }}>
      <ModalContent size="sm" onInteractOutside={(e) => { if (busy) e.preventDefault(); }}>
        <ModalHeader>
          <ModalTitle>Remover procedimento?</ModalTitle>
          <ModalDescription>
            Você está prestes a remover:
          </ModalDescription>
        </ModalHeader>
        <ModalBody className="space-y-3">
          <p className="planning-remove-modal-procedure">{procedureName}</p>
          {isApprovedBudget ? (
            <div className="planning-remove-modal-warning" role="alert">
              <strong>Este procedimento faz parte de um orçamento aprovado.</strong>
              <p>
                O orçamento será recalculado e voltará para negociação. A condição de pagamento
                escolhida será desfeita e o contrato vinculado precisará ser gerado novamente.
              </p>
            </div>
          ) : (
            <p className="planning-remove-modal-text">
              Esta ação atualizará automaticamente o planejamento e o orçamento vinculado.
            </p>
          )}
        </ModalBody>
        <ModalFooter className="flex flex-wrap gap-2 justify-end">
          <button type="button" className="button secondary" onClick={handleClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="button danger"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy
              ? 'Removendo…'
              : (isApprovedBudget ? 'Remover e recalcular orçamento' : 'Remover procedimento')}
          </button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
