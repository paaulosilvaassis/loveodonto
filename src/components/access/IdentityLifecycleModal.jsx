import { useEffect, useState } from 'react';
import {
  ModalRoot, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription,
} from '../ui/Modal.jsx';
import Button from '../Button.jsx';
import { Field } from '../Field.jsx';
import { fetchIdentityReasons } from '../../services/identityService.js';

export default function IdentityLifecycleModal({
  open,
  mode = 'deactivate',
  loading = false,
  onClose,
  onConfirm,
}) {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [expectedReturnAt, setExpectedReturnAt] = useState('');
  const [reasons, setReasons] = useState({ disable_reasons: [], reactivation_reasons: [] });

  useEffect(() => {
    if (!open) return;
    fetchIdentityReasons()
      .then((data) => setReasons({
        disable_reasons: data?.disable_reasons || [],
        reactivation_reasons: data?.reactivation_reasons || [],
      }))
      .catch(() => {});
    setReason('');
    setDescription('');
    setExpectedReturnAt('');
  }, [open]);

  const isDeactivate = mode === 'deactivate';
  const options = isDeactivate ? reasons.disable_reasons : reasons.reactivation_reasons;
  const title = isDeactivate ? 'Desativar acesso' : 'Reativar acesso';
  const confirmLabel = isDeactivate ? 'Desativar acesso' : 'Reativar acesso';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason) return;
    onConfirm?.({
      reason,
      reason_description: description.trim(),
      expected_return_at: expectedReturnAt || null,
      suspended: reason === 'suspension',
    });
  };

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
      <ModalContent size="md" onInteractOutside={(e) => e.preventDefault()}>
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
          <ModalDescription>
            {isDeactivate
              ? 'Informe o motivo da desativação. As sessões ativas serão encerradas.'
              : 'Informe o motivo da reativação do acesso.'}
          </ModalDescription>
        </ModalHeader>
        <form id="identity-lifecycle-form" onSubmit={handleSubmit}>
          <ModalBody>
            <Field label="Motivo" required>
              <select value={reason} required onChange={(e) => setReason(e.target.value)}>
                <option value="">Selecione...</option>
                {options.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </Field>
            {isDeactivate ? (
              <Field label="Previsão de retorno">
                <input
                  type="date"
                  value={expectedReturnAt}
                  onChange={(e) => setExpectedReturnAt(e.target.value)}
                />
              </Field>
            ) : null}
            <Field label="Observação">
              <textarea
                rows={3}
                value={description}
                placeholder="Detalhes adicionais (opcional)"
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="identity-lifecycle-form"
              variant="primary"
              loading={loading}
              disabled={!reason || loading}
            >
              {confirmLabel}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </ModalRoot>
  );
}
