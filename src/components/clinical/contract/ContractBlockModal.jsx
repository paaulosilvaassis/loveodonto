import {
  ModalRoot, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle,
} from '../../ui/Modal.jsx';
import { ClinicalBtn } from '../ClinicalStageShell.jsx';

export function ContractBlockModal({
  open,
  onClose,
  onFillPatient,
  pendingFields = [],
  fieldsMap = {},
  title = 'Contrato bloqueado',
  description = 'Não é possível gerar o contrato enquanto faltarem informações importantes do cadastro.',
}) {
  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <p className="clinical-contract-block-desc">{description}</p>
          {pendingFields.length > 0 ? (
            <>
              <p className="clinical-contract-block-label">Campos críticos faltando:</p>
              <ul className="clinical-contract-block-list">
                {pendingFields.map((key) => (
                  <li key={key}>{fieldsMap[key] || key}</li>
                ))}
              </ul>
            </>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <ClinicalBtn variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </ClinicalBtn>
          {onFillPatient ? (
            <ClinicalBtn variant="primary" type="button" onClick={onFillPatient}>
              Preencher cadastro
            </ClinicalBtn>
          ) : null}
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
