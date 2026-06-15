import {
  ModalRoot, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle,
} from '../../ui/Modal.jsx';
import { ClinicalBtn } from '../ClinicalStageShell.jsx';

export function BudgetValidityModal({ open, onClose, value, onSave, readOnly }) {
  const handleSubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    const date = form.elements.validity?.value;
    if (date) onSave(date);
    onClose();
  };

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>Editar validade</ModalTitle>
        </ModalHeader>
        <form id="budget-validity-form" onSubmit={handleSubmit}>
          <ModalBody>
            <label className="budget-tab-field">
              <span>Validade do orçamento</span>
              <input
                type="date"
                name="validity"
                defaultValue={value || ''}
                disabled={readOnly}
                required
              />
            </label>
          </ModalBody>
          {!readOnly ? (
            <ModalFooter>
              <ClinicalBtn variant="ghost" type="button" onClick={onClose}>
                Cancelar
              </ClinicalBtn>
              <ClinicalBtn variant="primary" type="submit">
                Salvar
              </ClinicalBtn>
            </ModalFooter>
          ) : null}
        </form>
      </ModalContent>
    </ModalRoot>
  );
}
