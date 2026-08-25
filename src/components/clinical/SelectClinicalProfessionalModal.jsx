import { useMemo, useState } from 'react';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '../ui/Modal.jsx';
import { listEligibleClinicalProfessionals } from '../../contracts/clinicalProfessionalAssignment.js';

export function SelectClinicalProfessionalModal({
  open,
  onOpenChange,
  tenantId = null,
  busy = false,
  onConfirm,
}) {
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const options = useMemo(
    () => (open ? listEligibleClinicalProfessionals({ tenantId }) : []),
    [open, tenantId],
  );

  const handleClose = () => {
    if (busy) return;
    setSelectedId('');
    setError('');
    onOpenChange(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!selectedId) {
      setError('Selecione o profissional clínico.');
      return;
    }
    try {
      await onConfirm(selectedId);
      setSelectedId('');
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || 'Não foi possível vincular o profissional clínico.');
    }
  };

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <ModalContent size="md" data-testid="select-clinical-professional-modal">
        <form onSubmit={handleSubmit}>
          <ModalHeader>
            <ModalTitle>Selecionar profissional clínico</ModalTitle>
            <ModalDescription>
              Escolha o cirurgião-dentista responsável por este atendimento. O operador administrativo não aparece nesta lista.
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            {error ? <p className="clinical-inline-error">{error}</p> : null}
            {options.length === 0 ? (
              <p data-testid="select-clinical-professional-empty">
                Nenhum profissional clínico elegível cadastrado nesta clínica.
              </p>
            ) : (
              <ul className="clinical-professional-picker" data-testid="select-clinical-professional-list">
                {options.map((row) => (
                  <li key={row.collaboratorId}>
                    <label>
                      <input
                        type="radio"
                        name="clinicalProfessionalId"
                        value={row.collaboratorId}
                        checked={selectedId === row.collaboratorId}
                        onChange={() => setSelectedId(row.collaboratorId)}
                        disabled={busy}
                      />
                      <span>
                        <strong>{row.name}</strong>
                        <em>{[row.category, row.specialty].filter(Boolean).join(' · ')}</em>
                        <small>
                          {[row.council, row.councilUf, row.registration].filter(Boolean).join(' ')}
                        </small>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </ModalBody>
          <ModalFooter>
            <button type="button" className="button secondary" onClick={handleClose} disabled={busy}>
              Cancelar
            </button>
            <button
              type="submit"
              className="button primary"
              data-testid="select-clinical-professional-confirm"
              disabled={busy || !selectedId}
            >
              Confirmar
            </button>
          </ModalFooter>
        </form>
      </ModalContent>
    </ModalRoot>
  );
}
