import {
  ModalRoot, ModalContent, ModalHeader, ModalBody, ModalTitle,
} from '../../ui/Modal.jsx';
import { formatBudgetEventLabel } from './budgetEventLabels.js';

export function BudgetHistoryModal({ open, onClose, events = [] }) {
  const visible = events
    .map((event) => ({ event, label: formatBudgetEventLabel(event) }))
    .filter((item) => item.label);

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>Histórico do orçamento</ModalTitle>
        </ModalHeader>
        <ModalBody>
          {visible.length === 0 ? (
            <p className="budget-tab-muted">Nenhum registro ainda.</p>
          ) : (
            <ul className="budget-tab-history-list">
              {visible.map(({ event, label }) => (
                <li key={event.id}>
                  <time dateTime={event.timestamp}>
                    {new Date(event.timestamp).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          )}
        </ModalBody>
      </ModalContent>
    </ModalRoot>
  );
}
