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

function croLabel(row) {
  if (row.registrationDisplay) return row.registrationDisplay;
  const parts = [row.council || 'CRO', row.councilUf, row.registration].filter(Boolean);
  if (parts.length < 2) return parts.join(' ');
  return `${parts[0]}-${parts[1]} ${parts[2] || ''}`.trim();
}

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
              Selecione o cirurgião-dentista responsável por este atendimento.
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
                  <li key={row.collaboratorId} className={selectedId === row.collaboratorId ? 'is-selected' : ''}>
                    <div>
                      <strong>{row.name}</strong>
                      <em>{row.specialty || row.category}</em>
                      <small>{croLabel(row)}</small>
                    </div>
                    <button
                      type="button"
                      className="button secondary"
                      data-testid={`select-clinical-professional-option-${row.collaboratorId}`}
                      disabled={busy}
                      onClick={() => setSelectedId(row.collaboratorId)}
                    >
                      Selecionar
                    </button>
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
              Confirmar profissional
            </button>
          </ModalFooter>
        </form>
      </ModalContent>
    </ModalRoot>
  );
}
