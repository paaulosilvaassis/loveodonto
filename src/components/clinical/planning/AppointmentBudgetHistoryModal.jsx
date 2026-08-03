import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
} from '../../ui/Modal.jsx';
import { BudgetStatusBadge } from '../budget/BudgetStatusBadge.jsx';
import { formatCurrencyBRL } from '../../../utils/currency.js';
import { formatFriendlyBudgetNumber } from '../../../utils/friendlyNumbers.js';
import { BUDGET_STATUS } from '../../../services/clinicalBudgetConstants.js';

export function AppointmentBudgetHistoryModal({
  open,
  onClose,
  items = [],
}) {
  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>Histórico de orçamentos</ModalTitle>
        </ModalHeader>
        <ModalBody>
          {!items.length ? (
            <p className="text-sm text-[var(--color-text-muted)]">Nenhum orçamento anterior registrado.</p>
          ) : (
            <ul className="clinical-budget-history-list">
              {items.map((item) => (
                <li key={item.id} className="clinical-budget-history-item">
                  <div>
                    <strong>{formatFriendlyBudgetNumber(item.budgetNumber, 1)}</strong>
                    <BudgetStatusBadge status={item.status || BUDGET_STATUS.HISTORICO} />
                  </div>
                  <div className="clinical-budget-history-meta">
                    <span>{formatCurrencyBRL(item.totalValue || 0)}</span>
                    <span>
                      {item.archivedAt
                        ? new Date(item.archivedAt).toLocaleString('pt-BR')
                        : item.createdAt
                          ? new Date(item.createdAt).toLocaleString('pt-BR')
                          : '—'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ModalBody>
        <ModalFooter>
          <button type="button" className="button secondary" onClick={onClose}>
            Fechar
          </button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
