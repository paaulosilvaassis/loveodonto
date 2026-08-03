import { CheckCircle2 } from 'lucide-react';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '../../ui/Modal.jsx';
import { formatCurrencyBRL } from '../../../utils/currency.js';
import { formatPaymentOptionLabel } from './budgetUtils.js';

export function BudgetApprovalModal({
  open,
  onClose,
  onConfirm,
  patientName,
  planName,
  finalValue,
  acceptedOption,
  confirming,
}) {
  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next && !confirming) onClose(); }}>
      <ModalContent size="md" onInteractOutside={(e) => e.preventDefault()}>
        <ModalHeader>
          <ModalTitle>Confirmar aprovação do orçamento?</ModalTitle>
          <ModalDescription>
            Esta ação registra a aprovação, gera o financeiro e libera o contrato.
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <dl className="clinical-budget-approval-dl">
            <div>
              <dt>Paciente</dt>
              <dd>{patientName || '—'}</dd>
            </div>
            <div>
              <dt>Valor</dt>
              <dd className="clinical-budget-approval-value">{formatCurrencyBRL(finalValue)}</dd>
            </div>
            <div>
              <dt>Condição escolhida</dt>
              <dd>{formatPaymentOptionLabel(acceptedOption)}</dd>
            </div>
          </dl>
          <ul className="clinical-budget-approval-checklist">
            <li><CheckCircle2 size={16} /> Gerar financeiro automaticamente</li>
            <li><CheckCircle2 size={16} /> Liberar contrato</li>
            <li><CheckCircle2 size={16} /> Registrar histórico</li>
          </ul>
        </ModalBody>
        <ModalFooter>
          <button type="button" className="button secondary" onClick={onClose} disabled={confirming}>
            Cancelar
          </button>
          <button type="button" className="button primary" onClick={onConfirm} disabled={confirming}>
            {confirming ? 'Aprovando…' : 'Confirmar aprovação'}
          </button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
