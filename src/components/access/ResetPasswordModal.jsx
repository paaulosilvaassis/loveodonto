import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '../ui/Modal.jsx';
import Button from '../Button.jsx';

export default function ResetPasswordModal({
  open,
  email,
  displayName,
  loading = false,
  onClose,
  onConfirm,
}) {
  const safeEmail = String(email || '').trim().toLowerCase();

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContent size="md" onInteractOutside={(e) => e.preventDefault()}>
        <ModalHeader>
          <ModalTitle>Redefinir senha do colaborador</ModalTitle>
          <ModalDescription>
            {displayName ? `${displayName} receberá um link seguro por e-mail.` : 'Um link seguro será enviado por e-mail.'}
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <p className="cr-reset-modal__text">
            Será enviado um e-mail para:
          </p>
          <p className="cr-reset-modal__email">
            <strong>{safeEmail || '—'}</strong>
          </p>
          <p className="muted cr-reset-modal__hint">
            com um link seguro para criação de uma nova senha.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" loading={loading} disabled={!safeEmail || loading} onClick={onConfirm}>
            Enviar e-mail
          </Button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
